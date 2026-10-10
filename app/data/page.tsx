'use client';

import { useRef, useState } from 'react';
import { useStore, roleAllowed } from '@/lib/store';
import Denied from '@/components/Denied';

export default function DataPage() {
  const { data, exportData, importData, resetDemo } = useStore();
  const { currentUser } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  if (!roleAllowed(currentUser?.role, 'data')) return <Denied />;
  if (!data) return null;

  const download = () => {
    const blob = new Blob([exportData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `swiftpos-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage({ ok: true, text: 'Backup downloaded as JSON.' });
  };

  const onFile = (f: File | undefined) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = importData(String(reader.result || ''));
      setMessage(res.ok ? { ok: true, text: 'Backup restored successfully.' } : { ok: false, text: res.error || 'Restore failed.' });
    };
    reader.readAsText(f);
  };

  const doReset = () => {
    resetDemo();
    setConfirmReset(false);
    setMessage({ ok: true, text: 'Demo data has been reset to the original seed.' });
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Backup & Restore</h1>
        <p className="text-sm text-slate-500">The demo dataset lives in your browser — export it, restore it, or reset it.</p>
      </div>

      <div className="card p-5 space-y-4">
        <div>
          <h2 className="font-bold text-slate-900">Export backup</h2>
          <p className="text-sm text-slate-500 mb-3">
            Downloads the full dataset ({data.products.length} products, {data.sales.length} sales,{' '}
            {data.expenses.length} expenses) as a JSON file.
          </p>
          <button className="btn-primary" onClick={download}>⬇ Download JSON backup</button>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <h2 className="font-bold text-slate-900">Restore from backup</h2>
          <p className="text-sm text-slate-500 mb-3">
            Replaces the current dataset with a previously exported backup file.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <button className="btn-secondary" onClick={() => fileRef.current?.click()}>⬆ Choose backup file…</button>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <h2 className="font-bold text-slate-900">Reset demo</h2>
          <p className="text-sm text-slate-500 mb-3">
            Discards all changes and restores the original fictional seed data.
          </p>
          {!confirmReset ? (
            <button className="btn-danger" onClick={() => setConfirmReset(true)}>Reset demo data</button>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-red-700">Are you sure?</span>
              <button className="btn-danger" onClick={doReset}>Yes, reset</button>
              <button className="btn-secondary" onClick={() => setConfirmReset(false)}>Cancel</button>
            </div>
          )}
        </div>

        {message && (
          <p className={`text-sm rounded-lg px-3 py-2 border ${message.ok ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
