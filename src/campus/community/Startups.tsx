/**
 * Startups — Ideas de Emprendimiento Campus
 *
 * Tablero de ideas separado del feed general.
 * Campos específicos: startup_stage + needs.
 * Filtros por etapa.
 * Likes con optimistic update.
 */
import React, { useEffect, useState } from 'react';
import { Plus, Heart, MessageSquare, X, Lightbulb } from 'lucide-react';
import { supabase } from '../../lib/supabase';

function cn(...c: (string | undefined | false)[]) { return c.filter(Boolean).join(' '); }

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60)  return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const STAGES = [
  { id: 'all',                 label: 'Todas',              color: 'text-zinc-700',    bg: 'bg-zinc-100' },
  { id: 'idea',                label: '💡 Idea',            color: 'text-zinc-600',    bg: 'bg-zinc-100' },
  { id: 'mvp',                 label: '🔧 MVP',             color: 'text-blue-700',    bg: 'bg-blue-100' },
  { id: 'buscando_equipo',     label: '👥 Buscando equipo', color: 'text-indigo-700',  bg: 'bg-indigo-100' },
  { id: 'buscando_inversion',  label: '💰 Buscando inversión', color: 'text-amber-700', bg: 'bg-amber-100' },
  { id: 'desarrollo',          label: '🚀 En desarrollo',   color: 'text-emerald-700', bg: 'bg-emerald-100' },
];

const NEEDS_OPTIONS = [
  'cofundador', 'desarrollador', 'diseñador',
  'marketing', 'comercial', 'finanzas', 'legal', 'RRHH', 'inversionista',
];

interface StartupPost {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  tags: string[];
  needs: string[];
  startup_stage: string | null;
  likes_count: number;
  comments_count: number;
  created_at: string;
  author?: { full_name: string; email: string; };
}

const EMPTY = { title: '', body: '', stage: 'idea', needs: [] as string[], tags: '' };

interface Props {
  userId:       string;
  universityId: string | null;
  campusRole:   'student' | 'coordinator' | 'admin';
}

