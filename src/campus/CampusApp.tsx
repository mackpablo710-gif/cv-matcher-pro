/**
 * CVJOB Campus — Shell
 *
 * Security:
 *  1. isAdmin must be true to render (enforced in App.tsx)
 *  2. Backend /api/campus-verify double-checks is_admin via SERVICE_ROLE
 *  3. Tab "Universidad" only visible to coordinator / admin campus roles
 *  4. Regular students never see university admin panel
 *
 * State added:
 *  - universityId: loaded from university_users, passed to CommunityHub
 */

import React, { useEffect, useState } from 'react';
import {
  GraduationCap, LayoutDashboard, ClipboardList,
  Building2, ChevronLeft, Users,
} from 'lucide-react';
import { supabase }            from '../lib/supabase';
import { StudentDashboard }    from './StudentDashboard';
import { KanbanBoard }         from './KanbanBoard';
import { UniversityDashboard } from './UniversityDashboard';
import { CommunityHub }        from './community/CommunityHub';

function cn(...c: (string | undefined | false)[]) { return c.filter(Boolean).join(' '); }

type CampusTab  = 'student_dash' | 'kanban' | 'community' | 'university';
type CampusRole = 'student' | 'coordinator' | 'admin';

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
  const [verified,     setVerified]     = useState(false);
  const [verifying,    setVerifying]    = useState(true);

  useEffect(() => {
    if (!isAdmin || !user) { onExit(); return; }
    verifyAccess();
  }, [isAdmin, user]);

  const verifyAccess = async () => {
    try {
      const res = await fetch('/api/campus-verify', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ user_id: user.id }),
      });
      const data = await res.json();
      if (!data.ok) { onExit(); return; }

      if (isAdmin) {
        setCampusRole('admin');
        // Super-admin has no specific university; universityId stays null
      } else {
        const { data: uUser } = await supabase
          .from('university_users')
          .select('role, university_id')
          .eq('user_id', user.id)
          .eq('active', true)
          .maybeSingle();
        setCampusRole((uUser?.role as CampusRole) || 'student');
        setUniversityId(uUser?.university_id ?? null);
      }

      setVerified(true);
    } catch {
      onExit();
    } finally {
      setVerifying(false);
    }
  };

  if (verifying) return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
      <div className="text-center text-zinc-400">
        <GraduationCap className="w-10 h-10 mx-auto mb-3 animate-pulse" />
        <p className="text-sm font-medium">Verificando acceso...</p>
      </div>
    </div>
  );

  if (!verified) return null;

  // ── Tab visibility ────────────────────────────────────────────────────────────
  const canSeeUniversity = campusRole === 'coordinator' || campusRole === 'admin';

  const tabs = [
    { id: 'student_dash' as CampusTab, label: 'Mi Dashboard',        icon: LayoutDashboard },
    { id: 'kanban'       as CampusTab, label: 'Mis Postulaciones',    icon: ClipboardList },
    { id: 'community'   as CampusTab, label: 'Comunidad',            icon: Users },
    ...(canSeeUniversity
      ? [{ id: 'university' as CampusTab, label: 'Panel Universidad', icon: Building2 }]
      : []
    ),
  ];

  const activeTab = tabs.find(t => t.id === tab) ? tab : 'student_dash';

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-zinc-100 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">

          {/* Brand */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-7 h-7 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-lg flex items-center justify-center">
              <GraduationCap className="w-4 h-4 text-white" />
            </div>
            <span className="font-black text-zinc-900 text-sm">
              CVJOB <span className="text-indigo-600">Campus</span>
            </span>
            <span className="text-xs font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-md">BETA</span>
          </div>

          {/* Tabs — overflow-x-auto for mobile */}
          <nav className="flex items-center gap-1 flex-1 overflow-x-auto scrollbar-hide">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap shrink-0',
                  activeTab === t.id
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700'
                )}>
                <t.icon className="w-4 h-4" />
                <span className="hidden sm:block">{t.label}</span>
              </button>
            ))}
          </nav>

          {/* Back to CVJOB */}
          <button onClick={onExit}
            className="flex items-center gap-1.5 text-xs font-bold text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 px-3 py-1.5 rounded-lg transition-colors shrink-0">
            <ChevronLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:block">Volver a CVJOB</span>
          </button>
        </div>
      </header>

      {/* ── Main content ────────────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">

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
          <KanbanBoard userId={user.id} />
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
          <UniversityDashboard />
        )}

      </main>
    </div>
  );
};
