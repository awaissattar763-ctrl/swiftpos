'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';

export default function Home() {
  const router = useRouter();
  const { loaded, currentUser } = useStore();

  useEffect(() => {
    if (!loaded) return;
    if (!currentUser) {
      router.replace('/login/');
    } else if (currentUser.role === 'cashier') {
      router.replace('/pos/');
    } else {
      router.replace('/dashboard/');
    }
  }, [loaded, currentUser, router]);

  return (
    <div className="flex items-center justify-center py-24">
      <div className="text-slate-400 text-sm">Loading SwiftPOS…</div>
    </div>
  );
}
