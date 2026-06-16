/**
 * CommunityHub — Shell de Comunidad Campus
 *
 * - Gatea el acceso: si el usuario no tiene perfil community, muestra setup
 * - Una vez con perfil, muestra sub-tabs: Feed | Conexiones | Startups
 * - Filtra por university_id vía RLS en Supabase
 */
import React, { useEffect, useState } from 'react';
import { Users, Flame, Lightbulb, Edit3, ExternalLink, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { CommunityProfile } from '../types';
import { Feed }        from './Feed';
import { Connections } from './Connections';
import { Startups }    from './Startups';

function cn(...c: (string | undefined | false)[]) { return c.filter(Boolean).join(' '); }

type CommTab = 'feed' | 'connections' | 'startups';

const INDUSTRIES = [
  'Retail', 'Finanzas', 'Tecnología', 'Marketing', 'Consultoría',
  'Salud', 'Educación', 'Legal', 'Startup', 'RRHH', 'Logística',
  'Construcción', 'Energía', 'Agro', 'Otro',
];
const LOOKING_FOR = [
  'cofundador', 'desarrollador', 'diseñador', 'mentor',
  'socio comercial', 'inversionista', 'marketing', 'trabajo',
];
const OFFERING = [
  'liderazgo', 'experiencia comercial', 'marketing digital', 'finanzas',
  'tecnología', 'IA', 'retail', 'ventas', 'diseño', 'desarrollo',
  'mentoría', 'legal', 'RRHH',
];

const EMPTY_SETUP = {
  headline: '', industry: '',
  looking_for: [] as string[],
  offering:    [] as string[],
  linkedin_url: '',
};

interface Props {
  userId:       string;
  profile:      any;
  universityId: string | null;
  campusRole:   'student' | 'coordinator' | 'admin';
}

// ── localStorage cache key — prevents repeated join form when RLS blocks SELECT ─
const profileCacheKey = (uid: string) => `cvjob_comm_profile_${uid}`;

export const CommunityHub: React.FC<Props> = ({
  userId, profile, universityId, campusRole,
}) => {
  const [commProfile, setCommProfile] = useState<CommunityProfile | null | undefined>(undefined);
  const [tab,         setTab]         = useState<CommTab>('feed');
  const [editMode,    setEditMode]    = useState(false);
  const [form,        setForm]        = useState({ ...EMPTY_SETUP });
  const [saving,      setSaving]      = useState(false);
  const [saveError,   setSaveError]   = useState('');

  useEffect(() => { loadProfile(); }, [userId]);

  const loadProfile = async () => {
    // ── Step 1: Check localStorage cache first so the form never re-appears ────
    const cacheKey = profileCacheKey(userId);
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as CommunityProfile;
        setCommProfile(parsed);
        setForm({
          headline:     parsed.headline     ?? '',
          industry:     parsed.industry     ?? '',
          looking_for:  parsed.looking_for  ?? [],
          offering:     parsed.offering     ?? [],
          linkedin_url: parsed.linkedin_url ?? '',
        });
      } catch { /* ignore corrupt cache */ }
    }

    // ── Step 2: Try DB (may fail if RLS blocks — that's OK, we have cache) ─────
    const { data } = await supabase
      .from('campus_community_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (data) {
      // Got fresh DB data — update state and refresh cache
      setCommProfile(data);
      localStorage.setItem(cacheKey, JSON.stringify(data));
      setForm({
        headline:     data.headline     ?? '',
        industry:     data.industry     ?? '',
        looking_for:  data.looking_for  ?? [],
        offering:     data.offering     ?? [],
        linkedin_url: data.linkedin_url ?? '',
      });
    } else if (!cached) {
      // No cache AND no DB data → first time, show join form
      setCommProfile(null);
      setForm(f => ({ ...f, headline: profile?.full_name ? `${profile.full_name} · ` : '' }));
    }
    // If cached but DB returned null (RLS block): keep the cached profile, don't reset
  };

  const toggleChip = (arr: string[], val: string) =>
    arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];

  const saveProfile = async () => {
    if (!form.headline.trim() || !form.industry) return;
    setSaving(true);
    setSaveError('');

    const payload = {
      user_id:       userId,
      university_id: universityId,
      headline:      form.headline.trim(),
      industry:      form.industry,
      looking_for:   form.looking_for,
      offering:      form.offering,
      linkedin_url:  form.linkedin_url.trim() || null,
      is_visible:    true,
    };

    // ── Enter community IMMEDIATELY with form data (no waiting for DB) ────────
    const localProfile: CommunityProfile = {
      id:            '',
      user_id:       userId,
      university_id: universityId,
      headline:      payload.headline,
      industry:      payload.industry,
      skills:        [],
      looking_for:   payload.looking_for,
      offering:      payload.offering,
      linkedin_url:  payload.linkedin_url,
      is_visible:    true,
      created_at:    new Date().toISOString(),
    };
    setCommProfile(localProfile);
    // Persist in localStorage so the join form never shows again
    localStorage.setItem(profileCacheKey(userId), JSON.stringify(localProfile));
    setEditMode(false);
    setSaving(false);

    // ── Persist to DB in background (non-blocking) ────────────────────────────
    try {
      const { error } = await supabase
        .from('campus_community_profiles')
        .upsert(payload, { onConflict: 'user_id' });

      if (!error) {
        // Try to upgrade to the real DB row (has proper id, timestamps, etc.)
        const { data } = await supabase
          .from('campus_community_profiles')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();
        if (data) {
          setCommProfile(data);
          // Update cache with real DB row
          localStorage.setItem(profileCacheKey(userId), JSON.stringify(data));
        }
      }
    } catch {
      // Silently ignore — user is already inside the community
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (commProfile === undefined) return (
    <div className="flex items-center justify-center h-64 text-zinc-400">
      <Users className="w-8 h-8 animate-pulse mr-2" />
      <span className="text-sm font-medium">Cargando comunidad...</span>
    </div>
  );

  const isCoordOrAdmin = campusRole === 'coordinator' || campusRole === 'admin';

  // Coordinator / Admin: skip profile setup → go straight to community
  if (isCoordOrAdmin && !editMode && !commProfile) {
    // Fall through to community view with null commProfile (handled below)
  }

  // ── Profile setup / edit form (students only, or when editing) ───────────────
  if ((!commProfile || editMode) && !isCoordOrAdmin) return (
    <div className="max-w-lg mx-auto">
      {!commProfile && (
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-200">
            <Users className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-black text-zinc-900">Únete a la Comunidad</h2>
          <p className="text-zinc-500 text-sm mt-2 max-w-sm mx-auto">
            Conecta con compañeros de MBA, encuentra cofundadores y accede a oportunidades exclusivas.
          </p>
        </div>
      )}
      {editMode && (
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-black text-zinc-900">Editar mi perfil</h2>
          <button onClick={() => setEditMode(false)}
            className="text-xs font-bold text-zinc-400 hover:text-zinc-700 px-3 py-1.5 rounded-lg hover:bg-zinc-100 transition-colors">
            Cancelar
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6 space-y-5">
        {/* Headline */}
        <div>
          <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Titular profesional *</label>
          <input
            value={form.headline}
            onChange={e => setForm(f => ({ ...f, headline: e.target.value }))}
            placeholder="Ej: MBA Executive | Ex-Gerente Comercial BCI"
            autoFocus
            className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
          />
        </div>

        {/* Industry */}
        <div>
          <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Industria principal *</label>
          <select
            value={form.industry}
            onChange={e => setForm(f => ({ ...f, industry: e.target.value }))}
            className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400 bg-white"
          >
            <option value="">Selecciona una industria...</option>
            {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>

        {/* Looking for */}
        <div>
          <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">¿Qué buscas?</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {LOOKING_FOR.map(opt => (
              <button key={opt} type="button"
                onClick={() => setForm(f => ({ ...f, looking_for: toggleChip(f.looking_for, opt) }))}
                className={cn(
                  'text-xs font-semibold px-3 py-1.5 rounded-full border transition-all',
                  form.looking_for.includes(opt)
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-zinc-600 border-zinc-200 hover:border-indigo-300'
                )}>
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* Offering */}
        <div>
          <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">¿Qué ofreces?</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {OFFERING.map(opt => (
              <button key={opt} type="button"
                onClick={() => setForm(f => ({ ...f, offering: toggleChip(f.offering, opt) }))}
                className={cn(
                  'text-xs font-semibold px-3 py-1.5 rounded-full border transition-all',
                  form.offering.includes(opt)
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-zinc-600 border-zinc-200 hover:border-emerald-300'
                )}>
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* LinkedIn */}
        <div>
          <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">LinkedIn (opcional)</label>
          <input
            value={form.linkedin_url}
            onChange={e => setForm(f => ({ ...f, linkedin_url: e.target.value }))}
            placeholder="https://linkedin.com/in/tu-perfil"
            className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
          />
        </div>

        {saveError && (
          <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{saveError}</p>
        )}
        <button
          onClick={saveProfile}
          disabled={saving || !form.headline.trim() || !form.industry}
          className="w-full py-3 text-sm font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Guardando...' : (commProfile ? 'Guardar cambios' : 'Entrar a la Comunidad →')}
        </button>
      </div>
    </div>
  );

  // ── Main community view ──────────────────────────────────────────────────────
  const commTabs = [
    { id: 'feed'        as CommTab, label: 'Feed',        icon: Flame },
    { id: 'connections' as CommTab, label: 'Conexiones',  icon: Users },
    { id: 'startups'    as CommTab, label: 'Startups',    icon: Lightbulb },
  ];

  return (
    <div className="space-y-4">
      {/* Community header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-zinc-900">Comunidad Campus</h2>
          <p className="text-zinc-500 text-sm mt-0.5">
            {isCoordOrAdmin
              ? `Vista ${campusRole === 'admin' ? 'Administrador' : 'Coordinador'} · Toda la comunidad`
              : `Red privada · ${commProfile?.industry ?? ''}${(commProfile?.looking_for?.length ?? 0) > 0 ? ` · Busca: ${commProfile!.looking_for.slice(0, 2).join(', ')}` : ''}`
            }
          </p>
        </div>
        <div className="flex items-center gap-2">
          {commProfile?.linkedin_url && (
            <a href={commProfile.linkedin_url} target="_blank" rel="noopener noreferrer"
              className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition-colors">
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          {!isCoordOrAdmin && (
            <button onClick={() => setEditMode(true)}
              className="flex items-center gap-1.5 text-xs font-bold text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 px-3 py-1.5 rounded-lg transition-colors">
              <Edit3 className="w-3.5 h-3.5" /> Mi perfil
            </button>
          )}
        </div>
      </div>

      {/* Profile chip (students) or coordinator banner */}
      {isCoordOrAdmin ? (
        <div className="bg-gradient-to-r from-slate-800 to-indigo-900 rounded-2xl px-4 py-3 flex items-center gap-3">
          <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 text-indigo-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-white text-sm">{profile?.full_name || 'Coordinador'}</p>
            <p className="text-xs text-slate-400">
              {campusRole === 'admin' ? 'Administrador' : 'Coordinador'} · Acceso completo a la comunidad
            </p>
          </div>
          <span className="text-[10px] font-black text-indigo-300 bg-indigo-900/50 px-2.5 py-1 rounded-full shrink-0 uppercase tracking-wider">
            {campusRole}
          </span>
        </div>
      ) : commProfile && (
        <div className="bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-100 rounded-2xl px-4 py-3 flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-400 to-violet-500 rounded-xl flex items-center justify-center shrink-0">
            <span className="text-sm font-black text-white">
              {(profile?.full_name || 'U')[0].toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-zinc-900 text-sm">{profile?.full_name || 'Tu perfil'}</p>
            <p className="text-xs text-zinc-500 truncate">{commProfile.headline}</p>
          </div>
          <div className="flex gap-1 shrink-0">
            {commProfile.looking_for.slice(0, 2).map(t => (
              <span key={t} className="text-[10px] font-semibold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full hidden sm:block">{t}</span>
            ))}
          </div>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-zinc-100 rounded-xl p-1">
        {commTabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-1.5 flex-1 justify-center py-2 text-sm font-bold rounded-lg transition-all',
              tab === t.id ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
            )}>
            <t.icon className="w-4 h-4" />
            <span className="hidden sm:block">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'feed' && (
        <Feed
          userId={userId}
          universityId={universityId}
          myProfile={commProfile}
          campusRole={campusRole}
        />
      )}
      {tab === 'connections' && (
        <Connections
          userId={userId}
          universityId={universityId}
          myProfile={commProfile}
          campusRole={campusRole}
        />
      )}
      {tab === 'startups' && (
        <Startups
          userId={userId}
          universityId={universityId}
          campusRole={campusRole}
        />
      )}
    </div>
  );
};
