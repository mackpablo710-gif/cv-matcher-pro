/**
 * Feed — Comunidad Campus
 *
 * - Click en cualquier post → modal de detalle con info completa + comentarios
 * - Tipo "Otro" en crear publicación
 * - Necesita "Otro" con input libre para agregar necesidad personalizada
 * - Likes con optimistic update
 * - Color scheme: teal
 */
import React, { useEffect, useState } from 'react';
import {
  Plus, Heart, MessageSquare, X, Send, Briefcase,
  BookOpen, Users, ShoppingBag, Megaphone,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { CommunityPost, CommunityProfile, PostType } from '../types';

function cn(...c: (string | undefined | false)[]) { return c.filter(Boolean).join(' '); }

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60)  return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// ── Config ────────────────────────────────────────────────────────────────────

// Colored left-border per post type for visual differentiation
const TYPE_BORDER: Record<string, string> = {
  'marketplace-busco':   'border-l-indigo-400',
  'marketplace-ofrezco': 'border-l-emerald-400',
  'opportunity':         'border-l-amber-400',
  'mentorship':          'border-l-violet-400',
  'team':                'border-l-blue-400',
  'general':             'border-l-zinc-300',
};

const TYPE_AVATAR_BG: Record<string, string> = {
  'marketplace-busco':   'from-indigo-400 to-indigo-600',
  'marketplace-ofrezco': 'from-emerald-400 to-emerald-600',
  'opportunity':         'from-amber-400 to-amber-600',
  'mentorship':          'from-violet-400 to-violet-600',
  'team':                'from-blue-400 to-blue-600',
  'general':             'from-zinc-400 to-zinc-600',
};

const FILTER_TABS = [
  { type: 'all',         cat: '',       label: 'Todos',        icon: Megaphone,     color: 'text-zinc-700',    bg: 'bg-zinc-100' },
  { type: 'marketplace', cat: 'busco',  label: 'Busco',        icon: ShoppingBag,   color: 'text-indigo-700',    bg: 'bg-indigo-100' },
  { type: 'marketplace', cat: 'ofrezco',label: 'Ofrezco',      icon: Briefcase,     color: 'text-emerald-700', bg: 'bg-emerald-100' },
  { type: 'opportunity', cat: '',       label: 'Oportunidades',icon: Megaphone,     color: 'text-amber-700',   bg: 'bg-amber-100' },
  { type: 'mentorship',  cat: '',       label: 'Mentoría',     icon: BookOpen,      color: 'text-violet-700',  bg: 'bg-violet-100' },
  { type: 'team',        cat: '',       label: 'Equipo MBA',   icon: Users,         color: 'text-blue-700',    bg: 'bg-blue-100' },
  { type: 'general',     cat: '',       label: 'Otro',         icon: MessageSquare, color: 'text-zinc-600',    bg: 'bg-zinc-100' },
] as const;

const TYPE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  'marketplace-busco':   { label: 'BUSCO',       color: 'text-indigo-700',    bg: 'bg-indigo-100' },
  'marketplace-ofrezco': { label: 'OFREZCO',     color: 'text-emerald-700', bg: 'bg-emerald-100' },
  'opportunity':         { label: 'OPORTUNIDAD', color: 'text-amber-700',   bg: 'bg-amber-100' },
  'mentorship':          { label: 'MENTORÍA',    color: 'text-violet-700',  bg: 'bg-violet-100' },
  'team':                { label: 'EQUIPO MBA',  color: 'text-blue-700',    bg: 'bg-blue-100' },
  'general':             { label: 'OTRO',        color: 'text-zinc-600',    bg: 'bg-zinc-100' },
};

const CREATE_TYPES = [
  { type: 'marketplace', cat: 'busco',   label: 'Busco' },
  { type: 'marketplace', cat: 'ofrezco', label: 'Ofrezco' },
  { type: 'opportunity', cat: '',        label: 'Oportunidad laboral' },
  { type: 'mentorship',  cat: '',        label: 'Mentoría' },
  { type: 'team',        cat: '',        label: 'Equipo MBA' },
  { type: 'general',     cat: '',        label: 'Otro' },
];

