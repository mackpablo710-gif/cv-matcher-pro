/**
 * /api/campus-import-students
 *
 * Imports students from Excel upload into a university.
 * Creates Supabase Auth accounts for new students and sends invitation emails.
 * For existing accounts, just enrolls them in the university.
 *
 * Authorized callers:
 *   - Super admin (profiles.is_admin = true) → any university
 *   - Coordinator (university_users.role = 'coordinator', active = true) → only their university
 *
 * POST body:
 *   { admin_user_id, university_id, students: [{name, email, program, cohort, company, job_title}] }
 *
 * Returns:
 *   { ok: true, created: number, enrolled: number, skipped: number, errors: string[] }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

interface StudentRow {
  name:      string;
  email:     string;
  program:   string;
  cohort?:   string;
  company?:  string;
  job_title?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const body = req.body ?? {};

  // ── Action: create community post (bypasses RLS using service role) ──────────
  if (body.action === 'create_post') {
    const { user_id, university_id: uni_id, post_type, category, title, body: postBody, tags, needs, startup_stage, status } = body;
    if (!user_id || !uni_id || !title || !post_type)
      return res.status(400).json({ error: 'Missing required fields' });

    const [{ data: enrollment }, { data: prof }] = await Promise.all([
      supabase.from('university_users').select('id').eq('user_id', user_id).eq('university_id', uni_id).eq('active', true).maybeSingle(),
      supabase.from('profiles').select('is_admin').eq('id', user_id).maybeSingle(),
    ]);
    if (!enrollment && !prof?.is_admin)
      return res.status(403).json({ error: 'Not enrolled in this university' });

    const { data, error } = await supabase.from('community_posts').insert({
      user_id, university_id: uni_id, post_type,
      category:      post_type === 'marketplace' ? (category || null) : null,
      title:         String(title).trim(),
      body:          postBody ? String(postBody).trim() || null : null,
      tags:          Array.isArray(tags)  ? tags  : [],
      needs:         Array.isArray(needs) ? needs : [],
      startup_stage: startup_stage || null,
      status:        status || 'active',
    }).select().single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true, post: data });
  }

  // ── Action: import students (original behaviour) ─────────────────────────────
  const { admin_user_id, university_id, students } = body;

  if (!admin_user_id || !university_id || !Array.isArray(students)) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Validate caller: super admin OR coordinator of this specific university
  const { data: actorProfile } = await supabase
    .from('profiles').select('is_admin').eq('id', admin_user_id).single();

  if (!actorProfile?.is_admin) {
    const { data: coordEntry } = await supabase
      .from('university_users')
      .select('id')
      .eq('user_id',       admin_user_id)
      .eq('university_id', university_id)
      .eq('role',          'coordinator')
      .eq('active',        true)
      .maybeSingle();

    if (!coordEntry) {
      return res.status(403).json({ error: 'Not authorized for this university' });
    }
  }

  // Validate university exists
  const { data: uni } = await supabase
    .from('universities')
    .select('id, name, credits_per_month')
    .eq('id', university_id)
    .eq('active', true)
    .single();
  if (!uni) return res.status(404).json({ error: 'University not found' });

  let created = 0;
  let enrolled = 0;
  let skipped  = 0;
  const errors: string[] = [];

  for (const row of students as StudentRow[]) {
    const email     = row.email?.trim().toLowerCase();
    const name      = row.name?.trim();
    const prog      = row.program?.trim()   || null;
    const cohort    = row.cohort?.trim()    || null;
    const company   = row.company?.trim()   || null;
    const job_title = row.job_title?.trim() || null;

    if (!email || !email.includes('@')) {
      errors.push(`invalid_email:${email}`);
      continue;
    }

    try {
      // Check if profile already exists
      const { data: existingProfile } = await supabase
        .from('profiles').select('id').eq('email', email).maybeSingle();

      let userId: string;

      if (existingProfile) {
        userId = existingProfile.id;
        // Update name only if not set
        if (name) {
          await supabase.from('profiles')
            .update({ full_name: name })
            .eq('id', userId)
            .is('full_name', null);
        }
      } else {
        // New user — send invitation email (Supabase handles it)
        const { data: invited, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
          data: { full_name: name || email.split('@')[0] },
          redirectTo: 'https://cvjob.cl',
        });

        if (inviteErr || !invited?.user) {
          errors.push(`invite_failed:${email}:${inviteErr?.message}`);
          continue;
        }

        userId = invited.user.id;

        await supabase.from('profiles').upsert({
          id:        userId,
          email,
          full_name: name || null,
          credits:   uni.credits_per_month || 5,
          is_admin:  false,
        }, { onConflict: 'id' });

        created++;
      }

      // Check if already enrolled
      const { data: existing } = await supabase
        .from('university_users')
        .select('id, active')
        .eq('user_id', userId)
        .eq('university_id', university_id)
        .maybeSingle();

      if (existing) {
        if (!existing.active) {
          // Re-activate + update extra fields
          await supabase.from('university_users').update({
            active: true,
            career:    prog,
            cohort:    cohort,
            company:   company,
            job_title: job_title,
          }).eq('id', existing.id);
          enrolled++;
        } else {
          skipped++;
        }
        continue;
      }

      // Enroll in university with all fields
      const { error: enrollErr } = await supabase.from('university_users').insert({
        university_id,
        user_id:   userId,
        role:      'student',
        active:    true,
        career:    prog,
        cohort:    cohort,
        company:   company,
        job_title: job_title,
      });

      if (enrollErr) {
        errors.push(`enroll_failed:${email}:${enrollErr.message}`);
        continue;
      }

      enrolled++;
      console.log(`[campus-import] enrolled ${email} → ${uni.name}`);

    } catch (e: any) {
      errors.push(`error:${email}:${e?.message}`);
    }
  }

  console.log(`[campus-import] Done — created=${created} enrolled=${enrolled} skipped=${skipped} errors=${errors.length}`);
  return res.status(200).json({ ok: true, created, enrolled, skipped, errors });
}
