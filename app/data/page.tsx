'use client';

import { useRef, useState } from 'react';
import { useStore, roleAllowed } from '@/lib/store';
import Denied from '@/components/Denied';

export default function DataPage() {
  const { data, currentUser, exportData, importData } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!roleAllowed(currentUser?.role, 'data')) return <Denied />;
  if (!data) return null;

  const download = async () => {
    setBusy(true);
    try {
      const json = await exportData();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `swiftpos-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage({ ok: true, text: 'Backup downloaded as JSON.' });
    } catch (e: any) {
      setMessage({ ok: false, text: e.message || 'Export failed.' });
    }
    setBusy(false);
  };

  const onFile = (f: File | undefined) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = async () => {
      setBusy(true);
      const res = await importData(String(reader.result || ''));
      setBusy(false);
      setMessage(
        res.ok
          ? { ok: true, text: 'Backup restored into the database.' }
          : { ok: false, text: res.error || 'Restore failed.' },
      );
    };
    reader.readAsText(f);
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Backup & Restore</h1>
        <p className="text-sm text-slate-500">
          Export the Supabase tables to JSON, or restore a previous export back into the database.
        </p>
      </div>

      <div className="card p-5 space-y-4">
        <div>
          <h2 className="font-bold text-slate-900">Export backup</h2>
          <p className="text-sm text-slate-500 mb-3">
            Downloads products, sales, returns and expenses as a single JSON file.
          </p>
          <button className="btn-primary" onClick={download} disabled={busy}>
            ⬇ {busy ? 'Working…' : 'Download JSON backup'}
          </button>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <h2 className="font-bold text-slate-900">Restore from backup</h2>
          <p className="text-sm text-slate-500 mb-3">
            Merges a SwiftPOS backup file into the database (matched by SKU / sale number / return
            number — existing rows are updated, not duplicated).
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <button className="btn-secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
            ⬆ Choose backup file…
          </button>
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
