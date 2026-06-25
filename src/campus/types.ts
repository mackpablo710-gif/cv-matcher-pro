// ─── CVJOB Campus — TypeScript Types ─────────────────────────────────────────

export interface University {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  campus_bg_url?: string;   // background photo for the student entry screen
  plan: 'starter' | 'pro' | 'enterprise';
  credits_per_user: number;
  credits_per_month: number;
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
  company?: string;
  job_title?: string;
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

// ─── Community Types ─────────────────────────────────────────────────────────

export interface CommunityProfile {
  id: string;
  user_id: string;
  university_id: string | null;
  headline: string | null;
  industry: string | null;
  skills: string[];
  looking_for: string[];
  offering: string[];
  linkedin_url: string | null;
  is_visible: boolean;
  created_at: string;
  // Joined from profiles
  profile?: { full_name: string; email: string; };
}

export type PostType = 'marketplace' | 'opportunity' | 'startup' | 'team' | 'mentorship' | 'general';

export interface CommunityPost {
  id: string;
  user_id: string;
  university_id: string | null;
  post_type: PostType;
  category: 'busco' | 'ofrezco' | null;
  title: string;
  body: string | null;
  tags: string[];
  needs: string[];
  startup_stage: string | null;
  link_url: string | null;
  status: 'active' | 'closed' | 'hidden';
  likes_count: number;
  comments_count: number;
  created_at: string;
  author?: { full_name: string; email: string; };
}

export interface CampusEvent {
  id: string;
  university_id: string | null;
  created_by: string;
  title: string;
  description: string | null;
  event_type: 'charla' | 'networking' | 'hackathon' | 'reclutamiento' | 'otro';
  event_date: string;
  location: string | null;
  is_online: boolean;
  meeting_url: string | null;
  status: 'upcoming' | 'past' | 'cancelled';
  created_at: string;
}

// ─── Kanban ───────────────────────────────────────────────────────────────────

export const KANBAN_COLUMNS: {
  id: ApplicationStatus; label: string;
  color: string; bg: string; cardBorder: string; dot: string;
}[] = [
  { id: 'applied',         label: 'Postulado',        color: 'text-blue-700',    bg: 'bg-blue-50',    cardBorder: 'border-l-blue-400',    dot: 'bg-blue-400' },
  { id: 'viewed',          label: 'Visto',            color: 'text-violet-700',  bg: 'bg-violet-50',  cardBorder: 'border-l-violet-400',  dot: 'bg-violet-400' },
  { id: 'interview',       label: 'Entrevista',       color: 'text-amber-700',   bg: 'bg-amber-50',   cardBorder: 'border-l-amber-400',   dot: 'bg-amber-400' },
  { id: 'final_interview', label: 'Entrevista Final', color: 'text-orange-700',  bg: 'bg-orange-50',  cardBorder: 'border-l-orange-400',  dot: 'bg-orange-400' },
  { id: 'offer',           label: 'Oferta',           color: 'text-indigo-700',  bg: 'bg-indigo-50',  cardBorder: 'border-l-indigo-400',  dot: 'bg-indigo-400' },
  { id: 'hired',           label: 'Contratado',       color: 'text-emerald-700', bg: 'bg-emerald-50', cardBorder: 'border-l-emerald-400', dot: 'bg-emerald-400' },
  { id: 'rejected',        label: 'Rechazado',        color: 'text-red-700',     bg: 'bg-red-50',     cardBorder: 'border-l-red-400',     dot: 'bg-red-400' },
];
