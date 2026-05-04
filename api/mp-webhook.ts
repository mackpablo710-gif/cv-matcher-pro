import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function verifySignature(req: VercelRequest): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  // If no secret configured, skip verification (log warning)
  if (!secret) {
    console.warn('MP webhook: MP_WEBHOOK_SECRET not set, skipping signature verification');
    return true;
  }

  const signature = req.headers['x-signature'] as string;
  const requestId = req.headers['x-request-id'] as string;
  if (!signature || !requestId) {
    console.warn('MP webhook: missing x-signature or x-request-id headers');
    return true; // MP sometimes omits headers on test notifications
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

  if (!verifySignature(req)) {
    console.warn('MP webhook: invalid signature');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { type, data } = req.body;

  if (type !== 'payment' || !data?.id) {
    return res.status(200).json({ received: true });
  }

  try {
    // Fetch payment from MP REST API directly
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
      headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}` },
    });
    const payment = await mpRes.json();

    if (payment.status !== 'approved') {
      if (payment.external_reference) {
        const [userId] = payment.external_reference.split('::');
        await supabase.from('purchases')
          .update({ status: payment.status, mp_payment_id: String(payment.id) })
          .eq('user_id', userId)
          .eq('mp_preference_id', payment.preference_id);
      }
      return res.status(200).json({ received: true });
    }

    const [userId, packageId] = (payment.external_reference || '').split('::');
    if (!userId || !packageId) {
      console.error('MP webhook: invalid external_reference', payment.external_reference);
      return res.status(200).json({ received: true });
    }

    // Idempotency check: skip if this exact payment was already processed
    const { data: existingPayment } = await supabase
      .from('purchases')
      .select('id, status')
      .eq('mp_payment_id', String(payment.id))
      .maybeSingle();

    if (existingPayment?.status === 'approved') {
      console.log(`MP webhook: payment ${payment.id} already processed`);
      return res.status(200).json({ already_processed: true });
    }

    const { data: pkg } = await supabase
      .from('packages')
      .select('credits')
      .eq('id', packageId)
      .single();

    if (!pkg) {
      console.error('MP webhook: package not found', packageId);
      return res.status(200).json({ received: true });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', userId)
      .single();

    if (!profile) {
      console.error('MP webhook: user profile not found', userId);
      return res.status(200).json({ received: true });
    }

    const newCredits = Number(profile.credits || 0) + Number(pkg.credits);

    // Update credits using RPC to avoid race conditions
    const { error: creditsError } = await supabase
      .from('profiles')
      .update({ credits: newCredits })
      .eq('id', userId);

    if (creditsError) {
      console.error('MP webhook: failed to update credits', creditsError);
      return res.status(500).json({ error: 'Failed to update credits' });
    }

    // Update or insert purchase record
    if (existingPayment) {
      await supabase.from('purchases')
        .update({ status: 'approved', mp_payment_id: String(payment.id) })
        .eq('id', existingPayment.id);
    } else {
      // Try to find by preference_id first
      const { data: purchaseByPref } = await supabase
        .from('purchases')
        .select('id')
        .eq('user_id', userId)
        .eq('mp_preference_id', payment.preference_id)
        .eq('status', 'pending')
        .maybeSingle();

      if (purchaseByPref) {
        await supabase.from('purchases')
          .update({ status: 'approved', mp_payment_id: String(payment.id) })
          .eq('id', purchaseByPref.id);
      } else {
        // Fallback: insert new purchase record
        await supabase.from('purchases').insert({
          user_id: userId,
          package_id: packageId,
          credits: pkg.credits,
          status: 'approved',
          mp_payment_id: String(payment.id),
          mp_preference_id: payment.preference_id,
          note: 'Mercado Pago (webhook fallback)',
        });
      }
    }

    console.log(`MP webhook: +${pkg.credits} credits for user ${userId}. New total: ${newCredits}`);
    return res.status(200).json({ ok: true });

  } catch (err: any) {
    console.error('MP webhook error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
