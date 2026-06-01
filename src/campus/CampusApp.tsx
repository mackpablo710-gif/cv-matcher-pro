/**
 * CVJOB Campus — Shell
 *
 * Flow:
 *  - Admin    → tabs: Mi Dashboard, Postulaciones, Comunidad, Panel Universidad
 *  - Coordinator → university entry screen → Comunidad + Panel Universidad
 *  - Student  → university entry screen → Mi Dashboard, Postulaciones, Comunidad
 *
 * University logo shown as watermark in content area.
 */

import React, { useEffect, useState } from 'react';
import {
  GraduationCap, LayoutDashboard, ClipboardList,
  Building2, ChevronLeft, Users, ArrowRight,
} from 'lucide-react';
import { supabase }            from '../lib/supabase';
import { StudentDashboard }    from './StudentDashboard';
import { KanbanBoard }         from './KanbanBoard';
import { UniversityDashboard } from './UniversityDashboard';
import { CommunityHub }        from './community/CommunityHub';

function cn(...c: (string | undefined | false)[]) { return c.filter(Boolean).join(' '); }

type CampusTab  = 'student_dash' | 'kanban' | 'community' | 'university';
type CampusRole = 'student' | 'coordinator' | 'admin';

interface UniData { name: string; logo_url?: string | null; }

interface Props {
  profile: any;
  user: any;
  isAdmin: boolean;
  onExit: () => void;
  onNewAdaptation: () => void;
}

