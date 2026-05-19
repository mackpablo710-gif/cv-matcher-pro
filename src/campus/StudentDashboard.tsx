import React, { useEffect, useState } from 'react';
import {
  Plus, CreditCard, FileText, MessageSquare, ClipboardList,
  Target, Zap, Clock, CheckCircle2, Award, TrendingUp, ChevronRight
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Application } from './types';
import { KANBAN_COLUMNS } from './types';

function cn(...c: (string | undefined | false)[]) { return c.filter(Boolean).join(' '); }

interface Props {
  userId: string;
  profile: any;
  onNewAdaptation: () => void;
  onViewAdaptations: () => void;
  onViewInterviews: () => void;
  onViewApplications: () => void;
}

export const StudentDashboard: React.FC<Props> = ({
  userId, profile,
  onNewAdaptation, onViewAdaptations, onViewInterviews, onViewApplications,
}) => {
  const [apps, setApps]         = useState<Application[]>([]);
  const [adaptCount, setAdaptCount] = useState(0);
  const [loading, setLoading]   = useState(true);
  const [showCredits, setShowCredits] = useState(false);

  useEffect(() => { load(); }, [userId]);

  const load = async () => {
    setLoading(true);
    const [appsRes, adaptRes] = await Promise.all([
      supabase.from('applications').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('adaptations').select('id', { count: 'exact', head: true }).eq('user_id', userId).gt('final_score', 0),
    ]);
    setApps(appsRes.data || []);
    setAdaptCount(adaptRes.count || 0);
    setLoading(false);
  };

  const credits      = profile?.credits ?? 0;
  const total        = apps.length;
  const interviews   = apps.filter(a => ['interview', 'final_interview'].includes(a.status)).length;
  const offers       = apps.filter(a => a.status === 'offer').length;
  const hired        = apps.filter(a => a.status === 'hired').length;
  const interviewRate = total > 0 ? Math.round((interviews / total) * 100) : 0;

  // Career Score
  const careerScore = Math.min(100, Math.round(
    (adaptCount * 4) + (total * 2) + (interviews * 8) + (offers * 15) + (hired * 25)
  ));

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-zinc-400">Cargando...</div>
  );

  // ── Action cards ─────────────────────────────────────────────────────────────
  const actions = [
    {
      icon: Plus,
      label: 'Nueva adaptación',
      desc: 'Adapta tu CV a un cargo específico',
      color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100',
      badge: null,
      onClick: onNewAdaptation,
    },
    {
      icon: CreditCard,
      label: 'Créditos disponibles',
      desc: 'Ver tu saldo de créditos',
      color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100',
      badge: String(credits),
      badgeColor: credits > 0 ? 'bg-emerald-600 text-white' : 'bg-red-100 text-red-600',
      onClick: () => setShowCredits(true),
    },
    {
      icon: FileText,
      label: 'CVs adaptados',
      desc: 'Ver tu historial de adaptaciones',
      color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100',
      badge: String(adaptCount),
      badgeColor: 'bg-blue-600 text-white',
      onClick: onViewAdaptations,
    },
    {
      icon: MessageSquare,
      label: 'Preparación de entrevistas',
      desc: 'Practica con preguntas específicas',
      color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100',
      badge: null,
      onClick: onViewInterviews,
    },
    {
      icon: ClipboardList,
      label: 'Historial de postulaciones',
      desc: 'Seguimiento de tus postulaciones',
      color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100',
      badge: total > 0 ? String(total) : null,
      badgeColor: 'bg-amber-500 text-white',
      onClick: onViewApplications,
    },
  ];

  return (
    <div className="space-y-8">

      {/* Welcome */}
      <div>
        <h2 className="text-2xl font-black text-zinc-900">
          Hola, {profile?.full_name?.split(' ')[0] || 'estudiante'} 👋
        </h2>
        <p className="text-zinc-500 mt-1">¿Qué quieres hacer hoy?</p>
      </div>

      {/* ── Action cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {actions.map(a => (
          <button
            key={a.label}
            onClick={a.onClick}
            className={cn(
              'group text-left bg-white rounded-2xl p-5 border-2 shadow-sm transition-all',
              'hover:shadow-md hover:-translate-y-0.5 active:translate-y-0',
              a.border
            )}
          >
            <div className="flex items-start justify-between mb-4">
              <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center', a.bg)}>
                <a.icon className={cn('w-5 h-5', a.color)} />
              </div>
              <div className="flex items-center gap-2">
                {a.badge !== null && (
                  <span className={cn('text-xs font-black px-2 py-0.5 rounded-full', a.badgeColor)}>
                    {a.badge}
                  </span>
                )}
                <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-500 transition-colors" />
              </div>
            </div>
            <p className="font-black text-zinc-900 text-sm">{a.label}</p>
            <p className="text-xs text-zinc-400 mt-0.5">{a.desc}</p>
          </button>
        ))}
      </div>

      {/* ── Career Score ─────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-indigo-600 to-violet-600 rounded-3xl p-6 text-white flex items-center gap-6">
        <div className="relative w-20 h-20 shrink-0">
          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="7" />
            <circle cx="40" cy="40" r="34" fill="none" stroke="white" strokeWidth="7"
              strokeDasharray={`${2 * Math.PI * 34}`}
              strokeDashoffset={`${2 * Math.PI * 34 * (1 - careerScore / 100)}`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xl font-black">{careerScore}</span>
          </div>
        </div>
        <div>
          <p className="text-white/70 text-xs font-bold uppercase tracking-wider">Career Score</p>
          <p className="text-2xl font-black mt-0.5">
            {careerScore >= 80 ? '🚀 Excelente' :
             careerScore >= 60 ? '💪 Muy bien' :
             careerScore >= 40 ? '📈 En camino' : '🌱 Comenzando'}
          </p>
          <p className="text-white/70 text-sm mt-1">
            {total} postulación{total !== 1 ? 'es' : ''} · {adaptCount} CV{adaptCount !== 1 ? 's' : ''} adaptado{adaptCount !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* ── Stats row ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Postulaciones', value: total,      icon: Target,       color: 'text-blue-600',    bg: 'bg-blue-50' },
          { label: 'Entrevistas',   value: interviews,  icon: Clock,        color: 'text-amber-600',   bg: 'bg-amber-50' },
          { label: 'Ofertas',       value: offers,      icon: Award,        color: 'text-indigo-600',  bg: 'bg-indigo-50' },
          { label: 'Contratado',    value: hired,       icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-4 border border-zinc-100 shadow-sm">
            <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center mb-3', s.bg)}>
              <s.icon className={cn('w-4 h-4', s.color)} />
            </div>
            <p className="text-2xl font-black text-zinc-900">{s.value}</p>
            <p className="text-xs text-zinc-500 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Interview rate ───────────────────────────────────────────────────── */}
      {total > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-zinc-100 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-zinc-700">Tasa de entrevistas</p>
            <TrendingUp className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="text-4xl font-black text-indigo-600">{interviewRate}%</p>
          <div className="mt-3 h-2 bg-zinc-100 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${interviewRate}%` }} />
          </div>
          <p className="text-xs text-zinc-400 mt-2">{interviews} entrevista{interviews !== 1 ? 's' : ''} de {total} postulaciones</p>
        </div>
      )}

      {/* ── Recent applications ──────────────────────────────────────────────── */}
      {apps.length > 0 && (
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-zinc-100 flex items-center justify-between">
            <h3 className="font-black text-zinc-900">Postulaciones recientes</h3>
            <button onClick={onViewApplications} className="text-xs font-bold text-indigo-600 hover:underline">
              Ver todas
            </button>
          </div>
          <div className="divide-y divide-zinc-50">
            {apps.slice(0, 5).map(app => {
              const col = KANBAN_COLUMNS.find(c => c.id === app.status);
              return (
                <div key={app.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-zinc-900 text-sm truncate">{app.position}</p>
                    <p className="text-xs text-zinc-500 truncate">{app.company}</p>
                  </div>
                  <span className={cn('shrink-0 text-xs font-bold px-2.5 py-1 rounded-full', col?.bg, col?.color)}>
                    {col?.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Credits modal ────────────────────────────────────────────────────── */}
      {showCredits && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowCredits(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-black text-zinc-900 mb-1">Tus créditos</h3>
            <p className="text-xs text-zinc-400 mb-5">Cada adaptación de CV consume 0.5 créditos</p>
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 text-center mb-5">
              <p className="text-5xl font-black text-emerald-600">{credits}</p>
              <p className="text-sm text-emerald-700 font-semibold mt-1">
                crédito{credits !== 1 ? 's' : ''} disponible{credits !== 1 ? 's' : ''}
              </p>
              <p className="text-xs text-zinc-400 mt-2">
                Equivale a ~{Math.floor(credits / 0.5)} adaptación{Math.floor(credits / 0.5) !== 1 ? 'es' : ''}
              </p>
            </div>
            <button onClick={() => setShowCredits(false)}
              className="w-full py-2.5 text-sm font-bold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-colors">
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
