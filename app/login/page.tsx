'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { DEMO_ACCOUNTS, DEMO_PASSWORD_HINT } from '@/lib/demo';

export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    const res = await signIn(email.trim(), password);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    router.replace('/pos/');
  };

  const fillDemo = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD_HINT);
    setError('');
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
          <p className="text-brand-100/70 text-sm mt-1">SwiftMart General Store · live demo build</p>
          <span className="inline-block mt-3 text-[11px] font-bold uppercase tracking-widest bg-emerald-400 text-emerald-950 px-3 py-1 rounded-full">
            Portfolio build
          </span>
        </div>

        <div className="card p-6 md:p-8">
          <h2 className="text-lg font-bold text-slate-900">Sign in</h2>
          <p className="text-sm text-slate-500 mt-1 mb-5">
            Real Supabase authentication. Use one of the public demo accounts below.
          </p>

          <form onSubmit={submit} className="grid sm:grid-cols-2 gap-3 mb-6">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="email">Email</label>
              <input
                id="email" type="email" className="input" autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="password">Password</label>
              <input
                id="password" type="password" className="input" autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            {error && (
              <p className="sm:col-span-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            <div className="sm:col-span-2">
              <button type="submit" className="btn-primary w-full py-2.5" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </div>
          </form>

          <div className="border-t border-slate-100 pt-5">
            <h3 className="text-sm font-bold text-slate-800 mb-1">Public demo accounts</h3>
            <p className="text-xs text-slate-500 mb-3">
              Password for all three: <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">{DEMO_PASSWORD_HINT}</code>{' '}
              (the seed script&apos;s default — tap an account to fill the form, then sign in).
            </p>
            <div className="grid md:grid-cols-3 gap-3">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.email}
                  onClick={() => fillDemo(a.email)}
                  className="border border-slate-200 rounded-xl p-3 text-left hover:border-brand-500 hover:shadow transition"
                >
                  <div className="text-sm font-bold text-slate-900 capitalize">{a.role}</div>
                  <div className="text-xs text-slate-500">{a.name}</div>
                  <div className="text-[11px] text-slate-400 font-mono mt-1 break-all">{a.email}</div>
                  <div className="text-[11px] text-slate-400 mt-1">{a.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-slate-400 mt-6 text-center">
            SwiftPOS is the developer&apos;s own portfolio build. SwiftMart General Store is
            fictional; all data shown is demo seed data.
          </p>
        </div>
      </div>
    </div>
  );
}
