/**
 * Connections — Conexiones sugeridas
 *
 * Algoritmo de matching basado en:
 *   - Misma industria               → +20 pts
 *   - Mi looking_for ∩ su offering  → +15 pts cada match
 *   - Su looking_for ∩ mi offering  → +10 pts cada match
 *   - Skills en común               → +5 pts cada una (máx 20)
 *
 * Máximo: 99% (100% reservado para IA futura)
 */
import React, { useEffect, useState } from 'react';
import { UserCheck, UserPlus, ExternalLink, RefreshCw, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { CommunityProfile } from '../types';

function cn(...c: (string | undefined | false)[]) { return c.filter(Boolean).join(' '); }

function matchScore(me: CommunityProfile, other: CommunityProfile): number {
  let score = 0;
  if (me.industry && me.industry === other.industry) score += 20;
  for (const w of me.looking_for)  if (other.offering.includes(w))    score += 15;
  for (const w of other.looking_for) if (me.offering.includes(w))     score += 10;
  let sb = 0;
  for (const s of me.skills)       if (other.skills.includes(s))    { sb += 5; }
  score += Math.min(sb, 20);
  return Math.min(score, 99);
}

interface ProfileWithScore extends CommunityProfile { score: number; }

interface Props {
  userId:       string;
  universityId: string | null;
  myProfile:    CommunityProfile | null;  // null for coordinator/admin
  campusRole?:  'student' | 'coordinator' | 'admin';
}

export const Connections: React.FC<Props> = ({ userId, universityId, myProfile, campusRole }) => {
  const [people,     setPeople]     = useState<ProfileWithScore[]>([]);
  const [connected,  setConnected]  = useState<Set<string>>(new Set());
  const [loading,    setLoading]    = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const isCoordOrAdmin = campusRole === 'coordinator' || campusRole === 'admin';

  useEffect(() => { load(); }, [userId, universityId]);

  const load = async () => {
    setLoading(true);
    const [profRes, connRes] = await Promise.all([
      supabase
        .from('campus_community_profiles')
        .select('*, profile:profiles(full_name, email)')
        .eq('is_visible', true)
        .neq('user_id', userId),
      supabase
        .from('community_connections')
        .select('to_user_id')
        .eq('from_user_id', userId),
    ]);
    const all = (profRes.data ?? []) as CommunityProfile[];
    const scored = all
      .map(p => ({ ...p, score: myProfile ? matchScore(myProfile, p) : 0 }))
      .sort((a, b) => b.score - a.score);
    setPeople(scored);
    setConnected(new Set((connRes.data ?? []).map((c: any) => c.to_user_id)));
    setLoading(false);
  };

  const connect = async (toUserId: string) => {
    setConnecting(toUserId);
    await supabase.from('community_connections').upsert(
      { from_user_id: userId, to_user_id: toUserId, status: 'accepted' },
      { onConflict: 'from_user_id,to_user_id' }
    );
    setConnected(prev => new Set([...prev, toUserId]));
    setConnecting(null);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-40 text-zinc-400">
      Cargando conexiones...
    </div>
  );

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-black text-zinc-900">Conexiones sugeridas</h3>
          <p className="text-zinc-500 text-sm">
            {people.length} compañero{people.length !== 1 ? 's' : ''} en tu comunidad · ordenados por compatibilidad
          </p>
        </div>
        <button onClick={load}
          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Empty */}
      {people.length === 0 && (
        <div className="text-center py-16 text-zinc-400">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium text-sm">Aún no hay otros miembros con perfil</p>
          <p className="text-xs mt-1">Invita a compañeros a completar su perfil</p>
        </div>
      )}

      {/* Profile cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {people.map(p => {
          const name        = p.profile?.full_name || p.profile?.email?.split('@')[0] || 'Alumni';
          const isConnected = connected.has(p.user_id);
          const pct         = p.score;
          const matchColor  = pct >= 60 ? 'text-emerald-600' : pct >= 30 ? 'text-amber-600' : 'text-zinc-500';
          const matchBg     = pct >= 60 ? 'bg-emerald-50'    : pct >= 30 ? 'bg-amber-50'    : 'bg-zinc-50';

          return (
            <div key={p.id} className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-5 flex flex-col">

              {/* Top row: avatar + match */}
              <div className="flex items-start justify-between mb-3">
                <div className="w-12 h-12 bg-gradient-to-br from-indigo-400 to-violet-500 rounded-2xl flex items-center justify-center shadow-sm">
                  <span className="text-lg font-black text-white">{name[0].toUpperCase()}</span>
                </div>
                {pct > 0 && (
                  <span className={cn('text-xs font-black px-2.5 py-1 rounded-full', matchBg, matchColor)}>
                    {pct}% match
                  </span>
                )}
              </div>

              {/* Name + headline */}
              <p className="font-black text-zinc-900 text-sm leading-tight">{name}</p>
              {p.headline && (
                <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{p.headline}</p>
              )}
              {p.industry && (
                <span className="inline-block mt-2 text-[10px] font-bold text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full w-fit">
                  {p.industry}
                </span>
              )}

              {/* Looking for */}
              {p.looking_for.length > 0 && (
                <div className="mt-3">
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">Busca</p>
                  <div className="flex flex-wrap gap-1">
                    {p.looking_for.slice(0, 3).map(l => (
                      <span key={l} className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{l}</span>
                    ))}
                    {p.looking_for.length > 3 && (
                      <span className="text-[10px] text-zinc-400">+{p.looking_for.length - 3}</span>
                    )}
                  </div>
                </div>
              )}

              {/* Offering */}
              {p.offering.length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">Ofrece</p>
                  <div className="flex flex-wrap gap-1">
                    {p.offering.slice(0, 3).map(o => (
                      <span key={o} className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">{o}</span>
                    ))}
                    {p.offering.length > 3 && (
                      <span className="text-[10px] text-zinc-400">+{p.offering.length - 3}</span>
                    )}
                  </div>
                </div>
              )}

              {/* Coordinator: show email for direct contact */}
              {isCoordOrAdmin && p.profile?.email && (
                <div className="mt-3 px-2 py-1.5 bg-slate-50 rounded-xl">
                  <a href={`mailto:${p.profile.email}`}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors truncate block">
                    ✉ {p.profile.email}
                  </a>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 mt-4 pt-3 border-t border-zinc-50">
                {p.linkedin_url && (
                  <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer"
                    className="w-9 h-9 flex items-center justify-center rounded-xl border border-zinc-200 hover:border-zinc-300 text-zinc-400 hover:text-zinc-600 transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                {!isCoordOrAdmin && (
                  <button
                    onClick={() => !isConnected && connect(p.user_id)}
                    disabled={isConnected || connecting === p.user_id}
                    className={cn(
                      'flex-1 py-2 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5',
                      isConnected
                        ? 'bg-emerald-50 text-emerald-600 cursor-default'
                        : connecting === p.user_id
                          ? 'bg-indigo-100 text-indigo-400 cursor-wait'
                          : 'bg-indigo-600 text-white hover:bg-indigo-700'
                    )}>
                    {isConnected ? (
                      <><UserCheck className="w-3.5 h-3.5" /> Conectado</>
                    ) : (
                      <><UserPlus className="w-3.5 h-3.5" /> {connecting === p.user_id ? '...' : 'Conectar'}</>
                    )}
                  </button>
                )}
                {isCoordOrAdmin && (
                  <a href={`mailto:${p.profile?.email ?? ''}`}
                    className="flex-1 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-colors flex items-center justify-center gap-1.5">
                    ✉ Contactar
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
