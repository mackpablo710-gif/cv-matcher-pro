/**
 * Connections — Miembros de la Universidad + Mensajería interna
 *
 * Muestra TODOS los alumnos/coordinadores activos de la universidad,
 * independiente de si tienen perfil comunitario.
 * Campos: nombre, cargo (job_title), empresa (company), programa (career), rol.
 * Chat interno entre miembros de la misma universidad.
 */
import React, { useEffect, useState, useRef } from 'react';
import {
  ExternalLink, RefreshCw, Users, MessageCircle,
  Send, X, ArrowLeft, GraduationCap, Briefcase,
} from 'lucide-react';

function cn(...c: (string | undefined | false)[]) { return c.filter(Boolean).join(' '); }

function timeShort(date: string) {
  return new Date(date).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

interface UniversityMember {
  user_id:      string;
  full_name:    string;
  email:        string;
  job_title:    string | null;
  company:      string | null;
  career:       string | null;
  role:         string;
  headline:     string | null;
  linkedin_url: string | null;
}

interface ChatMessage {
  id:           string;
  from_user_id: string;
  body:         string;
  created_at:   string;
}

interface Props {
  userId:       string;
  universityId: string | null;
  myProfile:    any;
  campusRole?:  'student' | 'coordinator' | 'admin';
}

export const Connections: React.FC<Props> = ({ userId, universityId, campusRole }) => {
  const [members,    setMembers]    = useState<UniversityMember[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [chatWith,   setChatWith]   = useState<UniversityMember | null>(null);
  const [messages,   setMessages]   = useState<ChatMessage[]>([]);
  const [msgInput,   setMsgInput]   = useState('');
  const [sending,    setSending]    = useState(false);
  const [msgLoading, setMsgLoading] = useState(false);
  const [msgError,   setMsgError]   = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isCoordOrAdmin = campusRole === 'coordinator' || campusRole === 'admin';

  useEffect(() => { load(); }, [userId, universityId]);
  useEffect(() => { if (chatWith) loadMessages(chatWith.user_id); }, [chatWith?.user_id]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const apiPost = (action: string, extra?: object) =>
    fetch('/api/campus-import-students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    }).then(r => r.json());

  const load = async () => {
    setLoading(true);
    const res = await apiPost('get_profiles', { university_id: universityId, current_user_id: userId });
    setMembers(res.data ?? []);
    setLoading(false);
  };

  const loadMessages = async (otherUserId: string) => {
    setMsgLoading(true);
    setMsgError('');
    const res = await apiPost('get_messages', { user_id: userId, other_user_id: otherUserId });
    if (res.ok) setMessages(res.data ?? []);
    else setMsgError(res.error || 'Error al cargar mensajes');
    setMsgLoading(false);
  };

  const sendMessage = async () => {
    if (!msgInput.trim() || !chatWith || sending) return;
    const body = msgInput.trim();
    setMsgInput('');
    setSending(true);
    const tempMsg: ChatMessage = { id: `temp-${Date.now()}`, from_user_id: userId, body, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, tempMsg]);
    const res = await apiPost('send_message', { from_user_id: userId, to_user_id: chatWith.user_id, body });
    if (res.ok && res.message) {
      setMessages(prev => prev.map(m => m.id === tempMsg.id ? (res.message as ChatMessage) : m));
    } else if (!res.ok) {
      setMsgError(res.error || 'Error al enviar');
      setMessages(prev => prev.filter(m => m.id !== tempMsg.id));
    }
    setSending(false);
  };

  const closeChat = () => { setChatWith(null); setMessages([]); setMsgInput(''); setMsgError(''); };

  const filtered = members.filter(m =>
    !search ||
    m.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (m.company   ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (m.career    ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (m.job_title ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const roleLabel = (role: string) =>
    ({ student: 'Alumno', coordinator: 'Coordinador', admin: 'Admin' }[role] ?? role);

  if (loading) return (
    <div className="flex items-center justify-center h-40 text-zinc-400">Cargando miembros...</div>
  );

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-black text-zinc-900">Miembros de la Universidad</h3>
          <p className="text-zinc-500 text-sm">
            {filtered.length} miembro{filtered.length !== 1 ? 's' : ''} · haz click en Mensaje para chatear
          </p>
        </div>
        <button onClick={load}
          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Buscar por nombre, empresa, programa..."
        className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
      />

      {/* Empty */}
      {filtered.length === 0 && (
        <div className="text-center py-16 text-zinc-400">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium text-sm">{search ? 'Sin resultados para esa búsqueda' : 'Aún no hay miembros'}</p>
        </div>
      )}

      {/* Member cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(m => (
          <div key={m.user_id} className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-5 flex flex-col">

            {/* Avatar + role badge */}
            <div className="flex items-start justify-between mb-3">
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-400 to-violet-500 rounded-2xl flex items-center justify-center shadow-sm shrink-0">
                <span className="text-lg font-black text-white">
                  {(m.full_name || m.email || 'A')[0].toUpperCase()}
                </span>
              </div>
              <span className={cn(
                'text-[10px] font-black px-2.5 py-1 rounded-full',
                m.role === 'coordinator' ? 'bg-amber-100 text-amber-700' :
                m.role === 'admin'       ? 'bg-red-100 text-red-700' :
                'bg-indigo-100 text-indigo-700'
              )}>
                {roleLabel(m.role)}
              </span>
            </div>

            {/* Name */}
            <p className="font-black text-zinc-900 text-sm leading-tight">
              {m.full_name || m.email.split('@')[0]}
            </p>

            {/* Cargo · Empresa */}
            {(m.job_title || m.company) && (
              <div className="flex items-center gap-1 mt-1">
                <Briefcase className="w-3 h-3 text-indigo-400 shrink-0" />
                <p className="text-xs font-semibold text-indigo-700 truncate">
                  {[m.job_title, m.company].filter(Boolean).join(' · ')}
                </p>
              </div>
            )}

            {/* Programa */}
            {m.career && (
              <div className="flex items-center gap-1 mt-0.5">
                <GraduationCap className="w-3 h-3 text-zinc-400 shrink-0" />
                <p className="text-xs text-zinc-500 truncate">{m.career}</p>
              </div>
            )}

            {/* Headline (de perfil comunitario, si existe) */}
            {m.headline && (
              <p className="text-xs text-zinc-400 mt-1.5 line-clamp-2 italic">{m.headline}</p>
            )}

            {/* Coordinator: show email */}
            {isCoordOrAdmin && m.email && (
              <div className="mt-2">
                <a href={`mailto:${m.email}`}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors truncate block">
                  ✉ {m.email}
                </a>
              </div>
            )}

            {/* Actions */}
            <div className={cn('flex gap-2 pt-3 border-t border-zinc-50', m.headline || m.career || m.job_title ? 'mt-3' : 'mt-auto')}>
              {m.linkedin_url && (
                <a href={m.linkedin_url} target="_blank" rel="noopener noreferrer"
                  className="w-9 h-9 flex items-center justify-center rounded-xl border border-zinc-200 hover:border-zinc-300 text-zinc-400 hover:text-zinc-600 transition-colors">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              <button
                onClick={() => setChatWith(m)}
                title="Enviar mensaje interno"
                className="flex-1 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-colors flex items-center justify-center gap-1.5">
                <MessageCircle className="w-3.5 h-3.5" />
                Mensaje
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ══ Chat modal ════════════════════════════════════════════════════════════ */}
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
                  {(chatWith.full_name || chatWith.email || 'A')[0].toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-zinc-900 text-sm truncate">
                  {chatWith.full_name || chatWith.email.split('@')[0]}
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

            {/* Messages */}
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
                      isMe ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-zinc-100 text-zinc-800 rounded-bl-sm'
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

            {/* Input */}
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
                <button onClick={sendMessage} disabled={!msgInput.trim() || sending}
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
