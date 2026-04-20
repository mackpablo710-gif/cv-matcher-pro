import type { VercelRequest, VercelResponse } from '@vercel/node';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Service role — backend only
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const mp = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN!,
});

function verifySignature(req: VercelRequest): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return false;

  const signature = req.headers['x-signature'] as string;
  const requestId = req.headers['x-request-id'] as string;
  if (!signature || !requestId) return false;

  // MP signature format: ts=...,v1=...
  const parts = Object.fromEntries(signature.split(',').map(p => p.split('=')));
  const ts = parts['ts'];
  const hash = parts['v1'];
  if (!ts || !hash) return false;

  const dataId = req.query?.['data.id'] || req.body?.data?.id;
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  // Verify webhook comes from Mercado Pago
  if (!verifySignature(req)) {
    console.warn('MP webhook: invalid signature');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { type, data } = req.body;

  // Only process payment notifications
  if (type !== 'payment' || !data?.id) {
    return res.status(200).json({ received: true });
  }

  try {
    // Fetch full payment details from MP (never trust webhook body alone)
    const paymentClient = new Payment(mp);
    const payment = await paymentClient.get({ id: data.id });

    if (payment.status !== 'approved') {
      // Update purchase status if exists
      if (payment.external_reference) {
        const [userId] = payment.external_reference.split('::');
        await supabase.from('purchases')
          .update({ status: payment.status, mp_payment_id: String(payment.id) })
          .eq('user_id', userId)
          .eq('mp_preference_id', payment.preference_id);
      }
      return res.status(200).json({ received: true });
    }

    // Payment approved — parse external_reference: userId::packageId::timestamp
    const [userId, packageId] = (payment.external_reference || '').split('::');
    if (!userId || !packageId) {
      console.error('MP webhook: invalid external_reference', payment.external_reference);
      return res.status(200).json({ received: true });
    }

    // Idempotency: check if this payment was already processed
    const { data: existingPayment } = await supabase
      .from('purchases')
      .select('id, status')
      .eq('mp_payment_id', String(payment.id))
      .single();

    if (existingPayment?.status === 'approved') {
      return res.status(200).json({ already_processed: true });
    }

    // Get package credits from DB (authoritative source)
    const { data: pkg } = await supabase
      .from('packages')
      .select('credits')
      .eq('id', packageId)
      .single();

    if (!pkg) {
      console.error('MP webhook: package not found', packageId);
      return res.status(200).json({ received: true });
    }

    // Get current user credits
    const { data: profile } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', userId)
      .single();

    const currentCredits = profile?.credits || 0;
    const newCredits = currentCredits + pkg.credits;

    // Atomic: update credits + mark purchase as approved
    await Promise.all([
      supabase.from('profiles')
        .update({ credits: newCredits })
        .eq('id', userId),
      supabase.from('purchases')
        .update({
          status: 'approved',
          mp_payment_id: String(payment.id),
        })
        .eq('user_id', userId)
        .eq('mp_preference_id', payment.preference_id),
    ]);

    console.log(`MP webhook: +${pkg.credits} credits for user ${userId}`);
    return res.status(200).json({ ok: true });

  } catch (err: any) {
    console.error('MP webhook error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
