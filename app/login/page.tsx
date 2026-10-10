'use client';

import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { ROLE_LABEL, Role } from '@/lib/types';

const ROLE_ORDER: Role[] = ['admin', 'manager', 'cashier'];
const ROLE_DESC: Record<Role, string> = {
  admin: 'Full access — dashboard, POS, inventory, reports, users, backup.',
  manager: 'Dashboard, POS, returns, inventory, reports and backup.',
  cashier: 'POS billing and returns only.',
};

export default function LoginPage() {
  const router = useRouter();
  const { data, login } = useStore();

  const pick = (userId: string, role: Role) => {
    login(userId);
    router.replace(role === 'cashier' ? '/pos/' : '/dashboard/');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-brand-900 via-brand-700 to-indigo-900">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/10 mb-4">
            <svg viewBox="0 0 24 24" className="w-8 h-8 text-white" fill="currentColor">
              <path d="M13 2 4.5 13.5H11L9.5 22 19 9.5h-6.5L13 2z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">SwiftPOS</h1>
          <p className="text-brand-100/70 text-sm mt-1">SwiftMart General Store · fictional demo</p>
          <span className="inline-block mt-3 text-[11px] font-bold uppercase tracking-widest bg-amber-400 text-amber-950 px-3 py-1 rounded-full">
            Concept Demo
          </span>
        </div>

        <div className="card p-6 md:p-8">
          <h2 className="text-lg font-bold text-slate-900">Demo login</h2>
          <p className="text-sm text-slate-500 mt-1 mb-6">
            One-click demo sign-in — no real authentication. Pick a role to explore what each user
            type can see.
          </p>

          <div className="grid md:grid-cols-3 gap-4">
            {ROLE_ORDER.map((role) => {
              const users = (data?.users || []).filter((u) => u.role === role && u.active);
              return (
                <div key={role} className="border border-slate-200 rounded-xl p-4 flex flex-col">
                  <div className="text-sm font-bold text-slate-900">{ROLE_LABEL[role]}</div>
                  <div className="text-xs text-slate-500 mt-1 mb-4 flex-1">{ROLE_DESC[role]}</div>
                  <div className="space-y-2">
                    {users.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => pick(u.id, role)}
                        className="btn-secondary w-full text-sm"
                      >
                        Sign in as {u.name}
                      </button>
                    ))}
                    {users.length === 0 && (
                      <div className="text-xs text-slate-400">No active {role} accounts.</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-slate-400 mt-6 text-center">
            All data on this screen is fictional. Nothing you do here affects any real store or
            moves real money.
          </p>
        </div>
      </div>
    </div>
  );
}
