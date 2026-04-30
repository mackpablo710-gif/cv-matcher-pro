import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { target_user_id, admin_user_id } = req.body;
  if (!target_user_id || !admin_user_id) return res.status(400).json({ error: 'Missing params' });

  // Verify requesting user is admin
  const { data: adminProfile } = await supabase
    .from('profiles').select('is_admin').eq('id', admin_user_id).single();
  if (!adminProfile?.is_admin) return res.status(403).json({ error: 'Not authorized' });

  // Prevent self-deletion
  if (target_user_id === admin_user_id) return res.status(400).json({ error: 'Cannot delete yourself' });

  // Delete from Supabase Auth (cascades to profiles via FK if set, otherwise delete manually)
  const { error: authError } = await supabase.auth.admin.deleteUser(target_user_id);
  if (authError) return res.status(500).json({ error: authError.message });

  // Also clean up profile and adaptations just in case
  await supabase.from('adaptations').delete().eq('user_id', target_user_id);
  await supabase.from('profiles').delete().eq('id', target_user_id);

  return res.status(200).json({ ok: true });
}
