import React, { useEffect, useState } from 'react';
import { Plus, Users, TrendingUp, Target, Award, Trash2, X, Check, Building2, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { University, UniversityUser } from './types';
import { KANBAN_COLUMNS } from './types';

function cn(...c: (string | undefined | false)[]) { return c.filter(Boolean).join(' '); }

export const UniversityDashboard: React.FC = () => {
  const [unis,    setUnis]    = useState<University[]>([]);
  const [users,   setUsers]   = useState<UniversityUser[]>([]);
  const [apps,    setApps]    = useState<any[]>([]);
  const [selUni,  setSelUni]  = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState<'overview' | 'students' | 'applications'>('overview');

  // Add university form
  const [showUniForm, setShowUniForm] = useState(false);
  const [uniForm, setUniForm] = useState({ name: '', slug: '', credits_per_user: '5', max_users: '100', plan: 'starter' });
  const [saving, setSaving] = useState(false);

  // Add student form
  const [showStudentForm, setShowStudentForm] = useState(false);
  const [studentEmail, setStudentEmail] = useState('');
  const [studentCareer, setStudentCareer] = useState('');
  const [studentCohort, setStudentCohort] = useState('');
  const [addingStudent, setAddingStudent] = useState(false);
  const [studentError, setStudentError] = useState('');

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { if (selUni) loadUniData(selUni); }, [selUni]);

  const loadAll = async () => {
    setLoading(true);
    const { data } = await supabase.from('universities').select('*').order('created_at', { ascending: false });
    setUnis(data || []);
    if (data && data.length > 0 && !selUni) setSelUni(data[0].id);
    setLoading(false);
  };

  const loadUniData = async (uniId: string) => {
    const [uRes, aRes] = await Promise.all([
      supabase.from('university_users')
        .select('*, profile:profiles(email, full_name, credits, last_active_at)')
        .eq('university_id', uniId).eq('active', true),
      supabase.from('applications')
        .select('*, profile:profiles(full_name, email)')
        .eq('university_id', uniId).order('created_at', { ascending: false }),
    ]);
    setUsers(uRes.data || []);
    setApps(aRes.data || []);
  };

  const saveUni = async () => {
    if (!uniForm.name.trim()) return;
    setSaving(true);
    const slug = uniForm.slug || uniForm.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    await supabase.from('universities').insert({
      name: uniForm.name.trim(), slug,
      credits_per_user: parseInt(uniForm.credits_per_user) || 5,
      max_users: parseInt(uniForm.max_users) || 100,
      plan: uniForm.plan,
    });
    setSaving(false);
    setShowUniForm(false);
    setUniForm({ name: '', slug: '', credits_per_user: '5', max_users: '100', plan: 'starter' });
    loadAll();
  };

  const addStudent = async () => {
    if (!studentEmail.trim() || !selUni) return;
    setAddingStudent(true); setStudentError('');
    // Find profile by email
    const { data: prof } = await supabase.from('profiles').select('id').eq('email', studentEmail.trim().toLowerCase()).maybeSingle();
    if (!prof) { setStudentError('No existe un usuario con ese email en CVJOB'); setAddingStudent(false); return; }
    const { error } = await supabase.from('university_users').insert({
      university_id: selUni, user_id: prof.id, role: 'student',
      career: studentCareer || null, cohort: studentCohort || null,
    });
    if (error) { setStudentError('Este usuario ya pertenece a la universidad'); setAddingStudent(false); return; }
    setAddingStudent(false);
    setShowStudentForm(false);
    setStudentEmail(''); setStudentCareer(''); setStudentCohort('');
    loadUniData(selUni);
  };

  const removeStudent = async (id: string) => {
    await supabase.from('university_users').update({ active: false }).eq('id', id);
    setUsers(prev => prev.filter(u => u.id !== id));
  };

  const selectedUni = unis.find(u => u.id === selUni);
  const interviewCount = apps.filter(a => ['interview','final_interview'].includes(a.status)).length;
  const hiredCount     = apps.filter(a => a.status === 'hired').length;
  const offerCount     = apps.filter(a => a.status === 'offer').length;

  if (loading) return <div className="flex items-center justify-center h-64 text-zinc-400">Cargando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-zinc-900">Panel Universidad</h2>
          <p className="text-zinc-500 text-sm mt-0.5">Gestiona instituciones y alumnos</p>
        </div>
        <button onClick={() => setShowUniForm(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200">
          <Plus className="w-4 h-4" /> Nueva institución
        </button>
      </div>

      {unis.length === 0 ? (
        <div className="text-center py-20 text-zinc-400">
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No hay instituciones aún</p>
          <p className="text-sm">Agrega la primera universidad</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Sidebar universities */}
          <div className="space-y-2">
            {unis.map(u => (
              <button key={u.id} onClick={() => setSelUni(u.id)}
                className={cn(
                  'w-full text-left px-4 py-3 rounded-xl border transition-all',
                  selUni === u.id
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                    : 'bg-white border-zinc-100 text-zinc-700 hover:bg-zinc-50'
                )}>
                <p className="font-bold text-sm">{u.name}</p>
                <p className="text-xs opacity-60 mt-0.5 capitalize">{u.plan} · {u.credits_per_user} créditos/alumno</p>
              </button>
            ))}
          </div>

          {/* Main content */}
          {selectedUni && (
            <div className="lg:col-span-3 space-y-4">
              {/* Uni header */}
              <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-5 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-black">{selectedUni.name}</h3>
                    <p className="text-white/70 text-sm mt-0.5 capitalize">{selectedUni.plan} plan · {selectedUni.max_users} alumnos máx.</p>
                  </div>
                  <button onClick={() => loadUniData(selUni!)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-3 mt-4">
                  {[
                    { label: 'Alumnos', value: users.length },
                    { label: 'Postulaciones', value: apps.length },
                    { label: 'Entrevistas', value: interviewCount },
                    { label: 'Contratados', value: hiredCount },
                  ].map(s => (
                    <div key={s.label} className="bg-white/10 rounded-xl p-2.5 text-center">
                      <p className="text-2xl font-black">{s.value}</p>
                      <p className="text-white/70 text-xs">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 bg-zinc-100 rounded-xl p-1">
                {(['overview','students','applications'] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    className={cn(
                      'flex-1 py-1.5 text-sm font-bold rounded-lg capitalize transition-all',
                      tab === t ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
                    )}>
                    {t === 'overview' ? 'Resumen' : t === 'students' ? 'Alumnos' : 'Postulaciones'}
                  </button>
                ))}
              </div>

              {/* TAB: Overview */}
              {tab === 'overview' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {KANBAN_COLUMNS.map(col => {
                    const count = apps.filter(a => a.status === col.id).length;
                    return (
                      <div key={col.id} className="bg-white rounded-xl p-4 border border-zinc-100 shadow-sm">
                        <p className={cn('text-xs font-black uppercase tracking-wider', col.color)}>{col.label}</p>
                        <p className="text-3xl font-black text-zinc-900 mt-1">{count}</p>
                        <div className="mt-2 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full transition-all', col.bg.replace('50','400'))}
                            style={{ width: `${apps.length > 0 ? (count/apps.length)*100 : 0}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* TAB: Students */}
              {tab === 'students' && (
                <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-zinc-100 flex items-center justify-between">
                    <p className="font-black text-zinc-900">{users.length} alumnos activos</p>
                    <button onClick={() => setShowStudentForm(true)}
                      className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors">
                      <Plus className="w-3.5 h-3.5" /> Agregar alumno
                    </button>
                  </div>
                  <div className="divide-y divide-zinc-50">
                    {users.map(u => (
                      <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
                          <span className="text-xs font-black text-indigo-700">
                            {(u.profile?.full_name || u.profile?.email || '?')[0].toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-zinc-900 text-sm truncate">{u.profile?.full_name || '—'}</p>
                          <p className="text-xs text-zinc-400 truncate">{u.profile?.email}
                            {u.career ? ` · ${u.career}` : ''}{u.cohort ? ` · ${u.cohort}` : ''}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-bold text-zinc-700">{u.profile?.credits ?? 0} créditos</p>
                          <p className="text-[10px] text-zinc-400">
                            {u.profile?.last_active_at
                              ? new Date(u.profile.last_active_at).toLocaleDateString('es-CL')
                              : 'Sin actividad'}
                          </p>
                        </div>
                        <button onClick={() => removeStudent(u.id)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-zinc-300 hover:text-red-400 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    {users.length === 0 && (
                      <div className="p-8 text-center text-zinc-400 text-sm">
                        Aún no hay alumnos en esta institución
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB: Applications */}
              {tab === 'applications' && (
                <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-zinc-100">
                    <p className="font-black text-zinc-900">{apps.length} postulaciones totales</p>
                  </div>
                  <div className="divide-y divide-zinc-50 max-h-96 overflow-y-auto">
                    {apps.map(a => {
                      const col = KANBAN_COLUMNS.find(c => c.id === a.status);
                      return (
                        <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-zinc-900 text-sm truncate">{a.position}</p>
                            <p className="text-xs text-zinc-400 truncate">{a.company} · {a.profile?.full_name || a.profile?.email}</p>
                          </div>
                          <span className={cn('shrink-0 text-xs font-bold px-2.5 py-1 rounded-full', col?.bg, col?.color)}>
                            {col?.label}
                          </span>
                        </div>
                      );
                    })}
                    {apps.length === 0 && (
                      <div className="p-8 text-center text-zinc-400 text-sm">No hay postulaciones aún</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Add university modal */}
      {showUniForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowUniForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-black text-zinc-900 mb-4">Nueva institución</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Nombre *</label>
                <input value={uniForm.name} onChange={e => setUniForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Universidad de Chile / MBA Adolfo Ibáñez..." autoFocus
                  className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Créditos / alumno</label>
                  <input type="number" value={uniForm.credits_per_user} onChange={e => setUniForm(f => ({ ...f, credits_per_user: e.target.value }))}
                    className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Máx alumnos</label>
                  <input type="number" value={uniForm.max_users} onChange={e => setUniForm(f => ({ ...f, max_users: e.target.value }))}
                    className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Plan</label>
                <select value={uniForm.plan} onChange={e => setUniForm(f => ({ ...f, plan: e.target.value }))}
                  className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400 bg-white">
                  <option value="starter">Starter</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowUniForm(false)} className="px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 rounded-xl">Cancelar</button>
                <button onClick={saveUni} disabled={saving || !uniForm.name.trim()}
                  className="flex-1 px-4 py-2 text-sm font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50">
                  {saving ? 'Guardando...' : 'Crear institución'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add student modal */}
      {showStudentForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowStudentForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-black text-zinc-900 mb-4">Agregar alumno</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Email del alumno *</label>
                <input value={studentEmail} onChange={e => setStudentEmail(e.target.value)} autoFocus
                  placeholder="alumno@universidad.cl"
                  className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" />
              </div>
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Carrera / Programa</label>
                <input value={studentCareer} onChange={e => setStudentCareer(e.target.value)} placeholder="MBA, Ing. Comercial..."
                  className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" />
              </div>
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Cohorte / Año</label>
                <input value={studentCohort} onChange={e => setStudentCohort(e.target.value)} placeholder="MBA-2025"
                  className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" />
              </div>
              {studentError && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{studentError}</p>}
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setShowStudentForm(false); setStudentError(''); }} className="px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 rounded-xl">Cancelar</button>
                <button onClick={addStudent} disabled={addingStudent || !studentEmail.trim()}
                  className="flex-1 px-4 py-2 text-sm font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50">
                  {addingStudent ? 'Buscando...' : 'Agregar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
