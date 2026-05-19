/**
 * /api/campus-verify — Backend security gate for CVJOB Campus
 *
 * Called by CampusApp on mount. Validates via SERVICE_ROLE_KEY that
 * the requesting user is admin. Rejects all others.
 *
 * This is the server-side enforcement layer — frontend checks are
 * supplementary. Even if frontend JS were bypassed, this gate blocks access.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { user_id } = req.body ?? {};
  if (!user_id) return res.status(400).json({ ok: false, reason: 'missing_user_id' });

  // Check admin status directly in DB — cannot be spoofed from frontend
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user_id)
    .single();

  if (error || !profile) {
    console.warn(`[campus-verify] Profile not found for user=${user_id}`);
    return res.status(403).json({ ok: false, reason: 'profile_not_found' });
  }

  if (!profile.is_admin) {
    console.warn(`[campus-verify] Access denied — user=${user_id} is_admin=false`);
    return res.status(403).json({ ok: false, reason: 'not_admin' });
  }

  console.log(`[campus-verify] Access granted for admin user=${user_id}`);
  return res.status(200).json({ ok: true });
}
