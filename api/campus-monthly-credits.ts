/**
 * /api/campus-monthly-credits
 *
 * Grants monthly credits to all active university students.
 * Called by Vercel Cron on day 1 of every month at 08:00 UTC.
 *
 * Idempotency: campus_credit_grants has UNIQUE(user_id, university_id, month, year)
 * — safe to call multiple times, second call is a no-op.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Allow POST (manual trigger by admin) or GET (Vercel Cron)
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).end();

  // Vercel Cron sends Authorization header — validate it
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // Also allow manual trigger from admin (skip auth check if no secret configured)
    if (req.method === 'POST') {
      const { admin_user_id } = req.body ?? {};
      if (admin_user_id) {
        const { data: admin } = await supabase
          .from('profiles').select('is_admin').eq('id', admin_user_id).single();
        if (!admin?.is_admin) return res.status(403).json({ error: 'Not authorized' });
      } else {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    } else {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const now   = new Date();
  const month = now.getMonth() + 1; // 1-12
  const year  = now.getFullYear();

  console.log(`[campus-credits] Running for ${year}-${month.toString().padStart(2, '0')}`);

  // Get all active universities with their monthly credit amount
  const { data: universities, error: uniErr } = await supabase
    .from('universities')
    .select('id, name, credits_per_month')
    .eq('active', true);

  if (uniErr || !universities?.length) {
    console.log('[campus-credits] No active universities found');
    return res.status(200).json({ ok: true, processed: 0, skipped: 0 });
  }

  let processed = 0;
  let skipped   = 0;
  const errors: string[] = [];

  for (const uni of universities) {
    const creditsToGrant = uni.credits_per_month || 0;
    if (creditsToGrant <= 0) continue;

    // Get all active students in this university
    const { data: members } = await supabase
      .from('university_users')
      .select('user_id')
      .eq('university_id', uni.id)
      .eq('active', true)
      .eq('role', 'student');

    if (!members?.length) continue;

    for (const member of members) {
      const userId = member.user_id;

      // Idempotency check — skip if already granted this month
      const { data: existing } = await supabase
        .from('campus_credit_grants')
        .select('id')
        .eq('user_id', userId)
        .eq('university_id', uni.id)
        .eq('month', month)
        .eq('year', year)
        .maybeSingle();

      if (existing) {
        skipped++;
        continue;
      }

      // Get current credits
      const { data: profile } = await supabase
        .from('profiles').select('credits').eq('id', userId).single();

      if (!profile) { errors.push(`profile_not_found:${userId}`); continue; }

      const newCredits = Number(profile.credits ?? 0) + creditsToGrant;

      // Update credits
      const { error: creditErr } = await supabase
        .from('profiles').update({ credits: newCredits }).eq('id', userId);

      if (creditErr) {
        errors.push(`credit_update_failed:${userId}`);
        continue;
      }

      // Log the grant (idempotency record)
      await supabase.from('campus_credit_grants').insert({
        user_id:         userId,
        university_id:   uni.id,
        month,
        year,
        credits_granted: creditsToGrant,
      });

      processed++;
      console.log(`[campus-credits] +${creditsToGrant} → user=${userId} uni=${uni.name}`);
    }
  }

  console.log(`[campus-credits] Done — processed=${processed} skipped=${skipped} errors=${errors.length}`);
  return res.status(200).json({ ok: true, processed, skipped, errors, month, year });
}
