'use client';

import { money } from '@/lib/format';

export function BarChart({
  data,
  height = 180,
  format = money,
}: {
  data: { label: string; value: number }[];
  height?: number;
  format?: (n: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end h-full min-w-0">
          <div
            title={`${d.label}: ${format(d.value)}`}
            className="w-full max-w-[42px] rounded-t-md bg-brand-500 hover:bg-brand-600 transition-colors"
            style={{ height: `${Math.max(3, (d.value / max) * 100)}%` }}
          />
          <div className="text-[10px] text-slate-400 mt-1 truncate w-full text-center">{d.label}</div>
        </div>
      ))}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: string;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
        {icon && <span className="text-xl">{icon}</span>}
      </div>
      <div className="text-2xl font-bold text-slate-900 mt-1">{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}