const NEEDS_OPTIONS = [
  'cofundador', 'desarrollador', 'diseñador', 'mentor',
  'comercial', 'marketing', 'inversionista', 'legal', 'RRHH',
];

const EMPTY_FORM = {
  post_type: 'marketplace' as PostType,
  category:  'busco' as 'busco' | 'ofrezco',
  title: '', body: '', tags: '',
  needs: [] as string[],
};

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  userId:       string;
  universityId: string | null;
  myProfile:    CommunityProfile | null;   // null for coordinator/admin (no profile required)
  campusRole:   'student' | 'coordinator' | 'admin';
}

interface Comment {
  id: string;
  body: string;
  created_at: string;
  author?: { full_name: string; email: string; };
}

export const Feed: React.FC<Props> = ({ userId, universityId, myProfile, campusRole }) => {
  const [posts,   setPosts]   = useState<CommunityPost[]>([]);
  const [myLikes, setMyLikes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState({ type: 'all', cat: '' });

  // Create modal
  const [showCreate,   setShowCreate]   = useState(false);
  const [form,         setForm]         = useState({ ...EMPTY_FORM });
  const [saving,       setSaving]       = useState(false);
  const [createError,  setCreateError]  = useState('');

  // Inline comment (quick reply on card)
  const [expandedId,    setExpandedId]    = useState<string | null>(null);
  const [comments,      setComments]      = useState<Record<string, Comment[]>>({});
  const [loadingCmt,    setLoadingCmt]    = useState(false);
  const [commentDraft,  setCommentDraft]  = useState('');
  const [sendingCmt,    setSendingCmt]    = useState(false);

  // Detail modal
  const [detailPost,        setDetailPost]        = useState<CommunityPost | null>(null);
  const [detailComments,    setDetailComments]    = useState<Comment[]>([]);
  const [detailLoading,     setDetailLoading]     = useState(false);
  const [detailDraft,       setDetailDraft]       = useState('');
  const [sendingDetail,     setSendingDetail]     = useState(false);

  // Custom "Otro" need
  const [needsOtherActive, setNeedsOtherActive] = useState(false);
  const [needsOtherText,   setNeedsOtherText]   = useState('');

  useEffect(() => { load(); }, [userId, universityId]);

  const load = async () => {
    setLoading(true);
    const postsQuery = (() => {
      let q = supabase
        .from('community_posts')
        .select('*, author:profiles(full_name, email)')
        .neq('post_type', 'startup')
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      // Scope to university — second security layer after RLS
      if (universityId) q = q.eq('university_id', universityId);
      return q;
    })();

    const [postsRes, likesRes] = await Promise.all([
      postsQuery,
      supabase
        .from('community_likes')
        .select('post_id')
        .eq('user_id', userId),
    ]);
    setPosts(postsRes.data ?? []);
    setMyLikes(new Set((likesRes.data ?? []).map((l: any) => l.post_id)));
    setLoading(false);
  };

  const filtered = posts.filter(p => {
    if (filter.type === 'all') return true;
    if (p.post_type !== filter.type) return false;
    if (filter.cat && p.category !== filter.cat) return false;
    return true;
  });

  // ── Like ──────────────────────────────────────────────────────────────────────
  const toggleLike = async (post: CommunityPost, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const liked = myLikes.has(post.id);
    setMyLikes(prev => { const s = new Set(prev); liked ? s.delete(post.id) : s.add(post.id); return s; });
    setPosts(prev => prev.map(p =>
      p.id === post.id ? { ...p, likes_count: p.likes_count + (liked ? -1 : 1) } : p
    ));
    // Sync detail post likes count
    if (detailPost?.id === post.id) {
      setDetailPost(dp => dp ? { ...dp, likes_count: dp.likes_count + (liked ? -1 : 1) } : dp);
    }
    if (liked) await supabase.from('community_likes').delete().eq('post_id', post.id).eq('user_id', userId);
    else       await supabase.from('community_likes').insert({ post_id: post.id, user_id: userId });
  };

  // ── Inline comments ───────────────────────────────────────────────────────────
  const toggleComments = async (postId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (expandedId === postId) { setExpandedId(null); return; }
    setExpandedId(postId);
    if (comments[postId]) return;
    setLoadingCmt(true);
    const { data } = await supabase
      .from('community_comments')
      .select('*, author:profiles(full_name, email)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    setComments(prev => ({ ...prev, [postId]: data ?? [] }));
    setLoadingCmt(false);
  };

  const sendComment = async (postId: string) => {
    if (!commentDraft.trim() || sendingCmt) return;
    setSendingCmt(true);
    const { data } = await supabase
      .from('community_comments')
      .insert({ post_id: postId, user_id: userId, body: commentDraft.trim() })
      .select('*, author:profiles(full_name, email)')
      .single();
    if (data) {
      setComments(prev => ({ ...prev, [postId]: [...(prev[postId] ?? []), data] }));
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, comments_count: p.comments_count + 1 } : p));
      setCommentDraft('');
    }
    setSendingCmt(false);
  };

  // ── Detail modal ──────────────────────────────────────────────────────────────
  const openDetail = async (post: CommunityPost) => {
    setDetailPost(post);
    setDetailComments([]);
    setDetailDraft('');
    setDetailLoading(true);
    const { data } = await supabase
      .from('community_comments')
      .select('*, author:profiles(full_name, email)')
      .eq('post_id', post.id)
      .order('created_at', { ascending: true });
    setDetailComments(data ?? []);
    setDetailLoading(false);
  };

  const sendDetailComment = async () => {
    if (!detailDraft.trim() || !detailPost || sendingDetail) return;
    setSendingDetail(true);
    const { data } = await supabase
      .from('community_comments')
      .insert({ post_id: detailPost.id, user_id: userId, body: detailDraft.trim() })
      .select('*, author:profiles(full_name, email)')
      .single();
    if (data) {
      setDetailComments(prev => [...prev, data]);
      setPosts(prev => prev.map(p =>
        p.id === detailPost.id ? { ...p, comments_count: p.comments_count + 1 } : p
      ));
      setDetailDraft('');
    }
    setSendingDetail(false);
  };

  // ── Hide post ─────────────────────────────────────────────────────────────────
  const hidePost = async (postId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    await supabase.from('community_posts').update({ status: 'hidden' }).eq('id', postId);
    setPosts(prev => prev.filter(p => p.id !== postId));
    if (detailPost?.id === postId) setDetailPost(null);
  };

  // ── Create post ───────────────────────────────────────────────────────────────
  const createPost = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    setCreateError('');
    const tags = form.tags.split(',').map(t => t.trim()).filter(Boolean);
    try {
      const res = await fetch('/api/campus-community-post', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id:       userId,
          university_id: universityId,
          post_type:     form.post_type,
          category:      form.category,
          title:         form.title.trim(),
          body:          form.body.trim() || null,
          tags,
          needs:         form.needs,
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
    setForm({ ...EMPTY_FORM });
    setNeedsOtherActive(false);
    setNeedsOtherText('');
    load();
  };

  // ── Custom need ───────────────────────────────────────────────────────────────
  const addOtherNeed = () => {
    const t = needsOtherText.trim();
    if (!t || form.needs.includes(t)) return;
    setForm(f => ({ ...f, needs: [...f.needs, t] }));
    setNeedsOtherText('');
  };

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const getTypeKey = (p: CommunityPost) =>
    p.category ? `${p.post_type}-${p.category}` : p.post_type;

  const getBadge = (p: CommunityPost) =>
    TYPE_BADGE[getTypeKey(p)] ?? TYPE_BADGE['general'];

  const getBorderColor = (p: CommunityPost) =>
    TYPE_BORDER[getTypeKey(p)] ?? 'border-l-zinc-300';

  const getAvatarGradient = (p: CommunityPost) =>
    TYPE_AVATAR_BG[getTypeKey(p)] ?? 'from-zinc-400 to-zinc-600';

  const initial = (name?: string, email?: string) =>
    (name || email || '?')[0].toUpperCase();

  const canModerate = (post: CommunityPost) =>
    post.user_id === userId || campusRole !== 'student';

  const isCoordOrAdmin = campusRole === 'coordinator' || campusRole === 'admin';

  // ── Render ────────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-40 text-zinc-400">Cargando feed...</div>
  );

  return (
    <div className="space-y-4">

      {/* Filter chips + Publish */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {FILTER_TABS.map(ft => {
          const active = filter.type === ft.type && filter.cat === ft.cat;
          return (
            <button key={`${ft.type}-${ft.cat}`}
              onClick={() => setFilter({ type: ft.type, cat: ft.cat })}
              className={cn(
                'text-xs font-bold px-3 py-1.5 rounded-full border whitespace-nowrap transition-all shrink-0',
                active
                  ? `${ft.bg} ${ft.color} border-transparent`
                  : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-300'
              )}>
              {ft.label}
            </button>
          );
        })}
        <div className="flex-1 min-w-[1rem]" />
        {!isCoordOrAdmin && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 text-xs font-bold bg-indigo-600 text-white px-4 py-1.5 rounded-full hover:bg-indigo-700 transition-colors shrink-0">
            <Plus className="w-3.5 h-3.5" /> Publicar
          </button>
        )}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="text-center py-16 text-zinc-400">
          <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium text-sm">Sin publicaciones en esta categoría</p>
          <p className="text-xs mt-1">¡Sé el primero en publicar!</p>
        </div>
      )}

      {/* Post cards */}
      <div className="space-y-3">
        {filtered.map(post => {
          const badge    = getBadge(post);
          const liked    = myLikes.has(post.id);
          const expanded = expandedId === post.id;
          const borderCl = getBorderColor(post);
          const avatarGr = getAvatarGradient(post);
          return (
            <div key={post.id}
              className={cn(
                'bg-white rounded-2xl border border-zinc-100 border-l-4 shadow-sm p-5 cursor-pointer hover:shadow-md transition-all',
                borderCl
              )}
              onClick={() => openDetail(post)}>

              <div className="flex items-start gap-3">
                <div className={cn('w-9 h-9 bg-gradient-to-br rounded-xl flex items-center justify-center shrink-0', avatarGr)}>
                  <span className="text-sm font-black text-white">
                    {initial(post.author?.full_name, post.author?.email)}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-zinc-900">
                      {post.author?.full_name || post.author?.email?.split('@')[0] || 'Alumni'}
                    </span>
                    <span className={cn('text-[10px] font-black px-2 py-0.5 rounded-full', badge.bg, badge.color)}>
                      {badge.label}
                    </span>
                    <span className="text-xs text-zinc-400 ml-auto shrink-0">{timeAgo(post.created_at)}</span>
                    {canModerate(post) && (
                      <button onClick={e => hidePost(post.id, e)}
                        className="text-zinc-200 hover:text-red-400 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <p className="font-bold text-zinc-900 mt-1 leading-tight">{post.title}</p>
                  {post.body && (
                    <p className="text-sm text-zinc-500 mt-1 leading-relaxed line-clamp-2">{post.body}</p>
                  )}

                  {post.needs.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      <span className="text-[10px] font-black text-zinc-400 uppercase self-center mr-1">Necesita:</span>
                      {post.needs.map(n => (
                        <span key={n} className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{n}</span>
                      ))}
                    </div>
                  )}

                  {post.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {post.tags.map(tag => (
                        <span key={tag} className="text-[10px] text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded-full">#{tag}</span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-4 mt-3">
                    <button onClick={e => toggleLike(post, e)}
                      className={cn(
                        'flex items-center gap-1 text-xs font-semibold transition-colors',
                        liked ? 'text-red-500' : 'text-zinc-400 hover:text-red-400'
                      )}>
                      <Heart className={cn('w-4 h-4', liked && 'fill-red-500')} />
                      {post.likes_count}
                    </button>
                    <button onClick={e => toggleComments(post.id, e)}
                      className={cn(
                        'flex items-center gap-1 text-xs font-semibold transition-colors',
                        expanded ? 'text-indigo-600' : 'text-zinc-400 hover:text-zinc-600'
                      )}>
                      <MessageSquare className="w-4 h-4" />
                      {post.comments_count}
                    </button>
                    <span className="ml-auto text-[10px] font-semibold text-indigo-600">Ver más →</span>
                  </div>
                </div>
              </div>

              {/* Inline comments */}
              {expanded && (
                <div className="mt-4 pt-4 border-t border-zinc-100 space-y-3"
                  onClick={e => e.stopPropagation()}>
                  {loadingCmt && !comments[post.id] && (
                    <p className="text-xs text-zinc-400 text-center">Cargando...</p>
                  )}
                  {(comments[post.id] ?? []).map(c => (
                    <div key={c.id} className="flex gap-2">
                      <div className="w-6 h-6 bg-zinc-100 rounded-full flex items-center justify-center shrink-0">
                        <span className="text-[10px] font-black text-zinc-500">
                          {initial(c.author?.full_name, c.author?.email)}
                        </span>
                      </div>
                      <div className="flex-1 bg-zinc-50 rounded-xl px-3 py-2">
                        <span className="text-xs font-bold text-zinc-700 mr-2">
                          {c.author?.full_name?.split(' ')[0] || 'Alumno'}
                        </span>
                        <span className="text-xs text-zinc-600">{c.body}</span>
                      </div>
                    </div>
                  ))}
                  {(comments[post.id] ?? []).length === 0 && !loadingCmt && (
                    <p className="text-xs text-zinc-400 text-center">Sin comentarios aún</p>
                  )}
                  <div className="flex gap-2">
                    <input value={commentDraft} onChange={e => setCommentDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment(post.id); }}}
                      placeholder="Escribe un comentario..."
                      className="flex-1 text-sm border border-zinc-200 rounded-xl px-3 py-2 outline-none focus:border-indigo-400"
                    />
                    <button onClick={() => sendComment(post.id)}
                      disabled={sendingCmt || !commentDraft.trim()}
                      className="w-9 h-9 flex items-center justify-center bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50">
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ══ Detail modal ══════════════════════════════════════════════════════════ */}
      {detailPost && (() => {
        const badge = getBadge(detailPost);
        const liked = myLikes.has(detailPost.id);
        const liveCount = posts.find(p => p.id === detailPost.id)?.likes_count ?? detailPost.likes_count;
        return (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setDetailPost(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col"
              onClick={e => e.stopPropagation()}>

              {/* Modal header */}
              <div className="flex items-start gap-3 p-5 border-b border-zinc-100 shrink-0">
                <div className={cn('w-10 h-10 bg-gradient-to-br rounded-xl flex items-center justify-center shrink-0', getAvatarGradient(detailPost))}>
                  <span className="font-black text-white text-sm">
                    {initial(detailPost.author?.full_name, detailPost.author?.email)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-zinc-900">
                      {detailPost.author?.full_name || detailPost.author?.email?.split('@')[0] || 'Alumni'}
                    </span>
                    <span className={cn('text-[10px] font-black px-2 py-0.5 rounded-full', badge.bg, badge.color)}>
                      {badge.label}
                    </span>
                    <span className="text-xs text-zinc-400">{timeAgo(detailPost.created_at)}</span>
                  </div>
                  <p className="font-black text-zinc-900 text-lg leading-tight mt-1">{detailPost.title}</p>
                  {/* Coordinator: show author email for direct contact */}
                  {isCoordOrAdmin && detailPost.author?.email && (
                    <a href={`mailto:${detailPost.author.email}`}
                      onClick={e => e.stopPropagation()}
                      className="inline-flex items-center gap-1 mt-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">
                      ✉ {detailPost.author.email}
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {canModerate(detailPost) && (
                    <button onClick={() => hidePost(detailPost.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-red-50 text-zinc-300 hover:text-red-400 transition-colors"
                      title="Ocultar publicación">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => setDetailPost(null)}
                    className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-zinc-100 text-zinc-400 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Modal body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {detailPost.body && (
                  <p className="text-zinc-600 leading-relaxed whitespace-pre-wrap">{detailPost.body}</p>
                )}

                {detailPost.needs.length > 0 && (
                  <div>
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-2">Necesita</p>
                    <div className="flex flex-wrap gap-1.5">
                      {detailPost.needs.map(n => (
                        <span key={n} className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">{n}</span>
                      ))}
                    </div>
                  </div>
                )}

                {detailPost.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {detailPost.tags.map(tag => (
                      <span key={tag} className="text-xs text-zinc-400 bg-zinc-100 px-2.5 py-1 rounded-full">#{tag}</span>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-4 py-2 border-t border-zinc-100">
                  <button onClick={() => toggleLike(detailPost)}
                    className={cn(
                      'flex items-center gap-1.5 text-sm font-semibold transition-colors',
                      liked ? 'text-red-500' : 'text-zinc-400 hover:text-red-400'
                    )}>
                    <Heart className={cn('w-4 h-4', liked && 'fill-red-500')} />
                    {liveCount}
                  </button>
                  <span className="flex items-center gap-1.5 text-sm text-zinc-400">
                    <MessageSquare className="w-4 h-4" />
                    {detailComments.length} comentario{detailComments.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Comments */}
                <div className="space-y-3">
                  {detailLoading && (
                    <p className="text-xs text-zinc-400 text-center py-4">Cargando comentarios...</p>
                  )}
                  {detailComments.map(c => (
                    <div key={c.id} className="flex gap-2.5">
                      <div className="w-7 h-7 bg-indigo-50 rounded-full flex items-center justify-center shrink-0">
                        <span className="text-xs font-black text-indigo-700">
                          {initial(c.author?.full_name, c.author?.email)}
                        </span>
                      </div>
                      <div className="flex-1 bg-zinc-50 rounded-xl px-3 py-2.5">
                        <span className="text-xs font-bold text-zinc-700 mr-2">
                          {c.author?.full_name?.split(' ')[0] || 'Alumno'}
                        </span>
                        <span className="text-sm text-zinc-600">{c.body}</span>
                        <p className="text-[10px] text-zinc-400 mt-0.5">{timeAgo(c.created_at)}</p>
                      </div>
                    </div>
                  ))}
                  {!detailLoading && detailComments.length === 0 && (
                    <p className="text-sm text-zinc-400 text-center py-4">Sin comentarios aún. ¡Sé el primero!</p>
                  )}
                </div>
              </div>

              {/* Comment input */}
              <div className="border-t border-zinc-100 p-4 shrink-0">
                <div className="flex gap-2">
                  <input value={detailDraft} onChange={e => setDetailDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDetailComment(); }}}
                    placeholder="Escribe un comentario..."
                    className="flex-1 text-sm border border-zinc-200 rounded-xl px-3 py-2.5 outline-none focus:border-indigo-400"
                  />
                  <button onClick={sendDetailComment}
                    disabled={sendingDetail || !detailDraft.trim()}
                    className="w-10 h-10 flex items-center justify-center bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══ Create modal ══════════════════════════════════════════════════════════ */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>

            <div className="flex items-center justify-between mb-5">
              <h3 className="font-black text-zinc-900">Nueva publicación</h3>
              <button onClick={() => setShowCreate(false)}
                className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-zinc-100">
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Type */}
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Tipo *</label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {CREATE_TYPES.map(ct => {
                    const active = form.post_type === ct.type && (!ct.cat || form.category === ct.cat);
                    return (
                      <button key={`${ct.type}-${ct.cat}`} type="button"
                        onClick={() => setForm(f => ({
                          ...f,
                          post_type: ct.type as PostType,
                          category: (ct.cat || 'busco') as 'busco' | 'ofrezco',
                        }))}
                        className={cn(
                          'text-xs font-semibold px-3 py-1.5 rounded-full border transition-all',
                          active
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-zinc-600 border-zinc-200 hover:border-indigo-300'
                        )}>
                        {ct.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Título *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder={
                    form.post_type === 'marketplace' && form.category === 'busco' ? 'Ej: Busco cofundador técnico para FinTech' :
                    form.post_type === 'opportunity' ? 'Ej: Mi empresa busca KAM con exp. en retail' :
                    form.post_type === 'mentorship'  ? 'Ej: Ofrezco mentoría en transformación digital' :
                    form.post_type === 'team'        ? 'Ej: Busco integrantes para proyecto MBA Final' :
                    'Título de tu publicación...'
                  }
                  autoFocus
                  className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                />
              </div>

              {/* Body */}
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Descripción</label>
                <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                  placeholder="Cuéntanos más..."
                  rows={3}
                  className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400 resize-none"
                />
              </div>

              {/* Needs — only for busco + team */}
              {(form.post_type === 'team' || (form.post_type === 'marketplace' && form.category === 'busco')) && (
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
                    {/* Otro chip */}
                    <button type="button"
                      onClick={() => setNeedsOtherActive(v => !v)}
                      className={cn(
                        'text-xs font-semibold px-3 py-1 rounded-full border transition-all',
                        needsOtherActive
                          ? 'bg-zinc-700 text-white border-zinc-700'
                          : 'bg-white text-zinc-600 border-zinc-300 hover:border-zinc-400'
                      )}>
                      + Otro
                    </button>
                  </div>

                  {/* Custom need input */}
                  {needsOtherActive && (
                    <div className="flex gap-2 mt-2">
                      <input
                        value={needsOtherText}
                        onChange={e => setNeedsOtherText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOtherNeed(); }}}
                        placeholder="Escribe qué necesitas..."
                        autoFocus
                        className="flex-1 text-xs border border-zinc-200 rounded-xl px-3 py-2 outline-none focus:border-indigo-400"
                      />
                      <button type="button" onClick={addOtherNeed}
                        disabled={!needsOtherText.trim()}
                        className="px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition-colors">
                        Agregar
                      </button>
                    </div>
                  )}

                  {/* Custom needs chips (free-form) */}
                  {form.needs.filter(n => !NEEDS_OPTIONS.includes(n)).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {form.needs.filter(n => !NEEDS_OPTIONS.includes(n)).map(n => (
                        <span key={n}
                          className="flex items-center gap-1 text-xs font-semibold text-zinc-700 bg-zinc-100 px-2.5 py-1 rounded-full">
                          {n}
                          <button type="button"
                            onClick={() => setForm(f => ({ ...f, needs: f.needs.filter(x => x !== n) }))}
                            className="text-zinc-400 hover:text-red-400 transition-colors">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tags */}
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Tags (separados por coma)</label>
                <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                  placeholder="Ej: fintech, startup, react, marketing"
                  className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                />
              </div>

              {createError && (
                <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{createError}</p>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={() => { setShowCreate(false); setForm({ ...EMPTY_FORM }); setNeedsOtherActive(false); setNeedsOtherText(''); setCreateError(''); }}
                  className="px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors">
                  Cancelar
                </button>
                <button onClick={createPost} disabled={saving || !form.title.trim()}
                  className="flex-1 py-2 text-sm font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                  {saving ? 'Publicando...' : 'Publicar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
