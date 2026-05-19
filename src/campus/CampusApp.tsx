/**
 * CVJOB Campus — Admin-only module
 *
 * Security layers:
 *  1. Frontend: only renders if isAdmin === true (from DB profile)
 *  2. Frontend: any navigation to 'campus' view is intercepted if !isAdmin
 *  3. Backend: api/campus-verify.ts checks is_admin before any DB operation
 *  4. Supabase RLS: tables only accessible with proper role
 *
 * This component is NOT exported from App.tsx unless isAdmin is true.
 */

import React, { useEffect, useState } from 'react';
import { GraduationCap, LayoutDashboard, Kanban, Building2, X, LogOut, ChevronLeft } from 'lucide-react';
import { StudentDashboard } from './StudentDashboard';
import { KanbanBoard }       from './KanbanBoard';
import { UniversityDashboard } from './UniversityDashboard';

function cn(...c: (string | undefined | false)[]) { return c.filter(Boolean).join(' '); }

type CampusTab = 'student_dash' | 'kanban' | 'university';

interface Props {
  profile: any;
  user: any;
  isAdmin: boolean;
  onExit: () => void;
}

export const CampusApp: React.FC<Props> = ({ profile, user, isAdmin, onExit }) => {
  const [tab, setTab] = useState<CampusTab>('student_dash');
  const [verified, setVerified] = useState(false);
  const [verifying, setVerifying] = useState(true);

  // ── Backend security check on mount ─────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin || !user) { onExit(); return; }
    verifyAccess();
  }, [isAdmin, user]);

  const verifyAccess = async () => {
    try {
      const res = await fetch('/api/campus-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      });
      const data = await res.json();
      if (!data.ok) { onExit(); return; }
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

  if (!verified) return null; // onExit already called

  const tabs = [
    { id: 'student_dash' as CampusTab, label: 'Dashboard',    icon: LayoutDashboard },
    { id: 'kanban'       as CampusTab, label: 'Postulaciones', icon: Kanban },
    { id: 'university'   as CampusTab, label: 'Universidad',   icon: Building2 },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      {/* Top nav bar */}
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

          {/* Tabs */}
          <nav className="flex items-center gap-1 flex-1">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all',
                  tab === t.id
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700'
                )}>
                <t.icon className="w-4 h-4" />
                <span className="hidden sm:block">{t.label}</span>
              </button>
            ))}
          </nav>

          {/* Exit */}
          <button onClick={onExit}
            className="flex items-center gap-1.5 text-xs font-bold text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 px-3 py-1.5 rounded-lg transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" /> Volver a CVJOB
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
        {tab === 'student_dash' && (
          <StudentDashboard userId={user.id} profile={profile} />
        )}
        {tab === 'kanban' && (
          <KanbanBoard userId={user.id} />
        )}
        {tab === 'university' && (
          <UniversityDashboard />
        )}
      </main>
    </div>
  );
};
