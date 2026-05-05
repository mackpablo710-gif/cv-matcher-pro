import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'Missing user_id' });

  // Find the latest purchase for this user that hasn't been approved yet
  const { data: purchase, error: purchaseErr } = await supabase
    .from('purchases')
    .select('id, credits, price, mp_preference_id, package_id, status')
    .eq('user_id', user_id)
    .in('status', ['initiated', 'pending', 'processing'])
    .gt('price', 0)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (purchaseErr) {
    console.error('[verify-payment] DB error:', purchaseErr.message);
    return res.status(500).json({ error: 'DB error' });
  }

  if (!purchase) {
    console.log(`[verify-payment] No pending purchase for user=${user_id}`);
    return res.status(200).json({ ok: false, reason: 'no_pending_purchase' });
  }

  const accessToken = process.env.MP_ACCESS_TOKEN ?? '';

  // ── Strategy 1: search by external_reference (userId::packageId) ────────────
  // This is the most reliable MP search filter.
  let payment: any = null;

  if (purchase.package_id) {
    const externalRef = `${user_id}::${purchase.package_id}`;
    const mpByRef = await fetch(
      `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(externalRef)}&sort=date_created&criteria=desc&limit=5`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (mpByRef.ok) {
      const { results } = await mpByRef.json();
      // Pick the most recent approved payment, or fall back to any approved one
      payment = results?.find((p: any) => p.status === 'approved') ?? null;
      console.log(
        `[verify-payment] search by external_reference="${externalRef}" → ${results?.length ?? 0} results, approved=${!!payment}`
      );
    } else {
      console.warn(`[verify-payment] external_reference search failed: HTTP ${mpByRef.status}`);
    }
  }

  // ── Strategy 2: fallback — search by preference_id if we have it ────────────
  if (!payment && purchase.mp_preference_id) {
    const mpByPref = await fetch(
      `https://api.mercadopago.com/v1/payments/search?preference_id=${purchase.mp_preference_id}&sort=date_created&criteria=desc&limit=5`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (mpByPref.ok) {
      const { results } = await mpByPref.json();
      payment = results?.find((p: any) => p.status === 'approved') ?? null;
      console.log(
        `[verify-payment] search by preference_id="${purchase.mp_preference_id}" → ${results?.length ?? 0} results, approved=${!!payment}`
      );
    } else {
      const body = await mpByPref.text();
      console.error(`[verify-payment] preference_id search failed: HTTP ${mpByPref.status} — ${body}`);
      return res.status(200).json({ ok: false, reason: 'mp_api_error' });
    }
  }

  if (!payment) {
    console.log(`[verify-payment] No approved payment found for user=${user_id} purchase=${purchase.id}`);
    return res.status(200).json({ ok: false, reason: 'payment_not_approved' });
  }

  // ── Idempotency: skip if this payment was already applied ───────────────────
  const { data: duplicate } = await supabase
    .from('purchases')
    .select('id')
    .eq('mp_payment_id', String(payment.id))
    .eq('status', 'approved')
    .maybeSingle();

  if (duplicate) {
    console.log(`[verify-payment] Payment ${payment.id} already applied — skipping`);
    return res.status(200).json({ ok: true, already_applied: true });
  }

  // ── Get current credits ─────────────────────────────────────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('credits')
    .eq('id', user_id)
    .single();

  if (!profile) {
    console.error(`[verify-payment] Profile not found for user=${user_id}`);
    return res.status(500).json({ error: 'Profile not found' });
  }

  const creditsToAdd = Number(purchase.credits);
  const newCredits = Number(profile.credits ?? 0) + creditsToAdd;

  // ── Apply credits ───────────────────────────────────────────────────────────
  const { error: creditErr } = await supabase
    .from('profiles')
    .update({ credits: newCredits })
    .eq('id', user_id);

  if (creditErr) {
    console.error('[verify-payment] Failed to update credits:', creditErr.message);
    return res.status(500).json({ error: 'Failed to update credits' });
  }

  // ── Mark purchase as approved ───────────────────────────────────────────────
  await supabase
    .from('purchases')
    .update({
      status: 'approved',
      mp_payment_id: String(payment.id),
      price: payment.transaction_amount ?? purchase.price,
    })
    .eq('id', purchase.id);

  console.log(
    `[verify-payment] ✓ user=${user_id} +${creditsToAdd} credits → total=${newCredits}` +
    ` payment=${payment.id} purchase=${purchase.id}`
  );

  return res.status(200).json({ ok: true, credits_added: creditsToAdd, new_total: newCredits });
}
