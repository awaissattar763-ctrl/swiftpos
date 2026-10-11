'use client';

import { useEffect, useMemo, useState } from 'react';
import { useStore, roleAllowed } from '@/lib/store';
import { getSupabase } from '@/lib/supabase';
import { money, fmtDate } from '@/lib/format';
import Denied from '@/components/Denied';

interface Employee {
  id: string;
  name: string;
  phone: string;
  role: 'cashier' | 'manager' | 'staff';
  salary_monthly: number;
  hire_date: string;
  is_active: boolean;
}

interface SalaryPayment {
  id: string;
  employee_id: string;
  month: string; // YYYY-MM
  amount: number;
  paid_date: string;
  notes: string;
}

const EMPTY: Employee = {
  id: '',
  name: '',
  phone: '',
  role: 'staff',
  salary_monthly: 0,
  hire_date: new Date().toISOString().slice(0, 10),
  is_active: true,
};

const currentMonth = () => new Date().toISOString().slice(0, 7);

const MONTH_LABEL = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

export default function EmployeesPage() {
  const { currentUser } = useStore();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payments, setPayments] = useState<SalaryPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [formError, setFormError] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [paying, setPaying] = useState<Employee | null>(null);
  const [payMonth, setPayMonth] = useState(currentMonth());
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payNotes, setPayNotes] = useState('');

  const load = async () => {
    const sb = getSupabase();
    setLoading(true);
    const [{ data: emps }, { data: pays }] = await Promise.all([
      sb.from('employees').select('*').order('name'),
      sb.from('salary_payments').select('*').order('month', { ascending: false }).limit(500),
    ]);
    setEmployees((emps || []) as Employee[]);
    setPayments((pays || []) as SalaryPayment[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  if (!roleAllowed(currentUser?.role, 'employees')) return <Denied />;

  const paidMonths = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const p of payments) {
      if (!m.has(p.employee_id)) m.set(p.employee_id, new Set());
      m.get(p.employee_id)!.add(p.month);
    }
    return m;
  }, [payments]);

  const saveEmployee = async () => {
    if (!editing) return;
    if (!editing.name.trim()) return setFormError('Employee name is required.');
    setFormError('');
    const sb = getSupabase();
    const payload = {
      name: editing.name.trim(),
      phone: editing.phone.trim(),
      role: editing.role,
      salary_monthly: Math.max(0, Number(editing.salary_monthly) || 0),
      hire_date: editing.hire_date,
      is_active: editing.is_active,
    };
    const { error } = editing.id
      ? await sb.from('employees').update(payload).eq('id', editing.id)
      : await sb.from('employees').insert(payload);
    if (error) return setFormError(error.message);
    setEditing(null);
    load();
  };

  const openPay = (e: Employee) => {
    setPaying(e);
    setPayMonth(currentMonth());
    setPayAmount(String(e.salary_monthly));
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayNotes('');
    setMsg(null);
  };

  const recordPayment = async () => {
    if (!paying) return;
    const amt = parseFloat(payAmount);
    if (!amt || amt <= 0) return setMsg({ ok: false, text: 'Enter a valid amount.' });
    if (!/^\d{4}-\d{2}$/.test(payMonth)) return setMsg({ ok: false, text: 'Month must be YYYY-MM.' });
    const sb = getSupabase();
    const { error } = await sb.from('salary_payments').insert({
      employee_id: paying.id,
      month: payMonth,
      amount: amt,
      paid_date: payDate,
      notes: payNotes.trim(),
      created_by: currentUser?.id ?? null,
    });
    if (error) {
      if (/duplicate|unique/i.test(error.message))
        return setMsg({ ok: false, text: `${paying.name} already has a recorded payment for ${MONTH_LABEL(payMonth)}.` });
      return setMsg({ ok: false, text: error.message });
    }
    // also log as an expense so payroll shows in reports
    await sb.from('expenses').insert({
      occurred_at: new Date(payDate).toISOString(),
      category: 'Salaries',
      description: `Salary — ${paying.name} (${MONTH_LABEL(payMonth)})`,
      amount: amt,
      created_by: currentUser?.id ?? null,
    });
    setMsg({ ok: true, text: `Salary of ${money(amt)} recorded for ${paying.name} (${MONTH_LABEL(payMonth)}).` });
    setPaying(null);
    load();
  };

  const monthTotal = useMemo(
    () => payments.filter((p) => p.month === currentMonth()).reduce((a, p) => a + Number(p.amount), 0),
    [payments],
  );

  const activeCount = employees.filter((e) => e.is_active).length;
  const monthlyObligation = employees.filter((e) => e.is_active).reduce((a, e) => a + Number(e.salary_monthly), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Employees & Payroll</h1>
          <p className="text-sm text-slate-500">
            {activeCount} active staff · {money(monthlyObligation)}/month obligation · {money(monthTotal)} paid in {MONTH_LABEL(currentMonth())}
          </p>
        </div>
        <button className="btn-primary" onClick={() => { setFormError(''); setEditing({ ...EMPTY }); }}>+ Add employee</button>
      </div>

      {msg && (
        <div className={`rounded-lg px-4 py-2 text-sm ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>
      )}

      {loading ? (
        <div className="text-slate-400 text-sm">Loading…</div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Name</th><th>Role</th><th>Phone</th><th>Hire date</th><th className="text-right">Monthly salary</th><th>{MONTH_LABEL(currentMonth())}</th><th></th></tr></thead>
              <tbody>
                {employees.map((e) => {
                  const paid = paidMonths.get(e.id)?.has(currentMonth());
                  return (
                    <tr key={e.id} className={!e.is_active ? 'opacity-50' : ''}>
                      <td className="font-medium">{e.name}</td>
                      <td className="capitalize text-xs">{e.role}</td>
                      <td className="font-mono text-xs">{e.phone || '—'}</td>
                      <td className="text-xs">{fmtDate(e.hire_date)}</td>
                      <td className="text-right font-semibold">{money(Number(e.salary_monthly))}</td>
                      <td>
                        {paid
                          ? <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-1 rounded-full">Paid ✓</span>
                          : e.is_active
                            ? <span className="text-xs font-semibold text-amber-800 bg-amber-100 px-2 py-1 rounded-full">Pending</span>
                            : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td className="text-right whitespace-nowrap">
                        {e.is_active && <button className="btn-primary !px-2 !py-1 text-xs mr-1" onClick={() => openPay(e)}>Pay salary</button>}
                        <button className="btn-secondary !px-2 !py-1 text-xs" onClick={() => { setFormError(''); setEditing({ ...e }); }}>Edit</button>
                      </td>
                    </tr>
                  );
                })}
                {!employees.length && <tr><td colSpan={7} className="text-center text-slate-400 py-8">No employees yet.</td></tr>}
              </tbody>
            </table>
          </div>

          {payments.length > 0 && (
            <div>
              <h2 className="font-bold text-slate-900 mb-2">Recent salary payments</h2>
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th>Month</th><th>Employee</th><th>Paid date</th><th className="text-right">Amount</th><th>Notes</th></tr></thead>
                  <tbody>
                    {payments.slice(0, 20).map((p) => (
                      <tr key={p.id}>
                        <td className="font-medium text-xs">{MONTH_LABEL(p.month)}</td>
                        <td>{employees.find((e) => e.id === p.employee_id)?.name || '—'}</td>
                        <td className="text-xs">{fmtDate(p.paid_date)}</td>
                        <td className="text-right font-semibold">{money(Number(p.amount))}</td>
                        <td className="text-xs text-slate-400">{p.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {paying && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setPaying(null)}>
          <div className="card p-6 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-lg text-slate-900">Pay salary — {paying.name}</h2>
            <div><label className="label">Month (YYYY-MM)</label><input className="input" value={payMonth} onChange={(e) => setPayMonth(e.target.value)} /></div>
            <div><label className="label">Amount</label><input className="input" inputMode="decimal" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} /></div>
            <div><label className="label">Paid date</label><input type="date" className="input" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></div>
            <div><label className="label">Notes</label><input className="input" placeholder="e.g. Bank transfer, cash" value={payNotes} onChange={(e) => setPayNotes(e.target.value)} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-secondary" onClick={() => setPaying(null)}>Cancel</button>
              <button className="btn-primary" onClick={recordPayment}>Record payment</button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setEditing(null)}>
          <div className="card p-6 w-full max-w-lg space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-lg text-slate-900">{editing.id ? 'Edit employee' : 'Add employee'}</h2>
            {formError && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{formError}</div>}
            <div><label className="label">Name *</label><input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Phone (+92…)</label><input className="input" placeholder="+92 300 1234567" value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></div>
              <div><label className="label">Role</label>
                <select className="input" value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value as Employee['role'] })}>
                  <option value="staff">Staff</option>
                  <option value="cashier">Cashier</option>
                  <option value="manager">Manager</option>
                </select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Monthly salary</label><input className="input" inputMode="decimal" value={String(editing.salary_monthly)} onChange={(e) => setEditing({ ...editing, salary_monthly: parseFloat(e.target.value) || 0 })} /></div>
              <div><label className="label">Hire date</label><input type="date" className="input" value={editing.hire_date} onChange={(e) => setEditing({ ...editing, hire_date: e.target.value })} /></div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} className="w-4 h-4" /> Active
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary" onClick={saveEmployee}>Save employee</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
