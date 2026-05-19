// ─── CVJOB Campus — TypeScript Types ─────────────────────────────────────────

export interface University {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  plan: 'starter' | 'pro' | 'enterprise';
  credits_per_user: number;
  max_users: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UniversityUser {
  id: string;
  university_id: string;
  user_id: string;
  role: 'student' | 'coordinator' | 'admin';
  career?: string;
  cohort?: string;
  credits_used: number;
  active: boolean;
  enrolled_at: string;
  // Joined from profiles
  profile?: {
    email: string;
    full_name: string;
    credits: number;
    last_active_at?: string;
  };
}

export type ApplicationStatus =
  | 'applied'
  | 'viewed'
  | 'interview'
  | 'final_interview'
  | 'offer'
  | 'hired'
  | 'rejected';

export interface Application {
  id: string;
  user_id: string;
  university_id?: string;
  adaptation_id?: string;
  company: string;
  position: string;
  status: ApplicationStatus;
  notes?: string;
  applied_date: string;
  salary_min?: number;
  salary_max?: number;
  url?: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CareerStats {
  id: string;
  user_id: string;
  university_id?: string;
  career_score: number;
  applications_total: number;
  interviews_total: number;
  offers_total: number;
  hired_total: number;
  avg_match_score: number;
  best_match_score: number;
  cvs_adapted: number;
  last_updated: string;
}

export const KANBAN_COLUMNS: { id: ApplicationStatus; label: string; color: string; bg: string }[] = [
  { id: 'applied',         label: 'Postulado',        color: 'text-blue-600',   bg: 'bg-blue-50' },
  { id: 'viewed',          label: 'Visto',            color: 'text-violet-600', bg: 'bg-violet-50' },
  { id: 'interview',       label: 'Entrevista',       color: 'text-amber-600',  bg: 'bg-amber-50' },
  { id: 'final_interview', label: 'Entrevista Final', color: 'text-orange-600', bg: 'bg-orange-50' },
  { id: 'offer',           label: 'Oferta',           color: 'text-indigo-600', bg: 'bg-indigo-50' },
  { id: 'hired',           label: 'Contratado',       color: 'text-emerald-600',bg: 'bg-emerald-50' },
  { id: 'rejected',        label: 'Rechazado',        color: 'text-red-600',    bg: 'bg-red-50' },
];
