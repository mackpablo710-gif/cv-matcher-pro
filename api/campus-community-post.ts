/**
 * /api/campus-community-post
 *
 * Inserts a community post using the service role key, bypassing RLS.
 * Verifies the user is actually enrolled in the target university (or is admin).
 *
 * POST body:
 *   { user_id, university_id, post_type, category?, title, body?, tags?, needs?, startup_stage?, status? }
 *
 * Returns:
 *   { ok: true, post: {...} }  or  { error: string }
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

  const {
    user_id, university_id, post_type,
    category, title, body, tags, needs,
    startup_stage, status,
  } = req.body ?? {};

  if (!user_id || !university_id || !title || !post_type) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Verify user is enrolled in this university OR is admin
  const [{ data: enrollment }, { data: prof }] = await Promise.all([
    supabase
      .from('university_users')
      .select('id')
      .eq('user_id', user_id)
      .eq('university_id', university_id)
      .eq('active', true)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user_id)
      .maybeSingle(),
  ]);

  if (!enrollment && !prof?.is_admin) {
    return res.status(403).json({ error: 'Not enrolled in this university' });
  }

  const { data, error } = await supabase
    .from('community_posts')
    .insert({
      user_id,
      university_id,
      post_type,
      category:      post_type === 'marketplace' ? (category || null) : null,
      title:         String(title).trim(),
      body:          body ? String(body).trim() || null : null,
      tags:          Array.isArray(tags) ? tags : [],
      needs:         Array.isArray(needs) ? needs : [],
      startup_stage: startup_stage || null,
      status:        status || 'active',
    })
    .select()
    .single();

  if (error) {
    console.error('[campus-community-post]', error);
    return res.status(500).json({ error: error.message });
  }

  return res.json({ ok: true, post: data });
}
