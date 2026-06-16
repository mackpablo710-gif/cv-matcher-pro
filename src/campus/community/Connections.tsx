/**
 * Connections — Conexiones sugeridas + Mensajería interna
 *
 * Matching score:
 *   - Misma industria               → +20 pts
 *   - Mi looking_for ∩ su offering  → +15 pts cada match
 *   - Su looking_for ∩ mi offering  → +10 pts cada match
 *   - Skills en común               → +5 pts cada una (máx 20)
 *
 * Máximo: 99% (100% reservado para IA futura)
 *
 * Datos mostrados: nombre, cargo (job_title), empresa (company),
 * industria, looking_for, offering + botón de mensaje interno.
 */
import React, { useEffect, useState, useRef } from 'react';
import {
  UserCheck, UserPlus, ExternalLink, RefreshCw,
  Users, MessageCircle, Send, X, ArrowLeft,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { CommunityProfile } from '../types';

function cn(...c: (string | undefined | false)[]) { return c.filter(Boolean).join(' '); }

function matchScore(me: CommunityProfile, other: CommunityProfile): number {
  let score = 0;
  if (me.industry && me.industry === other.industry) score += 20;
  for (const w of me.looking_for)    if (other.offering.includes(w))  score += 15;
  for (const w of other.looking_for) if (me.offering.includes(w))     score += 10;
  let sb = 0;
  for (const s of me.skills)         if (other.skills.includes(s))  { sb += 5; }
  score += Math.min(sb, 20);
  return Math.min(score, 99);
}

function timeShort(date: string) {
  return new Date(date).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

interface ExtendedProfile extends CommunityProfile {
  score:      number;
  job_title?: string | null;
  company?:   string | null;
}

interface ChatMessage {
  id:             string;
  from_user_id:   string;
  body:           string;
  created_at:     string;
}

interface Props {
  userId:       string;
  universityId: string | null;
  myProfile:    CommunityProfile | null;
  campusRole?:  'student' | 'coordinator' | 'admin';
}

export const Connections: React.FC<Props> = ({ userId, universityId, myProfile, campusRole }) => {
  const [people,      setPeople]      = useState<ExtendedProfile[]>([]);
  const [connected,   setConnected]   = useState<Set<string>>(new Set());
  const [loading,     setLoading]     = useState(true);
  const [connecting,  setConnecting]  = useState<string | null>(null);

  // Chat state
  const [chatWith,    setChatWith]    = useState<ExtendedProfile | null>(null);
  const [messages,    setMessages]    = useState<ChatMessage[]>([]);
  const [msgInput,    setMsgInput]    = useState('');
  const [sending,     setSending]     = useState(false);
  const [msgLoading,  setMsgLoading]  = useState(false);
  const [msgError,    setMsgError]    = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isCoordOrAdmin = campusRole === 'coordinator' || campusRole === 'admin';

  useEffect(() => { load(); }, [userId, universityId]);

  useEffect(() => {
    if (chatWith) loadMessages(chatWith.user_id);
  }, [chatWith?.user_id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Load community profiles + university_users for cargo/empresa ─────────────
  const load = async () => {
    setLoading(true);

    const profilesQuery = (() => {
      let q = supabase
        .from('campus_community_profiles')
        .select('*, profile:profiles(full_name, email)')
        .eq('is_visible', true)
        .neq('user_id', userId);
      if (universityId) q = q.eq('university_id', universityId);
      return q;
    })();

    const [profRes, connRes] = await Promise.all([
      profilesQuery,
      supabase.from('community_connections').select('to_user_id').eq('from_user_id', userId),
    ]);

    const all = (profRes.data ?? []) as CommunityProfile[];

    // Fetch job_title + company from university_users for each profile
    let uuMap = new Map<string, { job_title?: string | null; company?: string | null }>();
    if (all.length > 0 && universityId) {
      const userIds = all.map(p => p.user_id);
      const { data: uuRows } = await supabase
        .from('university_users')
        .select('user_id, job_title, company')
        .eq('university_id', universityId)
        .in('user_id', userIds);
      if (uuRows) {
        uuMap = new Map(
          (uuRows as any[]).map(r => [r.user_id, { job_title: r.job_title ?? null, company: r.company ?? null }])
        );
      }
    }

    const scored: ExtendedProfile[] = all
      .map(p => ({
        ...p,
        score:     myProfile ? matchScore(myProfile, p) : 0,
        job_title: uuMap.get(p.user_id)?.job_title ?? null,
        company:   uuMap.get(p.user_id)?.company   ?? null,
      }))
      .sort((a, b) => b.score - a.score);

    setPeople(scored);
    setConnected(new Set((connRes.data ?? []).map((c: any) => c.to_user_id)));
    setLoading(false);
  };

  // ── Load chat messages between current user and chatWith ─────────────────────
  const loadMessages = async (otherUserId: string) => {
    setMsgLoading(true);
    setMsgError('');
    try {
      const { data, error } = await supabase
        .from('community_messages')
        .select('id, from_user_id, body, created_at')
        .or(
          `and(from_user_id.eq.${userId},to_user_id.eq.${otherUserId}),` +
          `and(from_user_id.eq.${otherUserId},to_user_id.eq.${userId})`
        )
        .order('created_at', { ascending: true });

      if (error) {
        // Table may not exist yet — show helpful message
        setMsgError('Mensajería no configurada aún. Ejecuta el SQL de mensajería en Supabase.');
        setMessages([]);
      } else {
        setMessages((data ?? []) as ChatMessage[]);
      }
    } catch {
      setMsgError('Error al cargar mensajes.');
      setMessages([]);
    }
    setMsgLoading(false);
  };

  // ── Send a message ────────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!msgInput.trim() || !chatWith || sending) return;
    const body = msgInput.trim();
    setMsgInput('');
    setSending(true);

    // Optimistic update
    const tempMsg: ChatMessage = {
      id:           `temp-${Date.now()}`,
      from_user_id: userId,
      body,
      created_at:   new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempMsg]);

    try {
      const { data, error } = await supabase
        .from('community_messages')
        .insert({ from_user_id: userId, to_user_id: chatWith.user_id, body })
        .select('id, from_user_id, body, created_at')
        .single();

      if (error) {
        setMsgError('No se pudo enviar. Ejecuta el SQL de mensajería en Supabase.');
        setMessages(prev => prev.filter(m => m.id !== tempMsg.id));
      } else if (data) {
        setMessages(prev => prev.map(m => m.id === tempMsg.id ? (data as ChatMessage) : m));
      }
    } catch {
      setMsgError('Error al enviar mensaje.');
    }
    setSending(false);
  };

  // ── Connect ───────────────────────────────────────────────────────────────────
  const connect = async (toUserId: string) => {
    setConnecting(toUserId);
    await supabase.from('community_connections').upsert(
      { from_user_id: userId, to_user_id: toUserId, status: 'accepted' },
      { onConflict: 'from_user_id,to_user_id' }
    );
    setConnected(prev => new Set([...prev, toUserId]));
    setConnecting(null);
  };

  // ── Close chat ────────────────────────────────────────────────────────────────
  const closeChat = () => {
    setChatWith(null);
    setMessages([]);
    setMsgInput('');
    setMsgError('');
  };

  // ─────────────────────────────────────────────────────────────────────────────

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

              {/* Top row: avatar + match % */}
              <div className="flex items-start justify-between mb-3">
                <div className="w-12 h-12 bg-gradient-to-br from-indigo-400 to-violet-500 rounded-2xl flex items-center justify-center shadow-sm shrink-0">
                  <span className="text-lg font-black text-white">{name[0].toUpperCase()}</span>
                </div>
                {pct > 0 && (
                  <span className={cn('text-xs font-black px-2.5 py-1 rounded-full', matchBg, matchColor)}>
                    {pct}% match
                  </span>
                )}
              </div>

              {/* Name */}
              <p className="font-black text-zinc-900 text-sm leading-tight">{name}</p>

              {/* Cargo · Empresa */}
              {(p.job_title || p.company) && (
                <p className="text-xs font-semibold text-indigo-700 mt-0.5">
                  {[p.job_title, p.company].filter(Boolean).join(' · ')}
                </p>
              )}

              {/* Headline */}
              {p.headline && (
                <p className="text-xs text-zinc-400 mt-0.5 line-clamp-2">{p.headline}</p>
              )}

              {/* Industry chip */}
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

              {/* Coordinator: show email */}
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

                {/* LinkedIn */}
                {p.linkedin_url && (
                  <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer"
                    className="w-9 h-9 flex items-center justify-center rounded-xl border border-zinc-200 hover:border-zinc-300 text-zinc-400 hover:text-zinc-600 transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}

                {/* Message button — always visible */}
                <button
                  onClick={() => setChatWith(p)}
                  title="Enviar mensaje interno"
                  className="w-9 h-9 flex items-center justify-center rounded-xl border border-indigo-200 text-indigo-500 hover:bg-indigo-50 hover:border-indigo-300 transition-colors">
                  <MessageCircle className="w-3.5 h-3.5" />
                </button>

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

      {/* ══ Chat modal ═══════════════════════════════════════════════════════════ */}
      {chatWith && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={closeChat}>
          <div
            className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md flex flex-col"
            style={{ height: '72vh', maxHeight: '580px' }}
            onClick={e => e.stopPropagation()}>

            {/* Chat header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-100 shrink-0">
              <button onClick={closeChat}
                className="sm:hidden w-8 h-8 flex items-center justify-center rounded-xl hover:bg-zinc-100 text-zinc-400">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="w-9 h-9 bg-gradient-to-br from-indigo-400 to-violet-500 rounded-xl flex items-center justify-center shrink-0">
                <span className="text-sm font-black text-white">
                  {(chatWith.profile?.full_name || chatWith.profile?.email || 'A')[0].toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-zinc-900 text-sm truncate">
                  {chatWith.profile?.full_name || chatWith.profile?.email?.split('@')[0] || 'Alumni'}
                </p>
                {(chatWith.job_title || chatWith.company) && (
                  <p className="text-xs text-zinc-400 truncate">
                    {[chatWith.job_title, chatWith.company].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              <button onClick={closeChat}
                className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-zinc-100 text-zinc-400 shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {msgLoading && (
                <div className="flex items-center justify-center h-full text-zinc-400 text-sm">
                  Cargando mensajes...
                </div>
              )}

              {msgError && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700">
                  ⚠️ {msgError}
                </div>
              )}

              {!msgLoading && !msgError && messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-zinc-400 text-center">
                  <MessageCircle className="w-10 h-10 mb-2 opacity-20" />
                  <p className="text-sm font-medium">Sin mensajes aún</p>
                  <p className="text-xs mt-1">¡Envía el primer mensaje!</p>
                </div>
              )}

              {messages.map(m => {
                const isMe = m.from_user_id === userId;
                return (
                  <div key={m.id} className={cn('flex', isMe ? 'justify-end' : 'justify-start')}>
                    <div className={cn(
                      'max-w-[78%] px-3 py-2 rounded-2xl text-sm break-words',
                      isMe
                        ? 'bg-indigo-600 text-white rounded-br-sm'
                        : 'bg-zinc-100 text-zinc-800 rounded-bl-sm'
                    )}>
                      <p>{m.body}</p>
                      <p className={cn('text-[10px] mt-0.5 text-right', isMe ? 'text-indigo-300' : 'text-zinc-400')}>
                        {timeShort(m.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="px-3 pb-4 pt-2 border-t border-zinc-100 shrink-0">
              <div className="flex gap-2">
                <input
                  value={msgInput}
                  onChange={e => setMsgInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="Escribe un mensaje..."
                  className="flex-1 border border-zinc-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                  autoFocus
                />
                <button
                  onClick={sendMessage}
                  disabled={!msgInput.trim() || sending}
                  className="w-10 h-10 flex items-center justify-center bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition-colors shrink-0">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
