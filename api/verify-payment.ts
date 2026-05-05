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
    .select('id, credits, price, mp_preference_id, status')
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

  if (!purchase.mp_preference_id) {
    return res.status(200).json({ ok: false, reason: 'no_preference_id' });
  }

  // Search for the payment in MP API by preference_id
  // When MP redirects with auto_return='approved', payment is confirmed
  const mpRes = await fetch(
    `https://api.mercadopago.com/v1/payments/search?preference_id=${purchase.mp_preference_id}&sort=date_created&criteria=desc&limit=1`,
    { headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` } }
  );

  if (!mpRes.ok) {
    const body = await mpRes.text();
    console.error(`[verify-payment] MP API error: ${mpRes.status} — ${body}`);
    return res.status(200).json({ ok: false, reason: 'mp_api_error' });
  }

  const { results } = await mpRes.json();
  const payment = results?.[0];

  console.log(`[verify-payment] user=${user_id} preference=${purchase.mp_preference_id} mp_status=${payment?.status ?? 'not_found'}`);

  if (!payment || payment.status !== 'approved') {
    return res.status(200).json({ ok: false, reason: `payment_${payment?.status ?? 'not_found'}` });
  }

  // Idempotency: check if this payment was already applied
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

  // Get current credits
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

  // Apply credits
  const { error: creditErr } = await supabase
    .from('profiles')
    .update({ credits: newCredits })
    .eq('id', user_id);

  if (creditErr) {
    console.error('[verify-payment] Failed to update credits:', creditErr.message);
    return res.status(500).json({ error: 'Failed to update credits' });
  }

  // Mark purchase as approved
  await supabase
    .from('purchases')
    .update({
      status: 'approved',
      mp_payment_id: String(payment.id),
      price: payment.transaction_amount ?? purchase.price,
    })
    .eq('id', purchase.id);

  console.log(`[verify-payment] ✓ user=${user_id} +${creditsToAdd} credits → total=${newCredits} payment=${payment.id}`);

  return res.status(200).json({ ok: true, credits_added: creditsToAdd, new_total: newCredits });
}
