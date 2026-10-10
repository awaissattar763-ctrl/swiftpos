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

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loaded, currentUser, logout } = useStore();

  const onLoginPage = isActive(pathname, '/login/');

  useEffect(() => {
    if (loaded && !currentUser && !onLoginPage) {
      router.replace('/login/');
    }
  }, [loaded, currentUser, onLoginPage, router]);

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400 text-sm">Loading SwiftPOS…</div>
      </div>
    );
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
          <span className="text-[11px] font-bold uppercase tracking-widest bg-amber-400 text-amber-950 px-2.5 py-1 rounded-full">
            Concept Demo
          </span>
          <span className="hidden md:inline text-xs text-brand-100/70">SwiftMart General Store (fictional)</span>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-brand-100">
              {currentUser.name}{' '}
              <span className="text-brand-100/60">· {ROLE_LABEL[role]}</span>
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
          <span className="font-semibold text-amber-600">Concept demo.</span> SwiftMart General
          Store is fictional — all products, sales and figures are demo seed data stored only in
          your browser. Checkout is simulated; no real payments are processed.
        </p>
      </footer>
    </div>
  );
}