export const Startups: React.FC<Props> = ({ userId, universityId, campusRole }) => {
  const [startups,   setStartups]   = useState<StartupPost[]>([]);
  const [myLikes,    setMyLikes]    = useState<Set<string>>(new Set());
  const [loading,    setLoading]    = useState(true);
  const [filter,     setFilter]     = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [form,       setForm]       = useState({ ...EMPTY });
  const [saving,      setSaving]      = useState(false);
  const [createError, setCreateError] = useState('');

  useEffect(() => { load(); }, [userId, universityId]);

  const load = async () => {
    setLoading(true);
    const startupsQuery = (() => {
      let q = supabase
        .from('community_posts')
        .select('*, author:profiles(full_name, email)')
        .eq('post_type', 'startup')
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      // Scope to university — second security layer after RLS
      if (universityId) q = q.eq('university_id', universityId);
      return q;
    })();

    const [postsRes, likesRes] = await Promise.all([
      startupsQuery,
      supabase
        .from('community_likes')
        .select('post_id')
        .eq('user_id', userId),
    ]);
    setStartups(postsRes.data ?? []);
    setMyLikes(new Set((likesRes.data ?? []).map((l: any) => l.post_id)));
    setLoading(false);
  };

  const filtered = filter === 'all'
    ? startups
    : startups.filter(s => s.startup_stage === filter);

  const toggleLike = async (s: StartupPost) => {
    const liked = myLikes.has(s.id);
    setMyLikes(prev => { const n = new Set(prev); liked ? n.delete(s.id) : n.add(s.id); return n; });
    setStartups(prev => prev.map(p =>
      p.id === s.id ? { ...p, likes_count: p.likes_count + (liked ? -1 : 1) } : p
    ));
    if (liked) await supabase.from('community_likes').delete().eq('post_id', s.id).eq('user_id', userId);
    else       await supabase.from('community_likes').insert({ post_id: s.id, user_id: userId });
  };

  const hideStartup = async (id: string) => {
    await supabase.from('community_posts').update({ status: 'hidden' }).eq('id', id);
    setStartups(prev => prev.filter(s => s.id !== id));
  };

  const createStartup = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    setCreateError('');
    try {
      const res = await fetch('/api/campus-import-students', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:        'create_post',
          user_id:       userId,
          university_id: universityId,
          post_type:     'startup',
          title:         form.title.trim(),
          body:          form.body.trim() || null,
          tags:          form.tags.split(',').map(t => t.trim()).filter(Boolean),
          needs:         form.needs,
          startup_stage: form.stage,
          status:        'active',
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Error al publicar');
    } catch (err: any) {
      setCreateError(err.message || 'Error al publicar. Intenta de nuevo.');
      setSaving(false);
      return;
    }
    setSaving(false);
    setShowCreate(false);
    setForm({ ...EMPTY });
    load();
  };

  const getStageBadge = (stage: string | null) =>
    STAGES.find(s => s.id === stage) ?? STAGES[1];

  if (loading) return (
    <div className="flex items-center justify-center h-40 text-zinc-400">Cargando startups...</div>
  );

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-black text-zinc-900">Ideas de Emprendimiento</h3>
          <p className="text-zinc-500 text-sm">
            {startups.length} proyecto{startups.length !== 1 ? 's' : ''} en la comunidad
          </p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 text-xs font-bold bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Publicar idea
        </button>
      </div>

      {/* Stage filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STAGES.map(s => (
          <button key={s.id} onClick={() => setFilter(s.id)}
            className={cn(
              'text-xs font-bold px-3 py-1.5 rounded-full border whitespace-nowrap transition-all shrink-0',
              filter === s.id
                ? `${s.bg} ${s.color} border-transparent`
                : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-300'
            )}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="text-center py-16 text-zinc-400">
          <Lightbulb className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium text-sm">Sin ideas en esta etapa aún</p>
          <p className="text-xs mt-1">¡Comparte tu proyecto!</p>
        </div>
      )}

      {/* Startup grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {filtered.map(s => {
          const badge  = getStageBadge(s.startup_stage);
          const liked  = myLikes.has(s.id);
          const name   = s.author?.full_name || s.author?.email?.split('@')[0] || 'Alumni';
          const canHide = s.user_id === userId || campusRole !== 'student';

          return (
            <div key={s.id} className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-5 flex flex-col">

              {/* Top: badge + time + close */}
              <div className="flex items-center justify-between mb-3">
                <span className={cn('text-[10px] font-black px-2.5 py-1 rounded-full', badge.bg, badge.color)}>
                  {badge.label.replace(/[^\w\s]/gu, '').trim().toUpperCase()}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">{timeAgo(s.created_at)}</span>
                  {canHide && (
                    <button onClick={() => hideStartup(s.id)}
                      className="text-zinc-200 hover:text-red-400 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Content */}
              <p className="font-black text-zinc-900 leading-tight">{s.title}</p>
              {s.body && (
                <p className="text-sm text-zinc-500 mt-1.5 line-clamp-3">{s.body}</p>
              )}

              {/* Needs */}
              {s.needs.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-3">
                  <span className="text-[10px] font-black text-zinc-400 uppercase self-center mr-1">Necesita:</span>
                  {s.needs.map(n => (
                    <span key={n} className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{n}</span>
                  ))}
                </div>
              )}

              {/* Tags */}
              {s.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {s.tags.map(tag => (
                    <span key={tag} className="text-[10px] text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded-full">#{tag}</span>
                  ))}
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center gap-3 mt-4 pt-3 border-t border-zinc-50">
                <div className="flex items-center gap-1.5 flex-1">
                  <div className="w-5 h-5 bg-indigo-100 rounded-full flex items-center justify-center">
                    <span className="text-[10px] font-black text-indigo-700">{name[0].toUpperCase()}</span>
                  </div>
                  <span className="text-xs font-semibold text-zinc-500 truncate">{name.split(' ')[0]}</span>
                </div>
                <button onClick={() => toggleLike(s)}
                  className={cn(
                    'flex items-center gap-1 text-xs font-semibold transition-colors',
                    liked ? 'text-red-500' : 'text-zinc-400 hover:text-red-400'
                  )}>
                  <Heart className={cn('w-3.5 h-3.5', liked && 'fill-red-500')} />
                  {s.likes_count}
                </button>
                <span className="flex items-center gap-1 text-xs text-zinc-400">
                  <MessageSquare className="w-3.5 h-3.5" />
                  {s.comments_count}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ══ Create startup modal ═══════════════════════════════════════════════ */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>

            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-amber-500" />
                <h3 className="font-black text-zinc-900">Nueva idea</h3>
              </div>
              <button onClick={() => setShowCreate(false)}
                className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-zinc-100">
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Nombre del proyecto *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Ej: TutuPay · App de pagos entre equipos de trabajo"
                  autoFocus
                  className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                />
              </div>

              {/* Body */}
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Problema y solución</label>
                <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                  placeholder="¿Qué problema resuelves? ¿Cómo lo resuelves?"
                  rows={3}
                  className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400 resize-none"
                />
              </div>

              {/* Stage */}
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Etapa actual</label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {STAGES.filter(s => s.id !== 'all').map(s => (
                    <button key={s.id} type="button"
                      onClick={() => setForm(f => ({ ...f, stage: s.id }))}
                      className={cn(
                        'text-xs font-semibold px-3 py-1.5 rounded-full border transition-all',
                        form.stage === s.id
                          ? `${s.bg} ${s.color} border-transparent`
                          : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300'
                      )}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Needs */}
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">¿Qué necesitas?</label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {NEEDS_OPTIONS.map(n => (
                    <button key={n} type="button"
                      onClick={() => setForm(f => ({
                        ...f,
                        needs: f.needs.includes(n) ? f.needs.filter(x => x !== n) : [...f.needs, n],
                      }))}
                      className={cn(
                        'text-xs font-semibold px-3 py-1 rounded-full border transition-all',
                        form.needs.includes(n)
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300'
                      )}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Tags (separados por coma)</label>
                <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                  placeholder="Ej: fintech, b2b, mobile, saas, retail"
                  className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                />
              </div>

              {createError && (
                <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{createError}</p>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={() => { setShowCreate(false); setForm({ ...EMPTY }); setCreateError(''); }}
                  className="px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors">
                  Cancelar
                </button>
                <button onClick={createStartup} disabled={saving || !form.title.trim()}
                  className="flex-1 py-2 text-sm font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                  {saving ? 'Publicando...' : 'Publicar idea'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
