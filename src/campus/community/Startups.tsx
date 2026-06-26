/**
 * Startups — Ideas de Emprendimiento Campus
 *
 * Tablero de ideas separado del feed general.
 * Campos específicos: startup_stage + needs + image + contact.
 * Filtros por etapa. Likes y comentarios. Modal de detalle.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Plus, Heart, MessageSquare, X, Lightbulb, ExternalLink, Image, Phone, Mail, Send, ArrowLeft } from 'lucide-react';
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
  { id: 'all',                label: 'Todas',                color: 'text-zinc-700',    bg: 'bg-zinc-100' },
  { id: 'idea',               label: '💡 Idea',              color: 'text-zinc-600',    bg: 'bg-zinc-100' },
  { id: 'mvp',                label: '🔧 MVP',               color: 'text-blue-700',    bg: 'bg-blue-100' },
  { id: 'buscando_equipo',    label: '👥 Buscando equipo',   color: 'text-indigo-700',  bg: 'bg-indigo-100' },
  { id: 'buscando_inversion', label: '💰 Buscando inversión',color: 'text-amber-700',   bg: 'bg-amber-100' },
  { id: 'desarrollo',         label: '🚀 En desarrollo',     color: 'text-emerald-700', bg: 'bg-emerald-100' },
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
  link_url: string | null;
  image_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  likes_count: number;
  comments_count: number;
  created_at: string;
  author?: { full_name: string; email: string; };
}

interface Comment {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  author?: { full_name: string; email: string; };
}

const EMPTY = {
  title: '', body: '', stage: 'idea', needs: [] as string[], tags: '',
  link_url: '', contact_email: '', contact_phone: '',
};

interface Props {
  userId:       string;
  universityId: string | null;
  campusRole:   'student' | 'coordinator' | 'admin';
}

export const Startups: React.FC<Props> = ({ userId, universityId, campusRole }) => {
  const [startups,     setStartups]     = useState<StartupPost[]>([]);
  const [myLikes,      setMyLikes]      = useState<Set<string>>(new Set());
  const [loading,      setLoading]      = useState(true);
  const [filter,       setFilter]       = useState('all');
  const [showCreate,   setShowCreate]   = useState(false);
  const [form,         setForm]         = useState({ ...EMPTY });
  const [saving,       setSaving]       = useState(false);
  const [createError,  setCreateError]  = useState('');
  const [imageFile,    setImageFile]    = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Detail modal
  const [detailPost,      setDetailPost]      = useState<StartupPost | null>(null);
  const [comments,        setComments]        = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText,     setCommentText]     = useState('');
  const [sendingComment,  setSendingComment]  = useState(false);

  useEffect(() => { load(); }, [userId, universityId]);

  const apiPost = (action: string, extra?: object) =>
    fetch('/api/campus-import-students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    }).then(r => r.json());

  const load = async () => {
    setLoading(true);
    const [postsRes, likesRes] = await Promise.all([
      apiPost('get_startup_posts', { university_id: universityId }),
      apiPost('get_likes', { user_id: userId }),
    ]);
    setStartups(postsRes.data ?? []);
    setMyLikes(new Set((likesRes.data ?? []).map((l: any) => l.post_id)));
    setLoading(false);
  };

  const filtered = filter === 'all'
    ? startups
    : startups.filter(s => s.startup_stage === filter);

  const toggleLike = async (s: StartupPost, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const liked = myLikes.has(s.id);
    setMyLikes(prev => { const n = new Set(prev); liked ? n.delete(s.id) : n.add(s.id); return n; });
    const delta = liked ? -1 : 1;
    setStartups(prev => prev.map(p =>
      p.id === s.id ? { ...p, likes_count: p.likes_count + delta } : p
    ));
    if (detailPost?.id === s.id)
      setDetailPost(prev => prev ? { ...prev, likes_count: prev.likes_count + delta } : null);
    apiPost('toggle_like', { user_id: userId, post_id: s.id, liked });
  };

  const hideStartup = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    apiPost('hide_post', { post_id: id, user_id: userId });
    setStartups(prev => prev.filter(s => s.id !== id));
    if (detailPost?.id === id) setDetailPost(null);
  };

  const openDetail = async (s: StartupPost) => {
    setDetailPost(s);
    setCommentText('');
    setComments([]);
    setCommentsLoading(true);
    const { data } = await supabase
      .from('community_comments')
      .select('*, author:profiles(full_name, email)')
      .eq('post_id', s.id)
      .order('created_at', { ascending: true });
    setComments(data ?? []);
    setCommentsLoading(false);
  };

  const sendComment = async () => {
    if (!commentText.trim() || !detailPost) return;
    setSendingComment(true);
    const { data } = await supabase
      .from('community_comments')
      .insert({ post_id: detailPost.id, user_id: userId, body: commentText.trim() })
      .select('*, author:profiles(full_name, email)')
      .single();
    if (data) {
      setComments(prev => [...prev, data]);
      setStartups(prev => prev.map(p =>
        p.id === detailPost.id ? { ...p, comments_count: p.comments_count + 1 } : p
      ));
      setDetailPost(prev => prev ? { ...prev, comments_count: prev.comments_count + 1 } : null);
    }
    setCommentText('');
    setSendingComment(false);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = ev => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const createStartup = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    setCreateError('');
    try {
      let image_url: string | null = null;

      if (imageFile) {
        const ext  = imageFile.name.split('.').pop();
        const path = `startup-images/${universityId}/${Date.now()}.${ext}`;
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('university-assets')
          .upload(path, imageFile, { upsert: true });
        if (uploadErr) throw new Error(`Error al subir imagen: ${uploadErr.message}`);
        const { data: urlData } = supabase.storage
          .from('university-assets')
          .getPublicUrl(uploadData.path);
        image_url = urlData.publicUrl;
      }

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
          link_url:      form.link_url.trim()      || null,
          image_url,
          contact_email: form.contact_email.trim() || null,
          contact_phone: form.contact_phone.trim() || null,
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
    clearImage();
    load();
  };

  const closeCreate = () => {
    setShowCreate(false);
    setForm({ ...EMPTY });
    clearImage();
    setCreateError('');
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
          const badge   = getStageBadge(s.startup_stage);
          const liked   = myLikes.has(s.id);
          const name    = s.author?.full_name || s.author?.email?.split('@')[0] || 'Alumni';
          const canHide = s.user_id === userId || campusRole !== 'student';

          return (
            <div key={s.id}
              onClick={() => openDetail(s)}
              className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-5 flex flex-col cursor-pointer hover:border-indigo-200 hover:shadow-md transition-all">

              {/* Top: badge + time + close */}
              <div className="flex items-center justify-between mb-3">
                <span className={cn('text-[10px] font-black px-2.5 py-1 rounded-full', badge.bg, badge.color)}>
                  {badge.label}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">{timeAgo(s.created_at)}</span>
                  {canHide && (
                    <button onClick={e => hideStartup(s.id, e)}
                      className="text-zinc-200 hover:text-red-400 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Image thumbnail */}
              {s.image_url && (
                <div className="mb-3 rounded-xl overflow-hidden h-36 bg-zinc-100">
                  <img src={s.image_url} alt={s.title} className="w-full h-full object-cover" />
                </div>
              )}

              {/* Content */}
              <p className="font-black text-zinc-900 leading-tight">{s.title}</p>
              {s.body && (
                <p className="text-sm text-zinc-500 mt-1.5 line-clamp-2">{s.body}</p>
              )}

              {/* Needs */}
              {s.needs.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-3">
                  <span className="text-[10px] font-black text-zinc-400 uppercase self-center mr-1">Necesita:</span>
                  {s.needs.slice(0, 3).map(n => (
                    <span key={n} className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{n}</span>
                  ))}
                  {s.needs.length > 3 && (
                    <span className="text-[10px] text-zinc-400 self-center">+{s.needs.length - 3}</span>
                  )}
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center gap-3 mt-4 pt-3 border-t border-zinc-50">
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <div className="w-5 h-5 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-black text-indigo-700">{name[0].toUpperCase()}</span>
                  </div>
                  <span className="text-xs font-semibold text-zinc-500 truncate">{name.split(' ')[0]}</span>
                </div>
                <button onClick={e => toggleLike(s, e)}
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

      {/* ══ Detail modal ═══════════════════════════════════════════════════════ */}
      {detailPost && (() => {
        const s       = detailPost;
        const badge   = getStageBadge(s.startup_stage);
        const liked   = myLikes.has(s.id);
        const name    = s.author?.full_name || s.author?.email?.split('@')[0] || 'Alumni';
        const canHide = s.user_id === userId || campusRole !== 'student';

        return (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setDetailPost(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
              onClick={e => e.stopPropagation()}>

              {/* Modal header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 shrink-0">
                <button onClick={() => setDetailPost(null)}
                  className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 transition-colors">
                  <ArrowLeft className="w-4 h-4" /> Volver
                </button>
                {canHide && (
                  <button onClick={e => hideStartup(s.id, e)}
                    className="text-xs text-red-400 hover:text-red-600 font-semibold transition-colors">
                    Eliminar
                  </button>
                )}
              </div>

              {/* Scrollable content */}
              <div className="overflow-y-auto flex-1 p-5 space-y-4">

                {/* Stage + time */}
                <div className="flex items-center gap-2">
                  <span className={cn('text-[10px] font-black px-2.5 py-1 rounded-full', badge.bg, badge.color)}>
                    {badge.label}
                  </span>
                  <span className="text-xs text-zinc-400">{timeAgo(s.created_at)}</span>
                </div>

                {/* Title */}
                <h2 className="text-xl font-black text-zinc-900 leading-tight">{s.title}</h2>

                {/* Author */}
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
                    <span className="text-xs font-black text-indigo-700">{name[0].toUpperCase()}</span>
                  </div>
                  <span className="text-sm font-semibold text-zinc-600">{name}</span>
                </div>

                {/* Image */}
                {s.image_url && (
                  <div className="rounded-2xl overflow-hidden bg-zinc-100">
                    <img src={s.image_url} alt={s.title} className="w-full max-h-80 object-cover" />
                  </div>
                )}

                {/* Body */}
                {s.body && (
                  <p className="text-zinc-600 leading-relaxed whitespace-pre-wrap">{s.body}</p>
                )}

                {/* Needs */}
                {s.needs.length > 0 && (
                  <div>
                    <p className="text-[11px] font-black text-zinc-400 uppercase tracking-wider mb-2">Necesita</p>
                    <div className="flex flex-wrap gap-1.5">
                      {s.needs.map(n => (
                        <span key={n} className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">{n}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tags */}
                {s.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {s.tags.map(tag => (
                      <span key={tag} className="text-xs text-zinc-400 bg-zinc-100 px-2.5 py-1 rounded-full">#{tag}</span>
                    ))}
                  </div>
                )}

                {/* Link + Contact */}
                {(s.link_url || s.contact_email || s.contact_phone) && (
                  <div className="flex flex-wrap gap-2">
                    {s.link_url && (
                      <a href={s.link_url} target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 rounded-xl text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors">
                        <ExternalLink className="w-3.5 h-3.5" />
                        Ver proyecto
                      </a>
                    )}
                    {s.contact_email && (
                      <a href={`mailto:${s.contact_email}`}
                        onClick={e => e.stopPropagation()}
                        className="flex items-center gap-1.5 px-3 py-2 bg-zinc-100 rounded-xl text-xs font-semibold text-zinc-700 hover:bg-zinc-200 transition-colors">
                        <Mail className="w-3.5 h-3.5" />
                        {s.contact_email}
                      </a>
                    )}
                    {s.contact_phone && (
                      <a href={`tel:${s.contact_phone}`}
                        onClick={e => e.stopPropagation()}
                        className="flex items-center gap-1.5 px-3 py-2 bg-zinc-100 rounded-xl text-xs font-semibold text-zinc-700 hover:bg-zinc-200 transition-colors">
                        <Phone className="w-3.5 h-3.5" />
                        {s.contact_phone}
                      </a>
                    )}
                  </div>
                )}

                {/* Likes & comment count */}
                <div className="flex items-center gap-4 py-2 border-y border-zinc-100">
                  <button onClick={e => toggleLike(s, e)}
                    className={cn(
                      'flex items-center gap-1.5 text-sm font-semibold transition-colors',
                      liked ? 'text-red-500' : 'text-zinc-400 hover:text-red-400'
                    )}>
                    <Heart className={cn('w-4 h-4', liked && 'fill-red-500')} />
                    {s.likes_count} me gusta
                  </button>
                  <span className="flex items-center gap-1.5 text-sm text-zinc-400">
                    <MessageSquare className="w-4 h-4" />
                    {s.comments_count} comentarios
                  </span>
                </div>

                {/* Comments */}
                <div className="space-y-3">
                  <p className="text-[11px] font-black text-zinc-400 uppercase tracking-wider">Comentarios</p>

                  {commentsLoading ? (
                    <p className="text-sm text-zinc-400 py-6 text-center">Cargando...</p>
                  ) : comments.length === 0 ? (
                    <p className="text-sm text-zinc-400 py-4 text-center">Sé el primero en comentar</p>
                  ) : (
                    <div className="space-y-3">
                      {comments.map(c => {
                        const cName = c.author?.full_name || c.author?.email?.split('@')[0] || 'Alumni';
                        return (
                          <div key={c.id} className="flex gap-2.5">
                            <div className="w-7 h-7 bg-zinc-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                              <span className="text-[11px] font-black text-zinc-500">{cName[0].toUpperCase()}</span>
                            </div>
                            <div className="flex-1 bg-zinc-50 rounded-xl px-3 py-2">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-xs font-bold text-zinc-700">{cName}</span>
                                <span className="text-[10px] text-zinc-400">{timeAgo(c.created_at)}</span>
                              </div>
                              <p className="text-sm text-zinc-600">{c.body}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Comment input */}
                  <div className="flex gap-2 pt-1">
                    <input
                      value={commentText}
                      onChange={e => setCommentText(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment(); }
                      }}
                      placeholder="Escribe un comentario..."
                      className="flex-1 border border-zinc-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400"
                    />
                    <button onClick={sendComment} disabled={!commentText.trim() || sendingComment}
                      className="w-9 h-9 bg-indigo-600 text-white rounded-xl flex items-center justify-center disabled:opacity-40 hover:bg-indigo-700 transition-colors shrink-0">
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══ Create startup modal ════════════════════════════════════════════════ */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={closeCreate}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>

            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-amber-500" />
                <h3 className="font-black text-zinc-900">Nueva idea</h3>
              </div>
              <button onClick={closeCreate}
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

              {/* Image upload */}
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Imagen del proyecto</label>
                <input type="file" ref={fileInputRef} accept="image/*" onChange={handleImageChange} className="hidden" />
                {imagePreview ? (
                  <div className="relative mt-1 rounded-xl overflow-hidden h-40 bg-zinc-100">
                    <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
                    <button onClick={clearImage}
                      className="absolute top-2 right-2 w-7 h-7 bg-black/50 text-white rounded-full flex items-center justify-center hover:bg-black/70 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => fileInputRef.current?.click()}
                    className="mt-1 w-full h-24 border-2 border-dashed border-zinc-200 rounded-xl flex flex-col items-center justify-center gap-2 text-zinc-400 hover:border-indigo-300 hover:text-indigo-400 transition-colors">
                    <Image className="w-5 h-5" />
                    <span className="text-xs font-medium">Subir imagen</span>
                  </button>
                )}
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
                  placeholder="Ej: fintech, b2b, mobile, saas"
                  className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                />
              </div>

              {/* Link */}
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Enlace (opcional)</label>
                <div className="relative mt-1">
                  <ExternalLink className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                  <input value={form.link_url} onChange={e => setForm(f => ({ ...f, link_url: e.target.value }))}
                    placeholder="https://... (landing page, pitch deck, demo)"
                    type="url"
                    className="w-full border border-zinc-200 rounded-xl pl-8 pr-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                  />
                </div>
              </div>

              {/* Contact */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Email contacto</label>
                  <div className="relative mt-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                    <input value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))}
                      placeholder="hola@startup.com"
                      type="email"
                      className="w-full border border-zinc-200 rounded-xl pl-8 pr-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Teléfono</label>
                  <div className="relative mt-1">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                    <input value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))}
                      placeholder="+56 9 1234 5678"
                      type="tel"
                      className="w-full border border-zinc-200 rounded-xl pl-8 pr-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                    />
                  </div>
                </div>
              </div>

              {createError && (
                <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{createError}</p>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={closeCreate}
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
