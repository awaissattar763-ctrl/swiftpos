'use client';

import { useEffect, useMemo, useState } from 'react';
import { useStore, roleAllowed } from '@/lib/store';
import { getSupabase } from '@/lib/supabase';
import { money, fmtDateTime, fmtDate } from '@/lib/format';
import Denied from '@/components/Denied';

interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  credit_limit: number;
  notes: string;
  is_active: boolean;
}

interface LedgerEntry {
  id: string;
  customer_id: string;
  occurred_at: string;
  type: 'sale' | 'payment' | 'adjustment';
  amount: number;
  balance_after: number;
  reference: string;
  notes: string;
}

const EMPTY: Customer = {
  id: '',
  name: '',
  phone: '',
  email: '',
  address: '',
  credit_limit: 0,
  notes: '',
  is_active: true,
};

const TYPE_STYLE: Record<LedgerEntry['type'], string> = {
  sale: 'bg-amber-100 text-amber-800',
  payment: 'bg-green-100 text-green-800',
  adjustment: 'bg-slate-100 text-slate-700',
};

export default function CustomersPage() {
  const { currentUser } = useStore();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Customer | null>(null);
  const [formError, setFormError] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // detail drawer
  const [selected, setSelected] = useState<Customer | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [payAmount, setPayAmount] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjNotes, setAdjNotes] = useState('');

  const load = async () => {
    const sb = getSupabase();
    setLoading(true);
    const { data: custs } = await sb.from('customers').select('*').order('name');
    const list = (custs || []) as Customer[];
    setCustomers(list);
    // latest balance per customer
    const bal: Record<string, number> = {};
    for (const c of list) {
      const { data } = await sb
        .from('customer_ledger')
        .select('balance_after')
        .eq('customer_id', c.id)
        .order('occurred_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      bal[c.id] = Number(data?.balance_after ?? 0);
    }
    setBalances(bal);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  if (!roleAllowed(currentUser?.role, 'customers')) return <Denied />;

  const openCustomer = async (c: Customer) => {
    setSelected(c);
    setPayAmount('');
    setPayNotes('');
    setAdjAmount('');
    setAdjNotes('');
    const sb = getSupabase();
    const { data } = await sb
      .from('customer_ledger')
      .select('*')
      .eq('customer_id', c.id)
      .order('occurred_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100);
    setLedger((data || []) as LedgerEntry[]);
  };

  const currentBalance = selected ? (balances[selected.id] ?? 0) : 0;

  const addEntry = async (type: 'payment' | 'adjustment', rawAmount: string, notes: string, refPrefix: string) => {
    if (!selected) return;
    const amt = parseFloat(rawAmount);
    if (!amt || amt <= 0) return setMsg({ ok: false, text: 'Enter a valid amount.' });
    const sb = getSupabase();
    const signed = type === 'payment' ? -amt : amt; // adjustment may be +/-, keep simple: positive adds to balance
    const newBal = currentBalance + signed;
    const { error } = await sb.from('customer_ledger').insert({
      customer_id: selected.id,
      type,
      amount: signed,
      balance_after: newBal,
      reference: `${refPrefix}-${Date.now().toString(36).toUpperCase()}`,
      notes: notes.trim(),
      created_by: currentUser?.id ?? null,
    });
    if (error) return setMsg({ ok: false, text: error.message });
    setMsg({ ok: true, text: type === 'payment' ? `Payment of ${money(amt)} recorded.` : `Adjustment of ${money(amt)} recorded.` });
    setBalances({ ...balances, [selected.id]: newBal });
    openCustomer({ ...selected });
  };

  const saveCustomer = async () => {
    if (!editing) return;
    if (!editing.name.trim()) return setFormError('Customer name is required.');
    setFormError('');
    const sb = getSupabase();
    const payload = {
      name: editing.name.trim(),
      phone: editing.phone.trim(),
      email: editing.email.trim(),
      address: editing.address.trim(),
      credit_limit: Math.max(0, Number(editing.credit_limit) || 0),
      notes: editing.notes.trim(),
      is_active: editing.is_active,
    };
    const { error } = editing.id
      ? await sb.from('customers').update(payload).eq('id', editing.id)
      : await sb.from('customers').insert(payload);
    if (error) return setFormError(error.message);
    setEditing(null);
    load();
  };

  const filtered = customers.filter((c) => {
    const q = search.trim().toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.phone.includes(q);
  });

  const totalOutstanding = useMemo(
    () => Object.values(balances).reduce((a, b) => a + Math.max(0, b), 0),
    [balances],
  );

  const balanceBadge = (bal: number, limit: number) => {
    if (bal <= 0) return <span className="text-slate-400">—</span>;
    if (limit > 0 && bal >= limit)
      return <span className="text-xs font-bold text-red-700 bg-red-100 px-2 py-1 rounded-full">OVER LIMIT · {money(bal)}</span>;
    if (limit > 0 && bal >= limit * 0.8)
      return <span className="text-xs font-bold text-amber-800 bg-amber-100 px-2 py-1 rounded-full">Near limit · {money(bal)}</span>;
    return <span className="font-semibold text-amber-800">{money(bal)}</span>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Customers & Khata</h1>
          <p className="text-sm text-slate-500">
            Credit ledger (کھاتہ) — outstanding <b className="text-amber-800">{money(totalOutstanding)}</b> across {customers.length} customers
          </p>
        </div>
        <button className="btn-primary" onClick={() => { setFormError(''); setEditing({ ...EMPTY }); }}>+ Add customer</button>
      </div>

      {msg && (
        <div className={`rounded-lg px-4 py-2 text-sm ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>
      )}

      <div className="flex gap-2">
        <input className="input max-w-xs" placeholder="Search name or phone…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm">Loading…</div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Customer</th><th>Phone</th><th>Credit limit</th><th>Balance owed</th><th></th></tr></thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => openCustomer(c)}>
                  <td className="font-medium">{c.name}{!c.is_active && <span className="ml-2 text-xs text-slate-400">(inactive)</span>}</td>
                  <td className="font-mono text-xs">{c.phone || '—'}</td>
                  <td>{Number(c.credit_limit) > 0 ? money(Number(c.credit_limit)) : <span className="text-slate-400 text-xs">No limit</span>}</td>
                  <td>{balanceBadge(balances[c.id] ?? 0, Number(c.credit_limit))}</td>
                  <td className="text-right" onClick={(e) => e.stopPropagation()}>
                    <button className="btn-secondary !px-3 !py-1 text-xs" onClick={() => { setFormError(''); setEditing({ ...c }); }}>Edit</button>
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={5} className="text-center text-slate-400 py-8">No customers yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setSelected(null)}>
          <div className="card p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-bold text-lg text-slate-900">{selected.name}</h2>
                <p className="text-sm text-slate-500">{selected.phone}{selected.address ? ` · ${selected.address}` : ''}</p>
              </div>
              <button className="text-slate-400 hover:text-slate-600" onClick={() => setSelected(null)}>✕</button>
            </div>
            <div className="flex gap-3 flex-wrap">
              <div className="card p-3 flex-1 min-w-[140px]">
                <div className="label">Balance owed</div>
                <div className={`text-2xl font-bold ${currentBalance > 0 ? 'text-amber-700' : 'text-slate-400'}`}>{money(currentBalance)}</div>
              </div>
              <div className="card p-3 flex-1 min-w-[140px]">
                <div className="label">Credit limit</div>
                <div className="text-2xl font-bold text-slate-700">{Number(selected.credit_limit) > 0 ? money(Number(selected.credit_limit)) : '∞'}</div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <div className="card p-4 space-y-2 border-green-200">
                <h3 className="font-semibold text-sm text-green-800">Receive payment</h3>
                <input className="input" placeholder="Amount" inputMode="decimal" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
                <input className="input" placeholder="Note (optional)" value={payNotes} onChange={(e) => setPayNotes(e.target.value)} />
                <button className="btn-primary w-full" onClick={() => addEntry('payment', payAmount, payNotes, 'PAY')}>Record payment</button>
              </div>
              <div className="card p-4 space-y-2">
                <h3 className="font-semibold text-sm text-slate-700">Balance adjustment</h3>
                <input className="input" placeholder="Amount (+ adds to balance)" inputMode="decimal" value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} />
                <input className="input" placeholder="Reason" value={adjNotes} onChange={(e) => setAdjNotes(e.target.value)} />
                <button className="btn-secondary w-full" onClick={() => addEntry('adjustment', adjAmount, adjNotes, 'ADJ')}>Record adjustment</button>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-sm text-slate-700 mb-2">Ledger history</h3>
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th>Date</th><th>Type</th><th>Reference</th><th className="text-right">Amount</th><th className="text-right">Balance</th></tr></thead>
                  <tbody>
                    {ledger.map((l) => (
                      <tr key={l.id}>
                        <td className="text-xs whitespace-nowrap">{fmtDateTime(l.occurred_at)}</td>
                        <td><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_STYLE[l.type]}`}>{l.type}</span>{l.notes && <div className="text-xs text-slate-400">{l.notes}</div>}</td>
                        <td className="font-mono text-xs">{l.reference || '—'}</td>
                        <td className={`text-right font-semibold ${Number(l.amount) >= 0 ? 'text-amber-700' : 'text-green-700'}`}>
                          {Number(l.amount) >= 0 ? '+' : '−'}{money(Math.abs(Number(l.amount)))}
                        </td>
                        <td className="text-right font-semibold">{money(Number(l.balance_after))}</td>
                      </tr>
                    ))}
                    {!ledger.length && <tr><td colSpan={5} className="text-center text-slate-400 py-6">No ledger entries yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setEditing(null)}>
          <div className="card p-6 w-full max-w-lg space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-lg text-slate-900">{editing.id ? 'Edit customer' : 'Add customer'}</h2>
            {formError && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{formError}</div>}
            <div><label className="label">Name *</label><input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Phone (+92…)</label><input className="input" placeholder="+92 300 1234567" value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></div>
              <div><label className="label">Email</label><input className="input" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></div>
            </div>
            <div><label className="label">Address</label><input className="input" value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} /></div>
            <div><label className="label">Credit limit (0 = no limit)</label><input className="input" inputMode="decimal" value={String(editing.credit_limit)} onChange={(e) => setEditing({ ...editing, credit_limit: parseFloat(e.target.value) || 0 })} /></div>
            <div><label className="label">Notes</label><input className="input" value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} className="w-4 h-4" /> Active
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary" onClick={saveCustomer}>Save customer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
