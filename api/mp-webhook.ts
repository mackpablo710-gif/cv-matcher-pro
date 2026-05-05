import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Signature validation ─────────────────────────────────────────────────────
// Returns null if valid, or an error string if invalid.
function validateSignature(req: VercelRequest): string | null {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    // No secret configured — hard fail in all environments.
    // Never allow credits to be granted without a validated secret.
    return 'MP_WEBHOOK_SECRET is not configured';
  }

  const signature = req.headers['x-signature'] as string | undefined;
  const requestId = req.headers['x-request-id'] as string | undefined;

  if (!signature || !requestId) {
    return `Missing signature headers (x-signature=${!!signature}, x-request-id=${!!requestId})`;
  }

  // Parse "ts=1234567890,v1=<hex>" — safe for hex values that never contain '='
  const parts: Record<string, string> = {};
  for (const part of signature.split(',')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    parts[part.slice(0, idx)] = part.slice(idx + 1);
  }

  const ts = parts['ts'];
  const receivedHash = parts['v1'];

  if (!ts || !receivedHash) {
    return `Malformed x-signature header: ${signature}`;
  }

  // data.id comes from query string or body depending on MP version
  const dataId = (
    (req.query?.['data.id'] as string) || String(req.body?.data?.id || '')
  );

  if (!dataId) {
    return 'Cannot determine data.id for signature manifest';
  }

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expectedHash = crypto
    .createHmac('sha256', secret)
    .update(manifest)
    .digest('hex');

  // timingSafeEqual requires same-length buffers
  if (expectedHash.length !== receivedHash.length) {
    return 'Signature length mismatch — likely wrong secret or tampered request';
  }

  const valid = crypto.timingSafeEqual(
    Buffer.from(expectedHash, 'hex'),
    Buffer.from(receivedHash, 'hex')
  );

  if (!valid) {
    return 'Signature mismatch — request rejected';
  }

  return null; // valid
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ── Requirement 1: POST only ──────────────────────────────────────────────
  if (req.method !== 'POST') return res.status(405).end();

  // ── Requirements 2-4: Validate signature — hard fail on any error ─────────
  const sigError = validateSignature(req);
  if (sigError) {
    console.error(`[mp-webhook] REJECTED — ${sigError}`);
    return res.status(401).json({ error: 'Unauthorized', reason: sigError });
  }

  const { type, data } = req.body ?? {};

  // Only process payment notifications; acknowledge everything else silently
  if (type !== 'payment' || !data?.id) {
    console.log(`[mp-webhook] Skipped — type=${type} data.id=${data?.id ?? 'none'}`);
    return res.status(200).json({ received: true, skipped: 'not_a_payment' });
  }

  const paymentId = String(data.id);

  try {
    // ── Requirement 12: Warn if using a test access token ─────────────────
    const accessToken = process.env.MP_ACCESS_TOKEN ?? '';
    if (accessToken.startsWith('TEST-')) {
      console.warn('[mp-webhook] WARNING: MP_ACCESS_TOKEN looks like a TEST credential');
    }

    // ── Requirement 5: Fetch the real payment from MP API ─────────────────
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!mpRes.ok) {
      const body = await mpRes.text();
      console.error(`[mp-webhook] MP API error fetching payment ${paymentId}: HTTP ${mpRes.status} — ${body}`);
      // Do NOT acredit anything — return 500 so MP retries
      return res.status(500).json({ error: 'Could not fetch payment from Mercado Pago' });
    }

    const payment = await mpRes.json();

    console.log(
      `[mp-webhook] payment_id=${paymentId} status=${payment.status}` +
      ` external_reference=${payment.external_reference} amount=${payment.transaction_amount}`
    );

    // ── Map MP status to internal status ─────────────────────────────────
    // MP statuses: approved | pending | in_process | rejected | cancelled | refunded | charged_back
    const statusMap: Record<string, string> = {
      approved:     'approved',
      pending:      'processing',   // MP is processing (bank transfer, etc.)
      in_process:   'processing',
      rejected:     'no_completado',
      cancelled:    'no_completado',
      refunded:     'no_completado',
      charged_back: 'no_completado',
    };
    const internalStatus = statusMap[payment.status] ?? payment.status;

    // ── Only continue for approved payments ───────────────────────────────
    if (payment.status !== 'approved') {
      if (payment.preference_id) {
        const { error } = await supabase
          .from('purchases')
          .update({ status: internalStatus, mp_payment_id: paymentId })
          .eq('mp_preference_id', payment.preference_id)
          .in('status', ['initiated', 'pending', 'processing']);
        if (error) {
          console.error(`[mp-webhook] Failed to update status for preference ${payment.preference_id}:`, error.message);
        }
      }
      console.log(`[mp-webhook] Not approved — payment_id=${paymentId} mp_status=${payment.status} → ${internalStatus}`);
      return res.status(200).json({ received: true, skipped: `payment_${payment.status}` });
    }

    // ── Requirement 7: Identify user and package from external_reference ──
    const [userId, packageId] = (payment.external_reference ?? '').split('::');
    if (!userId || !packageId) {
      console.error(
        `[mp-webhook] Invalid external_reference="${payment.external_reference}" for payment ${paymentId}`
      );
      // Return 200 so MP does not retry — nothing we can do without a valid reference
      return res.status(200).json({ received: true, skipped: 'invalid_reference' });
    }

    // ── Requirement 9: Idempotency — skip if already processed ───────────
    const { data: duplicate } = await supabase
      .from('purchases')
      .select('id')
      .eq('mp_payment_id', paymentId)
      .eq('status', 'approved')
      .maybeSingle();

    if (duplicate) {
      console.log(`[mp-webhook] Already processed payment_id=${paymentId} — skipping`);
      return res.status(200).json({ received: true, skipped: 'already_processed' });
    }

    // ── Find the purchase record created by create-preference.ts ─────────
    const { data: purchase, error: purchaseErr } = await supabase
      .from('purchases')
      .select('id, credits, price')
      .eq('mp_preference_id', payment.preference_id)
      .eq('user_id', userId)
      .in('status', ['initiated', 'pending', 'processing'])
      .maybeSingle();

    if (purchaseErr) {
      console.error(`[mp-webhook] DB error finding purchase:`, purchaseErr.message);
      return res.status(500).json({ error: 'DB error' });
    }

    if (!purchase) {
      console.error(
        `[mp-webhook] No purchase record found — preference=${payment.preference_id} user=${userId}`
      );
      // Return 200 so MP stops retrying; log is the signal to investigate
      return res.status(200).json({ received: true, skipped: 'purchase_not_found' });
    }

    // ── Requirement 8: Exact credits for the package ──────────────────────
    const creditsToAdd = Number(purchase.credits);
    if (!creditsToAdd || creditsToAdd <= 0) {
      console.error(`[mp-webhook] Purchase ${purchase.id} has invalid credits=${purchase.credits}`);
      return res.status(200).json({ received: true, skipped: 'invalid_credits_value' });
    }

    // ── Get current profile credits ───────────────────────────────────────
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', userId)
      .single();

    if (profileErr || !profile) {
      console.error(`[mp-webhook] Profile not found for user=${userId}:`, profileErr?.message);
      return res.status(500).json({ error: 'Profile not found' });
    }

    const newCredits = Number(profile.credits ?? 0) + creditsToAdd;

    // ── Requirement 10 + apply credits atomically ─────────────────────────
    // Update credits first; if it fails we abort before marking purchase approved
    const { error: creditsErr } = await supabase
      .from('profiles')
      .update({ credits: newCredits })
      .eq('id', userId);

    if (creditsErr) {
      console.error(`[mp-webhook] CRITICAL: failed to add credits for user=${userId}:`, creditsErr.message);
      return res.status(500).json({ error: 'Failed to update credits' });
    }

    // Mark purchase approved — save mp_payment_id and actual transaction_amount
    const { error: purchaseUpdateErr } = await supabase
      .from('purchases')
      .update({
        status: 'approved',
        mp_payment_id: paymentId,
        price: payment.transaction_amount ?? purchase.price, // use real amount if available
      })
      .eq('id', purchase.id);

    if (purchaseUpdateErr) {
      // Credits already applied — log clearly so it can be reconciled manually
      console.error(
        `[mp-webhook] WARN: credits applied but purchase update failed for purchase=${purchase.id}:`,
        purchaseUpdateErr.message
      );
    }

    // ── Requirement 11: Success log ───────────────────────────────────────
    console.log(
      `[mp-webhook] ✓ APPROVED` +
      ` payment_id=${paymentId}` +
      ` user_id=${userId}` +
      ` credits_added=${creditsToAdd}` +
      ` new_total=${newCredits}` +
      ` amount=${payment.transaction_amount}` +
      ` external_reference=${payment.external_reference}`
    );

    return res.status(200).json({ ok: true, credits_added: creditsToAdd, new_total: newCredits });

  } catch (err: any) {
    console.error(`[mp-webhook] Unhandled error for payment_id=${paymentId}:`, err?.message ?? err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
