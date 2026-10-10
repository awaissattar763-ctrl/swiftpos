'use client';

import Link from 'next/link';
import { useStore, roleAllowed } from '@/lib/store';
import { fmtDateTime, money, startOfDay } from '@/lib/format';
import { TENDER_LABEL } from '@/lib/types';
import { BarChart, StatCard } from '@/components/charts';
import Denied from '@/components/Denied';

export default function DashboardPage() {
  const { data, currentUser } = useStore();

  if (!roleAllowed(currentUser?.role, 'dashboard')) return <Denied />;
  if (!data) return null;

  const today = startOfDay(new Date());
  const todaysSales = data.sales.filter((s) => new Date(s.date) >= today);
  const todaysRevenue = todaysSales.reduce((a, s) => a + s.total, 0);
  const lowStock = data.products.filter((p) => p.stock <= p.threshold);
  const outOfStock = data.products.filter((p) => p.stock === 0);
  const inventoryValue = data.products.reduce((a, p) => a + p.stock * p.cost, 0);

  // Last 7 days revenue
  const days: { label: string; value: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const start = startOfDay(d);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const rev = data.sales
      .filter((s) => {
        const t = new Date(s.date);
        return t >= start && t < end;
      })
      .reduce((a, s) => a + s.total, 0);
    days.push({
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
      value: Math.round(rev * 100) / 100,
    });
  }

  const recent = [...data.sales].sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 8);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">SwiftMart General Store · demo overview</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Today's sales" value={money(todaysRevenue)} sub={`${todaysSales.length} transactions`} icon="💵" />
        <StatCard
          label="Low stock alerts"
          value={String(lowStock.length)}
          sub={outOfStock.length > 0 ? `${outOfStock.length} out of stock` : 'All stocked'}
          icon="⚠️"
        />
        <StatCard label="Inventory value" value={money(inventoryValue)} sub={`${data.products.length} products`} icon="📦" />
        <StatCard
          label="Total sales (90d)"
          value={money(data.sales.reduce((a, s) => a + s.total, 0))}
          sub={`${data.sales.length} transactions`}
          icon="📈"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="font-bold text-slate-900 mb-4">Revenue — last 7 days</h2>
          <BarChart data={days} />
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-slate-900">Low stock alerts</h2>
            <Link href="/inventory/" className="text-sm font-medium text-brand-600 hover:text-brand-700">
              Manage inventory →
            </Link>
          </div>
          {lowStock.length === 0 ? (
            <p className="text-sm text-slate-500">Everything is stocked. Nice.</p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {lowStock
                .sort((a, b) => a.stock - b.stock)
                .slice(0, 8)
                .map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between text-sm border border-slate-100 rounded-lg px-3 py-2"
                  >
                    <span className="font-medium text-slate-700">
                      {p.name} <span className="text-slate-400">· {p.sku}</span>
                    </span>
                    <span
                      className={`font-bold ${p.stock === 0 ? 'text-red-600' : 'text-amber-600'}`}
                    >
                      {p.stock === 0 ? 'Out of stock' : `${p.stock} left`}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-bold text-slate-900 mb-4">Recent sales</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Sale</th>
                <th>Date</th>
                <th>Items</th>
                <th>Tender</th>
                <th>Cashier</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((s) => (
                <tr key={s.id}>
                  <td className="font-mono text-xs">{s.id}</td>
                  <td className="text-slate-500">{fmtDateTime(s.date)}</td>
                  <td>{s.items.reduce((a, i) => a + i.qty, 0)}</td>
                  <td>
                    <span className="text-xs font-medium bg-slate-100 rounded-full px-2 py-0.5">
                      {TENDER_LABEL[s.tender]}
                    </span>
                  </td>
                  <td className="text-slate-500">{s.cashier}</td>
                  <td className="text-right font-semibold">{money(s.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
