import React, { useEffect, useRef, useState } from 'react';
import {
  Plus, Users, TrendingUp, Target, Award, Trash2, X,
  Building2, RefreshCw, Upload, UserPlus, AlertTriangle,
  CheckCircle2, FileSpreadsheet, ShieldCheck, Zap, ImagePlus,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import type { University, UniversityUser } from './types';
import { KANBAN_COLUMNS } from './types';

function cn(...c: (string | undefined | false)[]) { return c.filter(Boolean).join(' '); }

// ── Helpers ──────────────────────────────────────────────────────────────────

interface ImportRow { name: string; email: string; program: string; }

function parseExcel(file: File): Promise<ImportRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data  = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb    = XLSX.read(data, { type: 'array' });
        const ws    = wb.Sheets[wb.SheetNames[0]];
        const rows  = XLSX.utils.sheet_to_json<any>(ws, { defval: '' });
        // Accept headers: Nombre + Apellido (separados) o Name (combinado), Mail/Email, Master/Program
        const out: ImportRow[] = rows.map((r: any) => {
          // Combinar Nombre + Apellido si vienen en columnas separadas
          const nombre   = (r['Nombre']   || r['nombre']   || '').toString().trim();
          const apellido = (r['Apellido'] || r['apellido'] || '').toString().trim();
          const name = nombre && apellido
            ? `${nombre} ${apellido}`
            : (nombre || apellido || r['Name'] || r['name'] || '').toString().trim();
          return {
            name,
            email:   (r['Mail'] || r['Email'] || r['mail'] || r['email'] || '').toString().trim().toLowerCase(),
            program: (r['Master'] || r['Programa'] || r['Program'] || r['master'] || r['Programa/Master'] || '').toString().trim(),
          };
        }).filter((r: ImportRow) => r.email);
        resolve(out);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  /** 'admin' can see all universities; 'coordinator' is locked to scopedUniversityId */
  campusRole?: 'admin' | 'coordinator' | 'student';
  /** When campusRole === 'coordinator', restrict to this university only */
  scopedUniversityId?: string | null;
  /** Called whenever the selected university changes — lets CampusApp update its watermark */
  onUniversityLogoChange?: (name: string, logo_url: string | null) => void;
}

