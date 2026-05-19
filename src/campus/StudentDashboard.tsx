import React, { useEffect, useState } from 'react';
import { Target, Zap, Star, TrendingUp, Clock, CheckCircle2, XCircle, Award } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Application, CareerStats } from './types';
import { KANBAN_COLUMNS } from './types';

function cn(...c: (string | undefined | false)[]) { return c.filter(Boolean).join(' '); }

interface Props {
  userId: string;
  profile: any;
}

export const StudentDashboard: React.FC<Props> = ({ userId, profile }) => {
  const [apps, setApps]   = useState<Application[]>([]);
  const [stats, setStats] = useState<CareerStats | null>(null);
  const [adaptCount, setAdaptCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, [userId]);

  const load = async () => {
    setLoading(true);
    const [appsRes, statsRes, adaptRes] = await Promise.all([
      supabase.from('applications').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('career_stats').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('adaptations').select('id', { count: 'exact', head: true }).eq('user_id', userId).gt('final_score', 0),
    ]);
    setApps(appsRes.data || []);
    setStats(statsRes.data);
    setAdaptCount(adaptRes.count || 0);
    setLoading(false);
  };

  const total       = apps.length;
  const interviews  = apps.filter(a => ['interview','final_interview'].includes(a.status)).length;
  const offers      = apps.filter(a => a.status === 'offer').length;
  const hired       = apps.filter(a => a.status === 'hired').length;
  const rejected    = apps.filter(a => a.status === 'rejected').length;
  const interviewRate = total > 0 ? Math.round((interviews / total) * 100) : 0;

  // Career Score: weighted metric
  const careerScore = Math.min(100, Math.round(
    (adaptCount * 4) +
    (total * 2) +
    (interviews * 8) +
    (offers * 15) +
    (hired * 25) +
    ((stats?.avg_match_score || 0) * 0.3)
  ));

  const recentApps = apps.slice(0, 5);

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-zinc-400">Cargando...</div>
  );

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h2 className="text-2xl font-black text-zinc-900">
          Hola, {profile?.full_name?.split(' ')[0] || 'estudiante'} 👋
        </h2>
        <p className="text-zinc-500 mt-1">Aquí está el resumen de tu proceso de búsqueda</p>
      </div>

      {/* Career Score hero */}
      <div className="bg-gradient-to-br from-indigo-600 to-violet-600 rounded-3xl p-6 text-white flex items-center gap-6">
        <div className="relative w-24 h-24 shrink-0">
          <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
            <circle cx="48" cy="48" r="40" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="8" />
            <circle cx="48" cy="48" r="40" fill="none" stroke="white" strokeWidth="8"
              strokeDasharray={`${2 * Math.PI * 40}`}
              strokeDashoffset={`${2 * Math.PI * 40 * (1 - careerScore / 100)}`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl font-black">{careerScore}</span>
          </div>
        </div>
        <div>
          <p className="text-white/70 text-sm font-medium uppercase tracking-wider">Career Score</p>
          <p className="text-3xl font-black mt-1">{
            careerScore >= 80 ? '🚀 Excelente' :
            careerScore >= 60 ? '💪 Muy Bien' :
            careerScore >= 40 ? '📈 En camino' : '🌱 Comenzando'
          }</p>
          <p className="text-white/70 text-sm mt-1">
            Basado en {total} postulación{total !== 1 ? 'es' : ''}, {adaptCount} CV{adaptCount !== 1 ? 's' : ''} adaptado{adaptCount !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Postulaciones', value: total,         icon: Target,       color: 'text-blue-600',    bg: 'bg-blue-50' },
          { label: 'Entrevistas',   value: interviews,    icon: Clock,        color: 'text-amber-600',   bg: 'bg-amber-50' },
          { label: 'Ofertas',       value: offers,        icon: Award,        color: 'text-indigo-600',  bg: 'bg-indigo-50' },
          { label: 'Contratado',    value: hired,         icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
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

      {/* Interview rate + CVs adapted */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-zinc-100 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-zinc-700">Tasa de entrevistas</p>
            <TrendingUp className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="text-4xl font-black text-indigo-600">{interviewRate}%</p>
          <div className="mt-3 h-2 bg-zinc-100 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${interviewRate}%` }} />
          </div>
          <p className="text-xs text-zinc-400 mt-2">{interviews} entrevistas de {total} postulaciones</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-zinc-100 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-zinc-700">CVs adaptados con IA</p>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-4xl font-black text-amber-600">{adaptCount}</p>
          <p className="text-xs text-zinc-400 mt-2">Créditos disponibles: <span className="font-bold text-zinc-700">{profile?.credits ?? 0}</span></p>
        </div>
      </div>

      {/* Recent applications */}
      {recentApps.length > 0 && (
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-zinc-100">
            <h3 className="font-black text-zinc-900">Postulaciones recientes</h3>
          </div>
          <div className="divide-y divide-zinc-50">
            {recentApps.map(app => {
              const col = KANBAN_COLUMNS.find(c => c.id === app.status);
              return (
                <div key={app.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-zinc-900 truncate">{app.position}</p>
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

      {total === 0 && (
        <div className="text-center py-12 text-zinc-400">
          <Target className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Aún no tienes postulaciones registradas</p>
          <p className="text-sm">Ve al Kanban para agregar tu primera postulación</p>
        </div>
      )}
    </div>
  );
};
