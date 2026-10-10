'use client';

import { useMemo, useState } from 'react';
import { useStore, roleAllowed } from '@/lib/store';
import { money, fmtDate, startOfDay } from '@/lib/format';
import { TENDER_LABEL, Tender } from '@/lib/types';
import { BarChart, StatCard } from '@/components/charts';
import Denied from '@/components/Denied';

type Preset = 'today' | '7d' | '30d' | '90d' | 'all' | 'custom';
type Tab = 'sales' | 'profit' | 'expenses' | 'inventory';

const round2 = (n: number) => Math.round(n * 100) / 100;

export default function ReportsPage() {
  const { data, currentUser } = useStore();
  const [preset, setPreset] = useState<Preset>('30d');
  const [tab, setTab] = useState<Tab>('sales');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  if (!roleAllowed(currentUser?.role, 'reports')) return <Denied />;
  if (!data) return null;

  const range = useMemo(() => {
    const now = new Date();
    switch (preset) {
      case 'today':
        return { start: startOfDay(now), end: now, label: 'Today' };
      case '7d': {
        const s = new Date(now); s.setDate(s.getDate() - 6);
        return { start: startOfDay(s), end: now, label: 'Last 7 days' };
      }
      case '30d': {
        const s = new Date(now); s.setDate(s.getDate() - 29);
        return { start: startOfDay(s), end: now, label: 'Last 30 days' };
      }
      case '90d': {
        const s = new Date(now); s.setDate(s.getDate() - 89);
        return { start: startOfDay(s), end: now, label: 'Last 90 days' };
      }
      case 'custom': {
        const s = from ? startOfDay(new Date(from + 'T00:00:00')) : new Date(0);
        const e = to ? new Date(to + 'T23:59:59') : now;
        return { start: s, end: e, label: 'Custom range' };
      }
      default:
        return { start: new Date(0), end: now, label: 'All time' };
    }
  }, [preset, from, to]);

  const inRange = (iso: string) => {
    const t = new Date(iso);
    return t >= range.start && t <= range.end;
  };

  const sales = data.sales.filter((s) => inRange(s.date));
  const returns = data.returns.filter((r) => inRange(r.date));
  const expenses = data.expenses.filter((e) => inRange(e.date));

  const grossRevenue = round2(sales.reduce((a, s) => a + s.total, 0));
  const refunds = round2(returns.reduce((a, r) => a + r.refundTotal, 0));
  const netRevenue = round2(grossRevenue - refunds);
  const txCount = sales.length;
  const avgTicket = txCount ? round2(grossRevenue / txCount) : 0;

  // COGS net of returned items
  let cogs = 0;
  for (const s of sales) {
    for (const i of s.items) cogs += i.cost * (i.qty - i.returnedQty);
  }
  cogs = round2(cogs);
  const grossProfit = round2(netRevenue - cogs);
  const totalExpenses = round2(expenses.reduce((a, e) => a + e.amount, 0));
  const netProfit = round2(grossProfit - totalExpenses);

  const tenderTotals = useMemo(() => {
    const m: Record<Tender, number> = { cash: 0, card: 0, digital: 0 };
    for (const s of sales) m[s.tender] = round2(m[s.tender] + s.total);
    return (Object.keys(m) as Tender[]).map((t) => ({ label: TENDER_LABEL[t], value: m[t] }));
  }, [sales]);

  const categoryTotals = useMemo(() => {
    const m: Record<string, number> = {};
    const prodCat = new Map(data.products.map((p) => [p.id, p.category]));
    for (const s of sales)
      for (const i of s.items) {
        const c = prodCat.get(i.productId) || 'Other';
        m[c] = round2((m[c] || 0) + i.price * (i.qty - i.returnedQty));
      }
    return Object.entries(m)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [sales, data.products]);

  const topProducts = useMemo(() => {
    const m: Record<string, { name: string; qty: number; revenue: number }> = {};
    for (const s of sales)
      for (const i of s.items) {
        const net = i.qty - i.returnedQty;
        if (!m[i.productId]) m[i.productId] = { name: i.name, qty: 0, revenue: 0 };
        m[i.productId].qty += net;
        m[i.productId].revenue = round2(m[i.productId].revenue + i.price * net);
      }
    return Object.values(m).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  }, [sales]);

  const expenseByCat = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of expenses) m[e.category] = round2((m[e.category] || 0) + e.amount);
    return Object.entries(m)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [expenses]);

  const inventoryValue = round2(data.products.reduce((a, p) => a + p.stock * p.cost, 0));
  const lowStock = data.products.filter((p) => p.stock <= p.threshold);
  const outOfStock = data.products.filter((p) => p.stock === 0);

  const presets: { id: Preset; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: '7d', label: '7D' },
    { id: '30d', label: '30D' },
    { id: '90d', label: '90D' },
    { id: 'all', label: 'All' },
    { id: 'custom', label: 'Custom' },
  ];
  const tabs: { id: Tab; label: string }[] = [
    { id: 'sales', label: 'Sales' },
    { id: 'profit', label: 'Profit' },
    { id: 'expenses', label: 'Expenses' },
    { id: 'inventory', label: 'Inventory' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
        <p className="text-sm text-slate-500">Computed from demo sales data · {range.label}</p>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        {presets.map((p) => (
          <button
            key={p.id}
            onClick={() => setPreset(p.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium border transition ${
              preset === p.id ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            {p.label}
          </button>
        ))}
        {preset === 'custom' && (
          <>
            <input type="date" className="input !w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-slate-400 text-sm">to</span>
            <input type="date" className="input !w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
          </>
        )}
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              tab === t.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'sales' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Gross revenue" value={money(grossRevenue)} sub={`${txCount} transactions`} icon="💵" />
            <StatCard label="Refunds" value={money(refunds)} sub={`${returns.length} returns`} icon="↩️" />
            <StatCard label="Net revenue" value={money(netRevenue)} sub="after refunds" icon="✅" />
            <StatCard label="Avg ticket" value={money(avgTicket)} sub="per transaction" icon="🧾" />
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="card p-5">
              <h3 className="font-bold text-slate-900 mb-4">Revenue by tender type</h3>
              <BarChart data={tenderTotals} />
            </div>
            <div className="card p-5">
              <h3 className="font-bold text-slate-900 mb-4">Revenue by category</h3>
              <BarChart data={categoryTotals} />
            </div>
          </div>
          <div className="card p-5">
            <h3 className="font-bold text-slate-900 mb-4">Top products</h3>
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Product</th><th className="text-right">Units sold</th><th className="text-right">Revenue</th></tr></thead>
                <tbody>
                  {topProducts.map((p) => (
                    <tr key={p.name}>
                      <td className="font-medium">{p.name}</td>
                      <td className="text-right">{p.qty}</td>
                      <td className="text-right font-semibold">{money(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'profit' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Net revenue" value={money(netRevenue)} icon="💵" />
            <StatCard label="Cost of goods" value={money(cogs)} sub="net of returns" icon="📦" />
            <StatCard label="Gross profit" value={money(grossProfit)} sub={`${netRevenue ? Math.round((grossProfit / netRevenue) * 100) : 0}% margin`} icon="📈" />
            <StatCard label="Net profit" value={money(netProfit)} sub={`after ${money(totalExpenses)} expenses`} icon={netProfit >= 0 ? '✅' : '⚠️'} />
          </div>
          <div className="card p-5">
            <h3 className="font-bold text-slate-900 mb-3">Profit breakdown</h3>
            <div className="space-y-2 text-sm max-w-md">
              <div className="flex justify-between"><span className="text-slate-500">Gross revenue</span><span className="font-medium">{money(grossRevenue)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">− Refunds</span><span className="font-medium">{money(refunds)}</span></div>
              <div className="flex justify-between font-semibold border-t border-slate-100 pt-2"><span>Net revenue</span><span>{money(netRevenue)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">− Cost of goods sold</span><span className="font-medium">{money(cogs)}</span></div>
              <div className="flex justify-between font-semibold border-t border-slate-100 pt-2"><span>Gross profit</span><span>{money(grossProfit)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">− Operating expenses</span><span className="font-medium">{money(totalExpenses)}</span></div>
              <div className={`flex justify-between font-bold text-base border-t border-slate-200 pt-2 ${netProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                <span>Net profit</span><span>{money(netProfit)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'expenses' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total expenses" value={money(totalExpenses)} sub={`${expenses.length} entries`} icon="💸" />
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="card p-5">
              <h3 className="font-bold text-slate-900 mb-4">By category</h3>
              <BarChart data={expenseByCat} />
            </div>
            <div className="card p-5">
              <h3 className="font-bold text-slate-900 mb-4">Entries</h3>
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th>Date</th><th>Category</th><th>Description</th><th className="text-right">Amount</th></tr></thead>
                  <tbody>
                    {[...expenses].sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 12).map((e) => (
                      <tr key={e.id}>
                        <td className="text-slate-500">{fmtDate(e.date)}</td>
                        <td><span className="text-xs font-medium bg-slate-100 rounded-full px-2 py-0.5">{e.category}</span></td>
                        <td>{e.description}</td>
                        <td className="text-right font-medium">{money(e.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'inventory' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Stock value (cost)" value={money(inventoryValue)} icon="📦" />
            <StatCard label="Low stock" value={String(lowStock.length)} icon="⚠️" />
            <StatCard label="Out of stock" value={String(outOfStock.length)} icon="🚫" />
            <StatCard label="Products" value={String(data.products.length)} icon="🏷️" />
          </div>
          <div className="card p-5">
            <h3 className="font-bold text-slate-900 mb-4">Stock valuation</h3>
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>SKU</th><th>Product</th><th className="text-right">Stock</th><th className="text-right">Unit cost</th><th className="text-right">Value</th><th>Status</th></tr></thead>
                <tbody>
                  {[...data.products].sort((a, b) => a.stock * a.cost - b.stock * b.cost).map((p) => (
                    <tr key={p.id}>
                      <td className="font-mono text-xs text-slate-500">{p.sku}</td>
                      <td className="font-medium">{p.name}</td>
                      <td className="text-right">{p.stock}</td>
                      <td className="text-right text-slate-500">{money(p.cost)}</td>
                      <td className="text-right font-medium">{money(p.stock * p.cost)}</td>
                      <td>
                        {p.stock === 0 ? (
                          <span className="text-xs font-bold text-red-600">OUT</span>
                        ) : p.stock <= p.threshold ? (
                          <span className="text-xs font-bold text-amber-600">LOW</span>
                        ) : (
                          <span className="text-xs text-slate-400">OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
