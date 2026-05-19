/**
 * /api/campus-import-students
 *
 * Imports students from Excel upload into a university.
 * Creates Supabase Auth accounts for new students and sends invitation emails.
 * For existing accounts, just enrolls them in the university.
 *
 * POST body:
 *   { admin_user_id: string, university_id: string, students: [{name, email, program}] }
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
  name: string;
  email: string;
  program: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { admin_user_id, university_id, students } = req.body ?? {};

  if (!admin_user_id || !university_id || !Array.isArray(students)) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Validate admin
  const { data: admin } = await supabase
    .from('profiles').select('is_admin').eq('id', admin_user_id).single();
  if (!admin?.is_admin) return res.status(403).json({ error: 'Not authorized' });

  // Validate university exists
  const { data: uni } = await supabase
    .from('universities').select('id, name, credits_per_month').eq('id', university_id).eq('active', true).single();
  if (!uni) return res.status(404).json({ error: 'University not found' });

  let created = 0;
  let enrolled = 0;
  let skipped  = 0;
  const errors: string[] = [];

  for (const row of students as StudentRow[]) {
    const email = row.email?.trim().toLowerCase();
    const name  = row.name?.trim();
    const prog  = row.program?.trim() || null;

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

        // Update name if not set
        if (name) {
          await supabase.from('profiles')
            .update({ full_name: name })
            .eq('id', userId)
            .is('full_name', null); // only update if null
        }
      } else {
        // Create new Auth user via invite — Supabase sends welcome email automatically
        const { data: invited, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
          data: { full_name: name || email.split('@')[0] },
          redirectTo: 'https://cvjob.cl',
        });

        if (inviteErr || !invited?.user) {
          errors.push(`invite_failed:${email}:${inviteErr?.message}`);
          continue;
        }

        userId = invited.user.id;

        // Create profile
        await supabase.from('profiles').upsert({
          id: userId,
          email,
          full_name: name || null,
          credits: uni.credits_per_month || 5,
          is_admin: false,
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
          // Re-activate
          await supabase.from('university_users')
            .update({ active: true, career: prog || undefined })
            .eq('id', existing.id);
          enrolled++;
        } else {
          skipped++;
        }
        continue;
      }

      // Enroll in university
      const { error: enrollErr } = await supabase.from('university_users').insert({
        university_id,
        user_id: userId,
        role: 'student',
        career: prog,
        active: true,
      });

      if (enrollErr) {
        errors.push(`enroll_failed:${email}`);
        continue;
      }

      enrolled++;
      console.log(`[campus-import] enrolled ${email} → ${uni.name} (${prog || 'no program'})`);

    } catch (e: any) {
      errors.push(`error:${email}:${e?.message}`);
    }
  }

  console.log(`[campus-import] Done — created=${created} enrolled=${enrolled} skipped=${skipped} errors=${errors.length}`);
  return res.status(200).json({ ok: true, created, enrolled, skipped, errors });
}