export const CampusApp: React.FC<Props> = ({
  profile, user, isAdmin, onExit, onNewAdaptation,
}) => {
  const [tab,          setTab]          = useState<CampusTab>('student_dash');
  const [campusRole,   setCampusRole]   = useState<CampusRole>('student');
  const [universityId, setUniversityId] = useState<string | null>(null);
  const [uniData,      setUniData]      = useState<UniData | null>(null);
  const [verified,     setVerified]     = useState(false);
  const [verifying,    setVerifying]    = useState(true);
  // Students see a university entry screen first; admin/coordinator skip it
  const [enteredUni,   setEnteredUni]   = useState(false);

  useEffect(() => {
    if (!user) { onExit(); return; }
    verifyAccess();
  }, [user]);

  const verifyAccess = async () => {
    try {
      if (isAdmin) {
        const res = await fetch('/api/campus-verify', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ user_id: user.id }),
        });
        const data = await res.json();
        if (!data.ok) { onExit(); return; }
        setCampusRole('admin');
        setEnteredUni(true); // admin skips entry screen
        // Load first active university for header logo + watermark
        const { data: firstUni } = await supabase
          .from('universities').select('name, logo_url')
          .eq('active', true).order('created_at').limit(1).single();
        if (firstUni) setUniData(firstUni);
      } else {
        let uUser: { role: string; university_id: string } | null = null;

        const { data: rpcData } = await supabase.rpc('get_my_campus_role');
        if (rpcData && (rpcData as any[]).length > 0) {
          uUser = (rpcData as any[])[0];
        } else {
          const { data: directData } = await supabase
            .from('university_users')
            .select('role, university_id')
            .eq('user_id', user.id)
            .eq('active', true)
            .maybeSingle();
          uUser = directData;
        }

        if (!uUser) { onExit(); return; }
        const role = (uUser.role as CampusRole) || 'student';
        setCampusRole(role);
        setUniversityId(uUser.university_id ?? null);

        // Load university name + logo
        if (uUser.university_id) {
          const { data: uni } = await supabase
            .from('universities')
            .select('name, logo_url')
            .eq('id', uUser.university_id)
            .single();
          if (uni) setUniData(uni);
        }

        // Coordinators skip the entry screen (land on university panel)
        if (role === 'coordinator') setEnteredUni(true);
      }

      setVerified(true);
    } catch {
      onExit();
    } finally {
      setVerifying(false);
    }
  };

  if (verifying) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-center text-slate-400">
        <GraduationCap className="w-10 h-10 mx-auto mb-3 animate-pulse" />
        <p className="text-sm font-medium">Verificando acceso...</p>
      </div>
    </div>
  );

  if (!verified) return null;

  // ── University entry screen (students only) ──────────────────────────────────
  if (!enteredUni) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-6">
        {/* Logo watermark */}
        {uniData?.logo_url && (
          <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
            <img src={uniData.logo_url} alt="" className="max-w-sm opacity-[0.05] select-none" />
          </div>
        )}

        <div className="relative z-10 text-center max-w-sm w-full">
          {/* University logo */}
          <div className="mb-6 flex justify-center">
            {uniData?.logo_url ? (
              <div className="w-24 h-24 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-2xl overflow-hidden">
                <img src={uniData.logo_url} alt={uniData.name} className="w-20 h-20 object-contain" />
              </div>
            ) : (
              <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-2xl">
                <GraduationCap className="w-12 h-12 text-white" />
              </div>
            )}
          </div>

          {/* University name */}
          <h1 className="text-3xl font-black text-white leading-tight">
            {uniData?.name ?? 'Campus CVJOB'}
          </h1>
          <p className="text-slate-400 text-sm mt-2">
            Bienvenido/a, <span className="text-white font-semibold">{profile?.full_name || user?.email?.split('@')[0]}</span>
          </p>

          {/* CVJOB Campus badge */}
          <div className="flex items-center justify-center gap-2 mt-4">
            <div className="w-5 h-5 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-md flex items-center justify-center">
              <GraduationCap className="w-3 h-3 text-white" />
            </div>
            <span className="text-xs font-bold text-indigo-300">CVJOB Campus</span>
            <span className="text-[10px] font-black bg-amber-400/20 text-amber-300 px-1.5 py-0.5 rounded">BETA</span>
          </div>

          {/* Enter button */}
          <button
            onClick={() => setEnteredUni(true)}
            className="mt-8 w-full flex items-center justify-center gap-2 bg-white text-slate-900 font-black text-sm py-4 rounded-2xl hover:bg-indigo-50 transition-colors shadow-2xl shadow-indigo-900/40"
          >
            Entrar al Campus
            <ArrowRight className="w-4 h-4" />
          </button>

          <button onClick={onExit}
            className="mt-3 w-full text-xs text-slate-500 hover:text-slate-300 py-2 transition-colors">
            ← Volver a CVJOB
          </button>
        </div>
      </div>
    );
  }

  // ── Tab visibility ────────────────────────────────────────────────────────────
  const isCoordinator    = campusRole === 'coordinator';
  const canSeeUniversity = campusRole === 'coordinator' || campusRole === 'admin';

  const tabs = [
    ...(!isCoordinator ? [
      { id: 'student_dash' as CampusTab, label: 'Mi Dashboard',     icon: LayoutDashboard },
      { id: 'kanban'       as CampusTab, label: 'Mis Postulaciones', icon: ClipboardList },
    ] : []),
    { id: 'community' as CampusTab, label: 'Comunidad',            icon: Users },
    ...(canSeeUniversity
      ? [{ id: 'university' as CampusTab, label: 'Panel Universidad', icon: Building2 }]
      : []
    ),
  ];

  const activeTab = tabs.find(t => t.id === tab) ? tab
    : (isCoordinator ? 'university' : 'student_dash');

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">

      {/* University logo watermark — left + right sides, always visible */}
      {uniData?.logo_url && (
        <>
          {/* Left watermark */}
          <div className="fixed left-0 top-0 bottom-0 flex items-center pointer-events-none z-0"
            style={{ width: '260px' }}>
            <img
              src={uniData.logo_url}
              alt=""
              className="select-none"
              style={{ width: '220px', opacity: 0.13, filter: 'grayscale(20%)', transform: 'translateX(20px)' }}
            />
          </div>
          {/* Right watermark */}
          <div className="fixed right-0 top-0 bottom-0 flex items-center pointer-events-none z-0"
            style={{ width: '260px' }}>
            <img
              src={uniData.logo_url}
              alt=""
              className="select-none"
              style={{ width: '220px', opacity: 0.13, filter: 'grayscale(20%)', transform: 'translateX(-20px)' }}
            />
          </div>
        </>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <header className="bg-gradient-to-r from-slate-900 to-indigo-950 border-b border-slate-800 shadow-lg sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">

          {/* Brand + university name */}
          <div className="flex items-center gap-2.5 shrink-0">
            {uniData?.logo_url ? (
              <div className="w-7 h-7 rounded-lg bg-white/10 border border-white/20 overflow-hidden flex items-center justify-center">
                <img src={uniData.logo_url} alt="" className="w-6 h-6 object-contain" />
              </div>
            ) : (
              <div className="w-7 h-7 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-lg flex items-center justify-center">
                <GraduationCap className="w-4 h-4 text-white" />
              </div>
            )}
            <span className="font-black text-white text-sm hidden sm:block">
              {uniData?.name
                ? <>{uniData.name} <span className="text-indigo-300 font-bold">· Campus</span></>
                : <>CVJOB <span className="text-indigo-300">Campus</span></>
              }
            </span>
            <span className="font-black text-white text-sm sm:hidden">Campus</span>
            <span className="text-xs font-bold bg-amber-400/20 text-amber-300 px-1.5 py-0.5 rounded-md">BETA</span>
          </div>

          {/* Tabs */}
          <nav className="flex items-center gap-1 flex-1 overflow-x-auto scrollbar-hide">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap shrink-0',
                  activeTab === t.id
                    ? 'bg-white/10 text-white'
                    : 'text-slate-400 hover:bg-white/10 hover:text-white'
                )}>
                <t.icon className="w-4 h-4" />
                <span className="hidden sm:block">{t.label}</span>
              </button>
            ))}
          </nav>

          {/* Back to CVJOB */}
          <button onClick={onExit}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors shrink-0">
            <ChevronLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:block">Volver a CVJOB</span>
          </button>
        </div>
      </header>

      {/* ── Main content ────────────────────────────────────────────────────────── */}
      <main className="relative z-10 flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8">

        {activeTab === 'student_dash' && (
          <StudentDashboard
            userId={user.id}
            profile={profile}
            onNewAdaptation={onNewAdaptation}
            onViewAdaptations={onExit}
            onViewInterviews={onExit}
            onViewApplications={() => setTab('kanban')}
          />
        )}

        {activeTab === 'kanban' && (
          /* Dark full-bleed background so pastel columns stand out */
          <div className="-mx-4 sm:-mx-6 -mt-8 px-4 sm:px-6 pt-8 pb-8 bg-slate-800 rounded-none min-h-[calc(100vh-56px)]">
            <KanbanBoard userId={user.id} />
          </div>
        )}

        {activeTab === 'community' && (
          <CommunityHub
            userId={user.id}
            profile={profile}
            universityId={universityId}
            campusRole={campusRole}
          />
        )}

        {activeTab === 'university' && canSeeUniversity && (
          <UniversityDashboard
            campusRole={campusRole === 'admin' ? 'admin' : 'coordinator'}
            scopedUniversityId={isCoordinator ? universityId : null}
            onUniversityLogoChange={(name, logo_url) => setUniData({ name, logo_url })}
          />
        )}

      </main>
    </div>
  );
};
