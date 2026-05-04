import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Validate MP signature — returns true if secret not configured (dev mode)
function verifySignature(req: VercelRequest): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('MP_WEBHOOK_SECRET not set — skipping signature check');
    return true;
  }

  const signature = req.headers['x-signature'] as string;
  const requestId = req.headers['x-request-id'] as string;

  // MP test notifications may not include signature headers
  if (!signature || !requestId) {
    console.warn('MP webhook: missing signature headers — allowing through');
    return true;
  }

  const parts = Object.fromEntries(signature.split(',').map(p => p.split('=')));
  const ts = parts['ts'];
  const hash = parts['v1'];
  if (!ts || !hash) return true;

  const dataId = (req.query?.['data.id'] || req.body?.data?.id) as string;
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash));
  } catch {
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  // Always respond 200 quickly so MP doesn't retry endlessly
  if (!verifySignature(req)) {
    console.warn('MP webhook: invalid signature — rejecting');
    return res.status(200).json({ received: true, skipped: 'invalid_signature' });
  }

  const { type, data } = req.body;

  // Only process payment notifications
  if (type !== 'payment' || !data?.id) {
    return res.status(200).json({ received: true, skipped: 'not_a_payment' });
  }

  const paymentId = String(data.id);

  try {
    // ── 1. Fetch the real payment from MP API ─────────────────────────────
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
    });

    if (!mpRes.ok) {
      console.error(`MP webhook: could not fetch payment ${paymentId} — status ${mpRes.status}`);
      return res.status(200).json({ received: true, skipped: 'mp_fetch_failed' });
    }

    const payment = await mpRes.json();
    console.log(`MP webhook: payment ${paymentId} status=${payment.status} ref=${payment.external_reference}`);

    // ── 2. Only continue for approved payments ────────────────────────────
    if (payment.status !== 'approved') {
      // Update purchase status if we can identify the record
      if (payment.preference_id) {
        await supabase
          .from('purchases')
          .update({ status: payment.status, mp_payment_id: paymentId })
          .eq('mp_preference_id', payment.preference_id)
          .eq('status', 'pending');
      }
      return res.status(200).json({ received: true, skipped: `payment_${payment.status}` });
    }

    // ── 3. Parse external_reference ───────────────────────────────────────
    const [userId, packageId] = (payment.external_reference || '').split('::');
    if (!userId || !packageId) {
      console.error('MP webhook: invalid external_reference:', payment.external_reference);
      return res.status(200).json({ received: true, skipped: 'invalid_reference' });
    }

    // ── 4. Idempotency: skip if already processed ─────────────────────────
    const { data: alreadyDone } = await supabase
      .from('purchases')
      .select('id, status')
      .eq('mp_payment_id', paymentId)
      .eq('status', 'approved')
      .maybeSingle();

    if (alreadyDone) {
      console.log(`MP webhook: payment ${paymentId} already processed — skipping`);
      return res.status(200).json({ received: true, skipped: 'already_processed' });
    }

    // ── 5. Find the pending purchase record ───────────────────────────────
    const { data: purchase } = await supabase
      .from('purchases')
      .select('id, credits, price')
      .eq('mp_preference_id', payment.preference_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!purchase) {
      console.error(`MP webhook: no pending purchase found for preference ${payment.preference_id} user ${userId}`);
      return res.status(200).json({ received: true, skipped: 'purchase_not_found' });
    }

    // ── 6. Get package credits (use purchase.credits as source of truth) ──
    const creditsToAdd = Number(purchase.credits);
    if (!creditsToAdd || creditsToAdd <= 0) {
      console.error('MP webhook: purchase has no credits value', purchase);
      return res.status(200).json({ received: true, skipped: 'no_credits_value' });
    }

    // ── 7. Get current user credits ───────────────────────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', userId)
      .single();

    if (!profile) {
      console.error(`MP webhook: profile not found for user ${userId}`);
      return res.status(200).json({ received: true, skipped: 'profile_not_found' });
    }

    const newCredits = Number(profile.credits || 0) + creditsToAdd;

    // ── 8. Apply credits + mark purchase approved (both must succeed) ─────
    const [creditsResult, purchaseResult] = await Promise.all([
      supabase.from('profiles').update({ credits: newCredits }).eq('id', userId),
      supabase.from('purchases')
        .update({ status: 'approved', mp_payment_id: paymentId })
        .eq('id', purchase.id),
    ]);

    if (creditsResult.error) {
      console.error('MP webhook: failed to update credits', creditsResult.error);
      return res.status(500).json({ error: 'Failed to update credits' });
    }
    if (purchaseResult.error) {
      console.error('MP webhook: failed to update purchase', purchaseResult.error);
      // Credits were already applied — log but don't fail
    }

    console.log(`MP webhook ✓ user=${userId} +${creditsToAdd} credits → total=${newCredits} payment=${paymentId}`);
    return res.status(200).json({ ok: true, credits_added: creditsToAdd, new_total: newCredits });

  } catch (err: any) {
    console.error('MP webhook error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
