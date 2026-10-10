'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useStore, roleAllowed } from '@/lib/store';
import { ROLE_LABEL, Role } from '@/lib/types';

const NAV: { href: string; label: string; icon: string; page: string }[] = [
  { href: '/dashboard/', label: 'Dashboard', icon: '📊', page: 'dashboard' },
  { href: '/pos/', label: 'POS Billing', icon: '🛒', page: 'pos' },
  { href: '/returns/', label: 'Returns', icon: '↩️', page: 'returns' },
  { href: '/inventory/', label: 'Inventory', icon: '📦', page: 'inventory' },
  { href: '/reports/', label: 'Reports', icon: '📈', page: 'reports' },
  { href: '/users/', label: 'Users', icon: '👥', page: 'users' },
  { href: '/data/', label: 'Backup', icon: '💾', page: 'data' },
];

function isActive(pathname: string, href: string): boolean {
  const clean = href.replace(/\/$/, '');
  return pathname === href || pathname === clean || pathname.endsWith(clean + '/');
}

function SetupNotice() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-brand-900 via-brand-700 to-indigo-900">
      <div className="card w-full max-w-xl p-8">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-brand-600">
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
              <path d="M13 2 4.5 13.5H11L9.5 22 19 9.5h-6.5L13 2z" />
            </svg>
          </span>
          <span className="text-lg font-bold">SwiftPOS</span>
        </div>
        <h1 className="text-xl font-bold text-slate-900 mt-2">Backend not connected yet</h1>
        <p className="text-sm text-slate-500 mt-2">
          SwiftPOS runs on Supabase (PostgreSQL + Auth). This deployment was built without
          credentials, so it is showing this notice instead of the app.
        </p>
        <ol className="text-sm text-slate-600 mt-4 space-y-2 list-decimal list-inside">
          <li>Create a free project at supabase.com.</li>
          <li>
            Run <code className="bg-slate-100 px-1 rounded">supabase/schema.sql</code> in the SQL
            editor.
          </li>
          <li>
            Seed demo data:{' '}
            <code className="bg-slate-100 px-1 rounded text-xs">
              SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/seed.mjs
            </code>
          </li>
          <li>
            Rebuild with{' '}
            <code className="bg-slate-100 px-1 rounded text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
            <code className="bg-slate-100 px-1 rounded text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{' '}
            set, then redeploy.
          </li>
        </ol>
        <p className="text-xs text-slate-400 mt-4">
          Full steps are in the README. No keys are hardcoded anywhere in this project.
        </p>
      </div>
    </div>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loaded, configured, online, pendingSync, currentUser, logout } = useStore();

  const onLoginPage = isActive(pathname, '/login/');

  useEffect(() => {
    if (loaded && configured && !currentUser && !onLoginPage) {
      router.replace('/login/');
    }
  }, [loaded, configured, currentUser, onLoginPage, router]);

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400 text-sm">Loading SwiftPOS…</div>
      </div>
    );
  }

  if (!configured) {
    return <SetupNotice />;
  }

  if (onLoginPage) {
    return <>{children}</>;
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400 text-sm">Redirecting to login…</div>
      </div>
    );
  }

  const role = currentUser.role as Role;
  const items = NAV.filter((n) => roleAllowed(role, n.page));

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-brand-900 text-white sticky top-0 z-40">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-brand-500">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
                <path d="M13 2 4.5 13.5H11L9.5 22 19 9.5h-6.5L13 2z" />
              </svg>
            </span>
            <span className="text-lg font-bold tracking-tight">SwiftPOS</span>
          </div>
          <span className="text-[11px] font-bold uppercase tracking-widest bg-emerald-400 text-emerald-950 px-2.5 py-1 rounded-full">
            Portfolio build
          </span>
          <span className="hidden md:inline text-xs text-brand-100/70">
            SwiftMart General Store (fictional demo data)
          </span>
          {!online && (
            <span className="text-[11px] font-bold uppercase tracking-widest bg-red-500 text-white px-2.5 py-1 rounded-full">
              Offline
            </span>
          )}
          {pendingSync > 0 && (
            <span
              className="text-[11px] font-bold uppercase tracking-widest bg-amber-400 text-amber-950 px-2.5 py-1 rounded-full"
              title="Sales queued on this device waiting to sync to Supabase"
            >
              {pendingSync} pending sync
            </span>
          )}
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-brand-100">
              {currentUser.name} <span className="text-brand-100/60">· {ROLE_LABEL[role]}</span>
            </span>
            <button
              onClick={() => {
                logout();
                router.replace('/login/');
              }}
              className="text-xs font-medium bg-white/10 hover:bg-white/20 rounded-lg px-3 py-1.5"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="w-52 shrink-0 bg-white border-r border-slate-200 hidden sm:block">
          <nav className="p-3 space-y-1 sticky top-[60px]">
            {items.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive(pathname, n.href)
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span className="text-lg">{n.icon}</span>
                {n.label}
              </Link>
            ))}
          </nav>
        </aside>

        {/* Mobile nav */}
        <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 flex overflow-x-auto">
          {items.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`flex flex-col items-center gap-0.5 px-4 py-2 text-[11px] font-medium min-w-[72px] ${
                isActive(pathname, n.href) ? 'text-brand-700' : 'text-slate-500'
              }`}
            >
              <span className="text-xl">{n.icon}</span>
              {n.label}
            </Link>
          ))}
        </div>

        {/* Main */}
        <main className="flex-1 min-w-0 p-4 md:p-6 pb-24 sm:pb-6">{children}</main>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 px-4 py-3">
        <p className="text-[11px] text-slate-400 text-center max-w-3xl mx-auto">
          <span className="font-semibold text-slate-500">
            SwiftPOS is the developer&apos;s own original portfolio build.
          </span>{' '}
          SwiftMart General Store is fictional and all figures shown are demo seed data. Cash / Card
          / Digital tenders are recorded on each sale — no live payment processing.
        </p>
      </footer>
    </div>
  );
}
