import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Service role bypasses RLS — this is intentional so the admin can increase credits
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { admin_user_id, target_user_id, amount, note } = req.body;
  if (!admin_user_id || !target_user_id || !amount) {
    return res.status(400).json({ error: 'Missing params' });
  }

  const credits = Number(amount);
  if (!Number.isFinite(credits) || credits <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  // Verify the requesting user is actually an admin (checked in DB, not frontend)
  const { data: adminProfile } = await supabase
    .from('profiles').select('is_admin').eq('id', admin_user_id).single();
  if (!adminProfile?.is_admin) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  // Get target user's current credits
  const { data: targetProfile, error: profileErr } = await supabase
    .from('profiles').select('credits').eq('id', target_user_id).single();
  if (profileErr || !targetProfile) {
    return res.status(404).json({ error: 'Target user not found' });
  }

  const newCredits = Number(targetProfile.credits ?? 0) + credits;

  // Update credits (service role bypasses the RLS decrease-only policy)
  const { error: updateErr } = await supabase
    .from('profiles').update({ credits: newCredits }).eq('id', target_user_id);
  if (updateErr) {
    console.error('[admin-grant-credits] Failed to update credits:', updateErr.message);
    return res.status(500).json({ error: 'Failed to update credits' });
  }

  // Record in purchases for audit trail
  await supabase.from('purchases').insert({
    user_id: target_user_id,
    credits,
    price: 0,
    status: 'admin_grant',
    note: note || `Otorgado por admin`,
  });

  console.log(
    `[admin-grant-credits] admin=${admin_user_id} → user=${target_user_id}` +
    ` +${credits} credits → total=${newCredits}`
  );

  return res.status(200).json({ ok: true, new_credits: newCredits });
}
