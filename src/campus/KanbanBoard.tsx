import React, { useEffect, useRef, useState } from 'react';
import { Plus, X, ExternalLink, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Application, ApplicationStatus } from './types';
import { KANBAN_COLUMNS } from './types';

function cn(...c: (string | undefined | false)[]) { return c.filter(Boolean).join(' '); }

interface Props { userId: string; }

const EMPTY_FORM = {
  company: '', position: '', status: 'applied' as ApplicationStatus,
  notes: '', url: '', applied_date: new Date().toISOString().split('T')[0],
  salary_min: '', salary_max: '',
};

export const KanbanBoard: React.FC<Props> = ({ userId }) => {
  const [apps, setApps]         = useState<Application[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editApp, setEditApp]   = useState<Application | null>(null);
  const [form, setForm]         = useState({ ...EMPTY_FORM });
  const [saving, setSaving]     = useState(false);
  const [dragId, setDragId]     = useState<string | null>(null);
  const [overCol, setOverCol]   = useState<ApplicationStatus | null>(null);

  useEffect(() => { load(); }, [userId]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('applications').select('*')
      .eq('user_id', userId).order('sort_order').order('created_at', { ascending: false });
    setApps(data || []);
    setLoading(false);
  };

  const openAdd = () => { setForm({ ...EMPTY_FORM }); setEditApp(null); setShowForm(true); };
  const openEdit = (app: Application) => {
    setForm({
      company: app.company, position: app.position, status: app.status,
      notes: app.notes || '', url: app.url || '',
      applied_date: app.applied_date,
      salary_min: app.salary_min?.toString() || '',
      salary_max: app.salary_max?.toString() || '',
    });
    setEditApp(app);
    setShowForm(true);
  };

  const save = async () => {
    if (!form.company.trim() || !form.position.trim()) return;
    setSaving(true);
    const payload = {
      user_id: userId,
      company: form.company.trim(),
      position: form.position.trim(),
      status: form.status,
      notes: form.notes.trim() || null,
      url: form.url.trim() || null,
      applied_date: form.applied_date,
      salary_min: form.salary_min ? parseInt(form.salary_min) : null,
      salary_max: form.salary_max ? parseInt(form.salary_max) : null,
      sort_order: apps.filter(a => a.status === form.status).length,
    };
    if (editApp) {
      await supabase.from('applications').update(payload).eq('id', editApp.id);
    } else {
      await supabase.from('applications').insert(payload);
    }
    setSaving(false);
    setShowForm(false);
    load();
  };

  const deleteApp = async (id: string) => {
    await supabase.from('applications').delete().eq('id', id);
    setApps(prev => prev.filter(a => a.id !== id));
  };

  // ── Drag and Drop ────────────────────────────────────────────────────────────
  const onDragStart = (e: React.DragEvent, id: string) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e: React.DragEvent, colId: ApplicationStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverCol(colId);
  };

  const onDrop = async (e: React.DragEvent, colId: ApplicationStatus) => {
    e.preventDefault();
    setOverCol(null);
    if (!dragId) return;
    const app = apps.find(a => a.id === dragId);
    if (!app || app.status === colId) { setDragId(null); return; }

    // Optimistic update
    setApps(prev => prev.map(a => a.id === dragId ? { ...a, status: colId } : a));
    await supabase.from('applications').update({ status: colId, updated_at: new Date().toISOString() }).eq('id', dragId);
    setDragId(null);
  };

  const onDragEnd = () => { setDragId(null); setOverCol(null); };

  const byStatus = (s: ApplicationStatus) => apps.filter(a => a.status === s);

  if (loading) return <div className="flex items-center justify-center h-64 text-zinc-400">Cargando tablero...</div>;

  return (
    <div className="flex flex-col gap-4" style={{ minHeight: 'calc(100vh - 120px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-white">Mis Postulaciones</h2>
          <p className="text-slate-400 text-sm mt-0.5">Arrastra las tarjetas para actualizar el estado · {apps.length} postulación{apps.length !== 1 ? 'es' : ''}</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 bg-white text-slate-800 font-black text-sm px-4 py-2.5 rounded-xl hover:bg-indigo-50 transition-colors shadow-lg">
          <Plus className="w-4 h-4" /> Nueva postulación
        </button>
      </div>

      {/* Kanban columns — horizontal scroll on mobile */}
      <div className="flex gap-3 overflow-x-auto pb-4 flex-1" style={{ minHeight: 500 }}>
        {KANBAN_COLUMNS.map(col => {
          const items = byStatus(col.id);
          const isOver = overCol === col.id;
          return (
            <div key={col.id}
              className={cn(
                'flex flex-col rounded-2xl border-2 transition-all shrink-0 w-60 sm:w-72',
                isOver
                  ? 'border-indigo-400 scale-[1.01] shadow-lg'
                  : `border-transparent ${col.bg}`
              )}
              style={{ minHeight: 500 }}
              onDragOver={e => onDragOver(e, col.id)}
              onDrop={e => onDrop(e, col.id)}
              onDragLeave={() => setOverCol(null)}
            >
              {/* Column header */}
              <div className="flex items-center justify-between px-3 py-3 border-b border-white/60">
                <div className="flex items-center gap-2">
                  <span className={cn('w-2.5 h-2.5 rounded-full', col.dot)} />
                  <span className={cn('text-sm font-black', col.color)}>{col.label}</span>
                </div>
                <span className={cn(
                  'text-xs font-black rounded-full w-6 h-6 flex items-center justify-center',
                  col.color, 'bg-white/70'
                )}>
                  {items.length}
                </span>
              </div>

              {/* Cards */}
              <div className="flex-1 overflow-y-auto px-2 pt-2 pb-2 space-y-2">
                {items.map(app => (
                  <div key={app.id}
                    draggable
                    onDragStart={e => onDragStart(e, app.id)}
                    onDragEnd={onDragEnd}
                    onClick={() => openEdit(app)}
                    className={cn(
                      'bg-white rounded-xl p-3 shadow-sm border-l-4 border border-white cursor-grab active:cursor-grabbing',
                      'hover:shadow-md hover:-translate-y-0.5 transition-all',
                      col.cardBorder,
                      dragId === app.id ? 'opacity-40 scale-95' : ''
                    )}
                  >
                    <p className="font-bold text-zinc-900 text-sm leading-tight">{app.position}</p>
                    <p className={cn('text-xs mt-0.5 font-semibold', col.color)}>{app.company}</p>
                    {app.notes && <p className="text-xs text-zinc-400 mt-1.5 line-clamp-2">{app.notes}</p>}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-50">
                      <span className="text-[10px] text-zinc-400 font-medium">
                        {new Date(app.applied_date).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                      </span>
                      <div className="flex items-center gap-1">
                        {app.url && (
                          <a href={app.url} target="_blank" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="w-5 h-5 flex items-center justify-center rounded hover:bg-zinc-100 text-zinc-400">
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        <button onClick={e => { e.stopPropagation(); deleteApp(app.id); }}
                          className="w-5 h-5 flex items-center justify-center rounded hover:bg-red-50 text-zinc-300 hover:text-red-400 transition-colors">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {items.length === 0 && (
                  <div className="text-center py-6 text-zinc-300 text-xs">
                    <div className={cn('w-8 h-8 rounded-full mx-auto mb-2 opacity-30', col.bg.replace('50','200'))} />
                    Arrastra aquí
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-black text-zinc-900">{editApp ? 'Editar postulación' : 'Nueva postulación'}</h3>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-zinc-100">
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Empresa *</label>
                <input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                  placeholder="Ej: Google, Falabella..." autoFocus
                  className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" />
              </div>
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Cargo *</label>
                <input value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))}
                  placeholder="Ej: Product Manager..."
                  className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" />
              </div>
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Estado</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as ApplicationStatus }))}
                  className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400 bg-white">
                  {KANBAN_COLUMNS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Fecha postulación</label>
                <input type="date" value={form.applied_date} onChange={e => setForm(f => ({ ...f, applied_date: e.target.value }))}
                  className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" />
              </div>
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">URL oferta</label>
                <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                  placeholder="https://..."
                  className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" />
              </div>
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Notas</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Contacto, próximos pasos, impresiones..."
                  rows={2}
                  className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400 resize-none" />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowForm(false)}
                  className="flex-none px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors">
                  Cancelar
                </button>
                <button onClick={save} disabled={saving || !form.company.trim() || !form.position.trim()}
                  className="flex-1 px-4 py-2 text-sm font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50">
                  {saving ? 'Guardando...' : (editApp ? 'Guardar cambios' : 'Agregar')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
