'use client';

import { useState } from 'react';
import { useStore, roleAllowed } from '@/lib/store';
import { money, fmtDateTime } from '@/lib/format';
import Denied from '@/components/Denied';

export default function ReturnsPage() {
  const { data, currentUser, processReturn } = useStore();
  const [query, setQuery] = useState('');
  const [saleId, setSaleId] = useState<string | null>(null);
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('Damaged item');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (!roleAllowed(currentUser?.role, 'returns')) return <Denied />;
  if (!data || !currentUser) return null;

  const sale = saleId ? data.sales.find((s) => s.id === saleId) : undefined;

  const pickSale = (id: string) => {
    setSaleId(id);
    setQtys({});
    setMessage(null);
  };

  const searched = query.trim()
    ? data.sales.filter((s) => s.id.toLowerCase().includes(query.trim().toLowerCase()))
    : [...data.sales].sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 10);

  const submit = async () => {
    if (!sale) return;
    const lines = Object.entries(qtys)
      .filter(([, q]) => q > 0)
      .map(([productId, qty]) => ({ productId, qty }));
    setMessage(null);
    const res = await processReturn({ saleId: sale.id, lines, reason, cashier: currentUser.name });
    if ('error' in res) {
      setMessage({ ok: false, text: res.error });
    } else {
      setMessage({
        ok: true,
        text: `Return ${res.record.id} processed — refund ${money(res.record.refundTotal)}. Stock restored automatically.`,
      });
      setQtys({});
    }
  };

  const selectedCount = Object.values(qtys).reduce((a, q) => a + (q > 0 ? q : 0), 0);

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Returns</h1>
        <p className="text-sm text-slate-500">Pick a past sale, return items — stock adjusts automatically.</p>
      </div>

      <div className="card p-4">
        <label className="label" htmlFor="saleq">Find a sale by ID</label>
        <input
          id="saleq"
          className="input font-mono max-w-xs"
          placeholder="e.g. S-000123"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="mt-3 space-y-1 max-h-64 overflow-y-auto">
          {searched.map((s) => (
            <button
              key={s.id}
              onClick={() => pickSale(s.id)}
              className={`w-full text-left flex items-center justify-between rounded-lg px-3 py-2 text-sm border transition ${
                saleId === s.id ? 'border-brand-500 bg-brand-50' : 'border-slate-100 hover:border-slate-300'
              }`}
            >
              <span className="font-mono text-xs">{s.id}</span>
              <span className="text-slate-500 text-xs">{fmtDateTime(s.date)}</span>
              <span className="text-slate-500 text-xs">{s.items.reduce((a, i) => a + i.qty, 0)} items</span>
              <span className="font-semibold">{money(s.total)}</span>
            </button>
          ))}
          {searched.length === 0 && <p className="text-sm text-slate-400">No sales match.</p>}
        </div>
      </div>

      {sale && (
        <div className="card p-4">
          <h2 className="font-bold text-slate-900">
            Sale <span className="font-mono text-sm">{sale.id}</span>
            <span className="text-sm font-normal text-slate-500 ml-2">{fmtDateTime(sale.date)} · {sale.cashier}</span>
          </h2>
          <div className="mt-3 space-y-2">
            {sale.items.map((i) => {
              const returnable = i.qty - i.returnedQty;
              const q = qtys[i.productId] || 0;
              return (
                <div key={i.productId} className="flex items-center gap-3 border border-slate-100 rounded-lg px-3 py-2">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{i.name}</div>
                    <div className="text-xs text-slate-400">
                      Bought {i.qty} · already returned {i.returnedQty} · returnable {returnable}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      className="w-7 h-7 rounded bg-slate-100 hover:bg-slate-200 font-bold disabled:opacity-40"
                      disabled={q <= 0}
                      onClick={() => setQtys((p) => ({ ...p, [i.productId]: q - 1 }))}
                    >−</button>
                    <span className="w-8 text-center text-sm font-semibold">{q}</span>
                    <button
                      className="w-7 h-7 rounded bg-slate-100 hover:bg-slate-200 font-bold disabled:opacity-40"
                      disabled={q >= returnable}
                      onClick={() => setQtys((p) => ({ ...p, [i.productId]: q + 1 }))}
                    >+</button>
                  </div>
                  <div className="text-sm font-semibold w-20 text-right">{money(i.price * q)}</div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="reason">Reason</label>
              <select id="reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
                <option>Damaged item</option>
                <option>Wrong item</option>
                <option>Customer changed mind</option>
                <option>Expired product</option>
                <option>Other</option>
              </select>
            </div>
            <div className="flex items-end">
              <button className="btn-primary w-full" disabled={selectedCount === 0} onClick={submit}>
                Process return{selectedCount > 0 ? ` (${selectedCount} items)` : ''}
              </button>
            </div>
          </div>

          {message && (
            <p className={`text-sm mt-3 rounded-lg px-3 py-2 ${message.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {message.text}
            </p>
          )}
        </div>
      )}

      {data.returns.length > 0 && (
        <div className="card p-4">
          <h2 className="font-bold text-slate-900 mb-3">Return history</h2>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Return</th><th>Date</th><th>Original sale</th><th>Items</th><th>Reason</th><th className="text-right">Refund</th></tr>
              </thead>
              <tbody>
                {[...data.returns].reverse().slice(0, 10).map((r) => (
                  <tr key={r.id}>
                    <td className="font-mono text-xs">{r.id}</td>
                    <td className="text-slate-500">{fmtDateTime(r.date)}</td>
                    <td className="font-mono text-xs">{r.saleId}</td>
                    <td>{r.items.reduce((a, i) => a + i.qty, 0)}</td>
                    <td className="text-slate-500">{r.reason}</td>
                    <td className="text-right font-semibold">{money(r.refundTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