export const UniversityDashboard: React.FC<Props> = ({
  campusRole = 'admin',
  scopedUniversityId = null,
  onUniversityLogoChange,
}) => {
  const isCoordinator = campusRole === 'coordinator';

  const [unis,    setUnis]    = useState<University[]>([]);
  const [users,   setUsers]   = useState<UniversityUser[]>([]);
  const [apps,    setApps]    = useState<any[]>([]);
  const [selUni,  setSelUni]  = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState<'overview' | 'students' | 'applications'>('overview');
  const [cvStats, setCvStats] = useState({ initial: 0, adapted: 0 });

  // Admin user (for API calls)
  const [adminId, setAdminId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAdminId(data.user?.id ?? null));
  }, []);

  // ── Add university form ───────────────────────────────────────────────────
  const [showUniForm, setShowUniForm] = useState(false);
  const [uniForm, setUniForm] = useState({
    name: '', slug: '', credits_per_user: '5', credits_per_month: '5', max_users: '100', plan: 'starter',
  });
  const [saving, setSaving] = useState(false);

  // ── Delete university ─────────────────────────────────────────────────────
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null); // uni id to delete
  const [deleting, setDeleting] = useState(false);

  // ── Add coordinator ───────────────────────────────────────────────────────
  const [showCoordForm, setShowCoordForm] = useState(false);
  const [coordEmail, setCoordEmail] = useState('');
  const [addingCoord, setAddingCoord] = useState(false);
  const [coordError, setCoordError] = useState('');
  const [coordSuccess, setCoordSuccess] = useState('');

  // ── Add student (manual) ──────────────────────────────────────────────────
  const [showStudentForm, setShowStudentForm] = useState(false);
  const [studentName,     setStudentName]     = useState('');
  const [studentEmail,    setStudentEmail]    = useState('');
  const [studentCareer,   setStudentCareer]   = useState('');
  const [studentCohort,   setStudentCohort]   = useState('');
  const [studentCompany,  setStudentCompany]  = useState('');
  const [studentJobTitle, setStudentJobTitle] = useState('');
  const [addingStudent,   setAddingStudent]   = useState(false);
  const [studentError,    setStudentError]    = useState('');

  // ── Monthly credits ───────────────────────────────────────────────────────
  const [grantingCredits,  setGrantingCredits]  = useState(false);
  const [creditGrantResult, setCreditGrantResult] = useState<{ processed: number; skipped: number } | null>(null);

  const grantMonthlyCredits = async () => {
    if (!adminId) return;
    setGrantingCredits(true);
    setCreditGrantResult(null);
    try {
      const res = await fetch('/api/campus-monthly-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Pass university_id so coordinator can only grant credits for their uni
        body: JSON.stringify({ admin_user_id: adminId, university_id: selUni }),
      });
      const data = await res.json();
      setCreditGrantResult({ processed: data.processed ?? 0, skipped: data.skipped ?? 0 });
    } catch {
      setCreditGrantResult({ processed: 0, skipped: -1 }); // -1 = error flag
    }
    setGrantingCredits(false);
  };

  // ── Logo upload ───────────────────────────────────────────────────────────
  const logoRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const onLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selUni) return;
    setUploadingLogo(true);
    try {
      const ext  = file.name.split('.').pop() ?? 'png';
      const path = `logos/${selUni}.${ext}`;
      const { error } = await supabase.storage
        .from('university-assets')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (!error) {
        const { data: { publicUrl } } = supabase.storage
          .from('university-assets').getPublicUrl(path);
        await supabase.from('universities').update({ logo_url: publicUrl }).eq('id', selUni);
        // Update watermark immediately
        const uniName = unis.find(u => u.id === selUni)?.name ?? '';
        onUniversityLogoChange?.(uniName, publicUrl);
        loadAll();
      }
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  };

  // ── Excel import ──────────────────────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement>(null);
  const [importRows,    setImportRows]    = useState<ImportRow[]>([]);
  const [showImport,    setShowImport]    = useState(false);
  const [importing,     setImporting]     = useState(false);
  const [importResult,  setImportResult]  = useState<{ created: number; enrolled: number; skipped: number; errors: string[] } | null>(null);

  // ── Load ─────────────────────────────────────────────────────────────────
  useEffect(() => { loadAll(); }, []);
  useEffect(() => { if (selUni) loadUniData(selUni); }, [selUni]);

  const loadAll = async () => {
    setLoading(true);

    let q = supabase.from('universities').select('*').eq('active', true).order('created_at', { ascending: false });

    // Coordinator: only their assigned university
    if (isCoordinator && scopedUniversityId) {
      q = q.eq('id', scopedUniversityId);
    }

    const { data } = await q;
    setUnis(data || []);

    // Coordinator is always locked to their university
    if (isCoordinator && scopedUniversityId) {
      setSelUni(scopedUniversityId);
      const first = data?.find(u => u.id === scopedUniversityId);
      if (first) onUniversityLogoChange?.(first.name, first.logo_url ?? null);
    } else if (data && data.length > 0 && !selUni) {
      setSelUni(data[0].id);
      onUniversityLogoChange?.(data[0].name, data[0].logo_url ?? null);
    }

    setLoading(false);
  };

  const loadUniData = async (uniId: string) => {
    // Try SECURITY DEFINER RPC first (bypasses RLS so admin sees all members).
    // Falls back to direct query if the function doesn't exist yet in Supabase.
    const { data: rpcData, error: rpcErr } = await supabase
      .rpc('get_university_members', { p_university_id: uniId });

    let membersData: any[] = [];
    if (!rpcErr && rpcData) {
      membersData = rpcData;
    } else {
      // Fallback: direct query (works once RLS policy allows admin to see all rows)
      const { data: directData } = await supabase
        .from('university_users')
        .select('*, profile:profiles(email, full_name, credits, last_active_at)')
        .eq('university_id', uniId)
        .eq('active', true);
      membersData = directData || [];
    }

    const [aRes] = await Promise.all([
      supabase.from('applications')
        .select('*, profile:profiles(full_name, email)')
        .eq('university_id', uniId).order('created_at', { ascending: false }),
    ]);
    const allUsers = membersData;
    setUsers(allUsers);
    setApps(aRes.data || []);

    // CV stats for students
    const studentIds = allUsers.filter(u => u.role === 'student').map(u => u.user_id);
    if (studentIds.length > 0) {
      const [initRes, adaptRes] = await Promise.all([
        supabase.from('adaptations').select('id', { count: 'exact', head: true })
          .in('user_id', studentIds).gt('initial_score', 0),
        supabase.from('adaptations').select('id', { count: 'exact', head: true })
          .in('user_id', studentIds).gt('final_score', 0),
      ]);
      setCvStats({ initial: initRes.count || 0, adapted: adaptRes.count || 0 });
    } else {
      setCvStats({ initial: 0, adapted: 0 });
    }
  };

  // ── Create university ─────────────────────────────────────────────────────
  const saveUni = async () => {
    if (!uniForm.name.trim()) return;
    setSaving(true);
    const slug = uniForm.slug || uniForm.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    await supabase.from('universities').insert({
      name: uniForm.name.trim(), slug,
      credits_per_user:  parseInt(uniForm.credits_per_user)  || 5,
      credits_per_month: parseInt(uniForm.credits_per_month) || 5,
      max_users: parseInt(uniForm.max_users) || 100,
      plan: uniForm.plan,
      active: true,
    });
    setSaving(false);
    setShowUniForm(false);
    setUniForm({ name: '', slug: '', credits_per_user: '5', credits_per_month: '5', max_users: '100', plan: 'starter' });
    loadAll();
  };

  // ── Delete university ─────────────────────────────────────────────────────
  const deleteUni = async (uniId: string) => {
    setDeleting(true);
    await supabase.from('universities').update({ active: false }).eq('id', uniId);
    setDeleting(false);
    setDeleteConfirm(null);
    if (selUni === uniId) setSelUni(null);
    loadAll();
  };

  // ── Add coordinator ───────────────────────────────────────────────────────
  const addCoordinator = async () => {
    if (!coordEmail.trim() || !selUni) return;
    setAddingCoord(true); setCoordError(''); setCoordSuccess('');

    const { data: prof } = await supabase
      .from('profiles').select('id, full_name').eq('email', coordEmail.trim().toLowerCase()).maybeSingle();

    if (!prof) {
      setCoordError('No existe un usuario con ese email en CVJOB. El coordinador debe registrarse primero.');
      setAddingCoord(false); return;
    }

    // Upsert: if already enrolled as student, upgrade to coordinator
    const { data: existing } = await supabase
      .from('university_users').select('id, role')
      .eq('user_id', prof.id).eq('university_id', selUni).maybeSingle();

    if (existing) {
      await supabase.from('university_users')
        .update({ role: 'coordinator', active: true }).eq('id', existing.id);
    } else {
      const { error } = await supabase.from('university_users').insert({
        university_id: selUni, user_id: prof.id, role: 'coordinator', active: true,
      });
      if (error) {
        setCoordError('Error al agregar coordinador'); setAddingCoord(false); return;
      }
    }

    setCoordSuccess(`${prof.full_name || coordEmail} ahora es coordinador de esta institución`);
    setCoordEmail('');
    setAddingCoord(false);
    loadUniData(selUni);
  };

  // ── Add student (manual) ─────────────────────────────────────────────────
  const addStudent = async () => {
    if (!studentEmail.trim() || !selUni) return;
    setAddingStudent(true); setStudentError('');
    const { data: prof } = await supabase
      .from('profiles').select('id').eq('email', studentEmail.trim().toLowerCase()).maybeSingle();
    if (!prof) {
      setStudentError('No existe un usuario con ese email en CVJOB. Debe registrarse primero en cvjob.cl');
      setAddingStudent(false); return;
    }
    if (studentName.trim()) {
      await supabase.from('profiles').update({ full_name: studentName.trim() }).eq('id', prof.id);
    }
    // Check if already enrolled
    const { data: existing } = await supabase
      .from('university_users').select('id, active')
      .eq('user_id', prof.id).eq('university_id', selUni).maybeSingle();
    if (existing) {
      if (!existing.active) {
        await supabase.from('university_users').update({
          active: true, role: 'student',
          career: studentCareer || null, cohort: studentCohort || null,
          company: studentCompany || null, job_title: studentJobTitle || null,
        }).eq('id', existing.id);
      } else {
        setStudentError('Este alumno ya está inscrito en esta universidad');
        setAddingStudent(false); return;
      }
    } else {
      const { error } = await supabase.from('university_users').insert({
        university_id: selUni, user_id: prof.id, role: 'student',
        career:    studentCareer    || null,
        cohort:    studentCohort    || null,
        company:   studentCompany   || null,
        job_title: studentJobTitle  || null,
      });
      if (error) { setStudentError('Error al agregar alumno: ' + error.message); setAddingStudent(false); return; }
    }
    setAddingStudent(false);
    setShowStudentForm(false);
    setStudentName(''); setStudentEmail(''); setStudentCareer('');
    setStudentCohort(''); setStudentCompany(''); setStudentJobTitle('');
    loadUniData(selUni!);
  };

  // ── Excel import ──────────────────────────────────────────────────────────
  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await parseExcel(file);
      setImportRows(rows);
      setShowImport(true);
      setImportResult(null);
    } catch {
      alert('Error al leer el archivo. Asegúrate de que sea .xlsx o .xls con columnas: Nombre, Mail, Master');
    }
    e.target.value = '';
  };

  const runImport = async () => {
    if (!importRows.length || !selUni || !adminId) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch('/api/campus-import-students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_user_id: adminId, university_id: selUni, students: importRows }),
      });
      const data = await res.json();
      setImportResult(data);
      loadUniData(selUni);
    } catch {
      setImportResult({ created: 0, enrolled: 0, skipped: 0, errors: ['Error de conexión'] });
    }
    setImporting(false);
  };

  const removeStudent = async (id: string) => {
    await supabase.from('university_users').update({ active: false }).eq('id', id);
    setUsers(prev => prev.filter(u => u.id !== id));
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const selectedUni     = unis.find(u => u.id === selUni);
  const interviewCount  = apps.filter(a => ['interview','final_interview'].includes(a.status)).length;
  const hiredCount      = apps.filter(a => a.status === 'hired').length;
  const studentList     = users.filter(u => u.role === 'student');
  const coordList       = users.filter(u => u.role === 'coordinator' || u.role === 'admin');

  if (loading) return <div className="flex items-center justify-center h-64 text-zinc-400">Cargando...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-zinc-900">Panel Universidad</h2>
          <p className="text-zinc-500 text-sm mt-0.5">
            {isCoordinator ? 'Tu institución asignada' : 'Gestiona instituciones y alumnos'}
          </p>
        </div>
        {/* Only super admin can create universities */}
        {!isCoordinator && (
          <button onClick={() => setShowUniForm(true)}
            className="flex items-center gap-2 bg-indigo-600 text-white font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200">
            <Plus className="w-4 h-4" /> Nueva institución
          </button>
        )}
      </div>

      {unis.length === 0 ? (
        <div className="text-center py-20 text-zinc-400">
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No hay instituciones aún</p>
          <p className="text-sm">Agrega la primera universidad</p>
        </div>
      ) : (
        /* Coordinator: full width (no sidebar); Admin: 4-col grid with sidebar */
        <div className={cn('grid grid-cols-1 gap-4', !isCoordinator && 'lg:grid-cols-4')}>

          {/* ── Sidebar: university list (admin only) ───────────────────── */}
          {!isCoordinator && (
          <div className="space-y-2">
            {unis.map(u => (
              <div key={u.id}
                className={cn(
                  'w-full text-left rounded-xl border transition-all group',
                  selUni === u.id
                    ? 'bg-indigo-50 border-indigo-200'
                    : 'bg-white border-zinc-100 hover:bg-zinc-50'
                )}>
                <div className="flex items-center gap-2 px-4 py-3">
                  <button onClick={() => { setSelUni(u.id); onUniversityLogoChange?.(u.name, u.logo_url ?? null); }} className="flex-1 text-left min-w-0">
                    <p className={cn('font-bold text-sm', selUni === u.id ? 'text-indigo-700' : 'text-zinc-700')}>
                      {u.name}
                    </p>
                    <p className="text-xs opacity-60 mt-0.5 capitalize">
                      {u.plan} · {u.credits_per_month ?? u.credits_per_user} créditos/mes
                    </p>
                  </button>
                  {/* Delete button — admin only */}
                  <button
                    onClick={() => setDeleteConfirm(u.id)}
                    className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded-lg hover:bg-red-50 text-zinc-300 hover:text-red-400 transition-all shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          )} {/* end !isCoordinator sidebar */}

          {/* ── Main content ─────────────────────────────────────────────── */}
          {selectedUni && (
            <div className={cn('space-y-4', !isCoordinator && 'lg:col-span-3')}>

              {/* Hidden logo file input */}
              <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={onLogoChange} />

              {/* Uni header banner */}
              <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-5 text-white">
                <div className="flex items-start justify-between gap-3">
                  {/* Left: logo + name */}
                  <div className="flex items-center gap-4">
                    {/* Logo slot — click to upload */}
                    <button
                      onClick={() => logoRef.current?.click()}
                      disabled={uploadingLogo}
                      title="Subir logo de la universidad"
                      className="relative w-16 h-16 rounded-2xl bg-white/10 hover:bg-white/20 border-2 border-white/20 hover:border-white/40 transition-all flex items-center justify-center shrink-0 overflow-hidden group"
                    >
                      {selectedUni.logo_url ? (
                        <>
                          <img src={selectedUni.logo_url} alt="logo" className="w-14 h-14 object-contain" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <ImagePlus className="w-5 h-5 text-white" />
                          </div>
                        </>
                      ) : (
                        uploadingLogo
                          ? <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          : <ImagePlus className="w-6 h-6 text-white/60 group-hover:text-white transition-colors" />
                      )}
                    </button>
                    <div>
                      <h3 className="text-xl font-black">{selectedUni.name}</h3>
                      <p className="text-white/70 text-sm mt-0.5 capitalize">
                        {selectedUni.plan} plan · {selectedUni.max_users} alumnos máx.
                        · {selectedUni.credits_per_month ?? selectedUni.credits_per_user} créditos/mes
                      </p>
                      {!selectedUni.logo_url && (
                        <button onClick={() => logoRef.current?.click()}
                          className="mt-1 text-[10px] text-white/50 hover:text-white/80 underline transition-colors">
                          + Subir logo
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Grant monthly credits — super admin only */}
                    {!isCoordinator && (
                      <button onClick={grantMonthlyCredits} disabled={grantingCredits}
                        title="Cargar créditos del mes a todos los alumnos activos"
                        className="flex items-center gap-1.5 text-xs font-bold bg-white/15 hover:bg-white/25 disabled:opacity-50 px-3 py-1.5 rounded-xl transition-colors">
                        <Zap className={cn('w-3.5 h-3.5', grantingCredits && 'animate-pulse')} />
                        {grantingCredits ? 'Cargando...' : 'Cargar créditos del mes'}
                      </button>
                    )}
                    <button onClick={() => loadUniData(selUni!)}
                      className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {/* Credit grant result toast */}
                {creditGrantResult && (
                  <div className={cn(
                    'mt-3 rounded-xl px-3 py-2 text-xs font-semibold flex items-center gap-2',
                    creditGrantResult.skipped === -1
                      ? 'bg-red-500/30 text-red-100'
                      : 'bg-white/15 text-white'
                  )}>
                    {creditGrantResult.skipped === -1 ? (
                      <><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Error al cargar créditos. Intenta de nuevo.</>
                    ) : (
                      <><CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        {creditGrantResult.processed} alumnos recibieron créditos
                        {creditGrantResult.skipped > 0 ? ` · ${creditGrantResult.skipped} ya los tenían este mes` : ''}
                      </>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-4 gap-3 mt-4">
                  {[
                    { label: 'Alumnos',       value: studentList.length },
                    { label: 'Postulaciones', value: apps.length },
                    { label: 'Entrevistas',   value: interviewCount },
                    { label: 'Contratados',   value: hiredCount },
                  ].map(s => (
                    <div key={s.label} className="bg-white/10 rounded-xl p-2.5 text-center">
                      <p className="text-2xl font-black">{s.value}</p>
                      <p className="text-white/70 text-xs">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Coordinator section ───────────────────────────────────── */}
              <div className="bg-gradient-to-br from-violet-50 to-indigo-50 rounded-2xl border border-violet-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-violet-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-violet-600" />
                    <p className="font-black text-violet-900 text-sm">
                      Coordinadores
                    </p>
                    <span className="text-xs font-bold text-violet-500 bg-violet-100 px-2 py-0.5 rounded-full">
                      {coordList.length}
                    </span>
                  </div>
                  <button onClick={() => { setShowCoordForm(v => !v); setCoordError(''); setCoordSuccess(''); }}
                    className="flex items-center gap-1.5 text-xs font-bold text-violet-600 bg-white hover:bg-violet-100 border border-violet-200 px-3 py-1.5 rounded-lg transition-colors">
                    <UserPlus className="w-3.5 h-3.5" /> Agregar coordinador
                  </button>
                </div>

                {showCoordForm && (
                  <div className="px-4 py-3 bg-white/70 border-b border-violet-100">
                    <div className="flex gap-2">
                      <input value={coordEmail}
                        onChange={e => { setCoordEmail(e.target.value); setCoordError(''); setCoordSuccess(''); }}
                        placeholder="email@coordinador.cl"
                        autoFocus
                        className="flex-1 border border-violet-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-violet-400 bg-white" />
                      <button onClick={addCoordinator} disabled={addingCoord || !coordEmail.trim()}
                        className="px-4 py-2 text-sm font-bold bg-violet-600 text-white rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-colors">
                        {addingCoord ? '...' : 'Asignar'}
                      </button>
                    </div>
                    {coordError   && <p className="mt-2 text-xs text-red-600">{coordError}</p>}
                    {coordSuccess && <p className="mt-2 text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />{coordSuccess}</p>}
                    <p className="mt-2 text-[10px] text-zinc-400">El coordinador debe tener una cuenta en CVJOB. Verá Panel Universidad + Comunidad en Campus.</p>
                  </div>
                )}

                {coordList.length === 0 ? (
                  <div className="p-6 text-center text-violet-300">
                    <ShieldCheck className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-xs font-semibold text-violet-400">Sin coordinadores asignados</p>
                    <p className="text-[10px] text-violet-300 mt-0.5">Agrega un coordinador para que pueda gestionar este campus</p>
                  </div>
                ) : (
                  <div className="divide-y divide-violet-100/60 px-1 py-1">
                    {coordList.map(u => (
                      <div key={u.id} className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/60 transition-colors">
                        <div className="w-10 h-10 bg-gradient-to-br from-violet-400 to-indigo-500 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
                          <span className="text-sm font-black text-white">
                            {(u.profile?.full_name || u.profile?.email || '?')[0].toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-zinc-900 text-sm truncate">{u.profile?.full_name || '—'}</p>
                          <p className="text-xs text-zinc-500 truncate">{u.profile?.email}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-black text-violet-700 bg-violet-100 px-2 py-1 rounded-full uppercase tracking-wide">
                            {u.role}
                          </span>
                          <button onClick={() => removeStudent(u.id)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-violet-200 hover:text-red-400 transition-colors"
                            title="Quitar coordinador">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Sub-tabs ─────────────────────────────────────────────── */}
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
                <div className="space-y-3">
                  {/* CV stats */}
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'CVs con match inicial', value: cvStats.initial, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                      { label: 'CVs adaptados',         value: cvStats.adapted, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    ].map(s => (
                      <div key={s.label} className={cn('rounded-xl p-4 border border-zinc-100 shadow-sm', s.bg)}>
                        <p className={cn('text-xs font-black uppercase tracking-wider', s.color)}>{s.label}</p>
                        <p className="text-3xl font-black text-zinc-900 mt-1">{s.value}</p>
                      </div>
                    ))}
                  </div>
                  {/* Application funnel — excludes viewed & rejected */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {KANBAN_COLUMNS.filter(col => col.id !== 'viewed' && col.id !== 'rejected').map(col => {
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
                </div>
              )}

              {/* TAB: Students */}
              {tab === 'students' && (
                <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-zinc-100 flex items-center justify-between gap-2">
                    <p className="font-black text-zinc-900">{studentList.length} alumnos activos</p>
                    <div className="flex items-center gap-2">
                      {/* Excel import button */}
                      <button onClick={() => fileRef.current?.click()}
                        className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors">
                        <FileSpreadsheet className="w-3.5 h-3.5" /> Importar Excel
                      </button>
                      <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onFileChange} />
                      {/* Manual add */}
                      <button onClick={() => setShowStudentForm(true)}
                        className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors">
                        <Plus className="w-3.5 h-3.5" /> Agregar
                      </button>
                    </div>
                  </div>

                  <div className="divide-y divide-zinc-50">
                    {studentList.map(u => (
                      <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
                          <span className="text-xs font-black text-indigo-700">
                            {(u.profile?.full_name || u.profile?.email || '?')[0].toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-zinc-900 text-sm truncate">{u.profile?.full_name || '—'}</p>
                          <p className="text-xs text-zinc-400 truncate">
                            {u.profile?.email}{u.career ? ` · ${u.career}` : ''}{u.cohort ? ` · ${u.cohort}` : ''}
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
                    {studentList.length === 0 && (
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
                            <p className="text-xs text-zinc-400 truncate">
                              {a.company} · {a.profile?.full_name || a.profile?.email}
                            </p>
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

      {/* ════ MODALS ════════════════════════════════════════════════════════════ */}

      {/* Delete university confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-black text-zinc-900">Eliminar institución</h3>
                <p className="text-xs text-zinc-400">Esta acción se puede deshacer contactando soporte</p>
              </div>
            </div>
            <p className="text-sm text-zinc-600 mb-5">
              ¿Confirmas que quieres eliminar <strong>{unis.find(u => u.id === deleteConfirm)?.name}</strong>?
              Los alumnos y postulaciones no se eliminarán.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors">
                Cancelar
              </button>
              <button onClick={() => deleteUni(deleteConfirm)} disabled={deleting}
                className="flex-1 px-4 py-2 text-sm font-bold bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors">
                {deleting ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
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
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Créditos mensuales</label>
                  <input type="number" value={uniForm.credits_per_month} onChange={e => setUniForm(f => ({ ...f, credits_per_month: e.target.value }))}
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
              <p className="text-xs text-zinc-400 bg-zinc-50 rounded-xl p-3">
                Los créditos mensuales se cargan automáticamente el día 1 de cada mes a todos los alumnos activos.
              </p>
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

      {/* Add student modal (manual) */}
      {showStudentForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => { setShowStudentForm(false); setStudentName(''); setStudentEmail(''); setStudentCareer(''); setStudentCohort(''); setStudentCompany(''); setStudentJobTitle(''); setStudentError(''); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-black text-zinc-900">Agregar alumno</h3>
              <button onClick={() => setShowStudentForm(false)} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-zinc-100">
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </div>
            <div className="space-y-3">
              {/* Datos personales */}
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">Datos personales</p>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="text-xs font-semibold text-zinc-500">Nombre completo</label>
                  <input value={studentName} onChange={e => setStudentName(e.target.value)} autoFocus
                    placeholder="Juan Pérez"
                    className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-zinc-500">Email *</label>
                  <input value={studentEmail} onChange={e => setStudentEmail(e.target.value)}
                    placeholder="alumno@correo.cl"
                    className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" />
                  <p className="text-[10px] text-zinc-400 mt-0.5">Debe tener cuenta en CVJOB</p>
                </div>
              </div>

              {/* Datos académicos */}
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider pt-1">Datos académicos</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-zinc-500">Programa / Carrera</label>
                  <input value={studentCareer} onChange={e => setStudentCareer(e.target.value)} placeholder="MBA, Ing. Comercial..."
                    className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-zinc-500">Cohorte / Año</label>
                  <input value={studentCohort} onChange={e => setStudentCohort(e.target.value)} placeholder="MBA-2025"
                    className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" />
                </div>
              </div>

              {/* Situación laboral */}
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider pt-1">Situación laboral (opcional)</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-zinc-500">Empresa actual</label>
                  <input value={studentCompany} onChange={e => setStudentCompany(e.target.value)} placeholder="Empresa S.A."
                    className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-zinc-500">Cargo actual</label>
                  <input value={studentJobTitle} onChange={e => setStudentJobTitle(e.target.value)} placeholder="Analista, Gerente..."
                    className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" />
                </div>
              </div>

              {studentError && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{studentError}</p>}
              <div className="flex gap-2 pt-2">
                <button onClick={() => { setShowStudentForm(false); setStudentError(''); }}
                  className="px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors">
                  Cancelar
                </button>
                <button onClick={addStudent} disabled={addingStudent || !studentEmail.trim()}
                  className="flex-1 px-4 py-2 text-sm font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                  {addingStudent ? 'Agregando...' : 'Agregar alumno'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Excel import preview modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => { if (!importing) { setShowImport(false); setImportResult(null); } }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                <h3 className="font-black text-zinc-900">Importar alumnos</h3>
              </div>
              {!importing && (
                <button onClick={() => { setShowImport(false); setImportResult(null); }}
                  className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-zinc-100">
                  <X className="w-4 h-4 text-zinc-400" />
                </button>
              )}
            </div>

            {!importResult ? (
              <>
                <p className="text-sm text-zinc-500 mb-3">
                  Se encontraron <strong>{importRows.length} alumnos</strong> en el archivo.
                  Se enviará un email de invitación a los que no tengan cuenta en CVJOB.
                </p>
                {/* Preview table */}
                <div className="border border-zinc-100 rounded-xl overflow-hidden mb-4">
                  <div className="grid grid-cols-3 bg-zinc-50 px-3 py-2 text-xs font-black text-zinc-400 uppercase tracking-wider">
                    <span>Nombre</span><span>Email</span><span>Programa</span>
                  </div>
                  <div className="divide-y divide-zinc-50 max-h-48 overflow-y-auto">
                    {importRows.map((r, i) => (
                      <div key={i} className="grid grid-cols-3 px-3 py-2 text-xs text-zinc-700">
                        <span className="truncate">{r.name || '—'}</span>
                        <span className="truncate text-zinc-500">{r.email}</span>
                        <span className="truncate text-zinc-400">{r.program || '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setShowImport(false); setImportResult(null); }}
                    className="px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 rounded-xl">
                    Cancelar
                  </button>
                  <button onClick={runImport} disabled={importing}
                    className="flex-1 py-2 text-sm font-bold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2">
                    {importing ? (
                      <><RefreshCw className="w-4 h-4 animate-spin" /> Importando...</>
                    ) : (
                      <><Upload className="w-4 h-4" /> Importar {importRows.length} alumnos</>
                    )}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-3 mb-5">
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Cuentas creadas', value: importResult.created, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                      { label: 'Matriculados',    value: importResult.enrolled, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                      { label: 'Ya existían',     value: importResult.skipped, color: 'text-zinc-500', bg: 'bg-zinc-50' },
                    ].map(s => (
                      <div key={s.label} className={cn('rounded-xl p-3 text-center', s.bg)}>
                        <p className={cn('text-2xl font-black', s.color)}>{s.value}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">{s.label}</p>
                      </div>
                    ))}
                  </div>
                  {importResult.created > 0 && (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-xs text-emerald-700">
                      ✅ Se enviaron emails de invitación a los {importResult.created} alumnos nuevos.
                      Deben hacer clic en el link para activar su cuenta.
                    </div>
                  )}
                  {importResult.errors.length > 0 && (
                    <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-xs text-red-600">
                      <p className="font-bold mb-1">{importResult.errors.length} errores:</p>
                      {importResult.errors.slice(0, 5).map((e, i) => <p key={i}>{e}</p>)}
                    </div>
                  )}
                </div>
                <button onClick={() => { setShowImport(false); setImportResult(null); }}
                  className="w-full py-2.5 text-sm font-bold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-colors">
                  Cerrar
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
