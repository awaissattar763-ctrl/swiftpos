'use client';

import { useMemo, useState } from 'react';
import { useStore, roleAllowed } from '@/lib/store';
import { money } from '@/lib/format';
import { Product } from '@/lib/types';
import Denied from '@/components/Denied';
import { uid } from '@/lib/format';

const EMPTY: Product = {
  id: '',
  sku: '',
  name: '',
  category: '',
  price: 0,
  cost: 0,
  stock: 0,
  threshold: 5,
};

export default function InventoryPage() {
  const { data, currentUser, saveProduct, adjustStock } = useStore();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [showLowOnly, setShowLowOnly] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [adjustDelta, setAdjustDelta] = useState('');
  const [formError, setFormError] = useState('');

  if (!roleAllowed(currentUser?.role, 'inventory')) return <Denied />;
  if (!data) return null;

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(data.products.map((p) => p.category)))],
    [data.products],
  );

  const filtered = data.products.filter((p) => {
    const q = search.trim().toLowerCase();
    const matchQ = !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
    const matchC = category === 'All' || p.category === category;
    const matchL = !showLowOnly || p.stock <= p.threshold;
    return matchQ && matchC && matchL;
  });

  const openAdd = () => {
    setFormError('');
    setEditing({ ...EMPTY, id: uid('p'), sku: `9${String(Math.floor(1000 + Math.random() * 9000))}` });
  };

  const saveEdit = () => {
    if (!editing) return;
    if (!editing.name.trim()) return setFormError('Product name is required.');
    if (!editing.sku.trim()) return setFormError('SKU is required.');
    if (editing.price < 0 || editing.cost < 0) return setFormError('Price and cost cannot be negative.');
    const dup = data.products.find(
      (p) => p.sku.toLowerCase() === editing.sku.trim().toLowerCase() && p.id !== editing.id,
    );
    if (dup) return setFormError(`SKU "${editing.sku}" is already used by ${dup.name}.`);
    saveProduct({
      ...editing,
      name: editing.name.trim(),
      sku: editing.sku.trim(),
      category: editing.category.trim() || 'Uncategorized',
      stock: Math.max(0, Math.floor(editing.stock)),
      threshold: Math.max(0, Math.floor(editing.threshold)),
    });
    setEditing(null);
  };

  const doAdjust = () => {
    if (!adjusting) return;
    const delta = parseInt(adjustDelta, 10);
    if (isNaN(delta) || delta === 0) return;
    adjustStock(adjusting.id, delta);
    setAdjusting(null);
    setAdjustDelta('');
  };

  const set = (k: keyof Product, v: string | number) =>
    setEditing((e) => (e ? { ...e, [k]: v } : e));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Products & Inventory</h1>
          <p className="text-sm text-slate-500">{data.products.length} products · demo stock levels</p>
        </div>
        <button className="btn-primary" onClick={openAdd}>+ Add product</button>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <input
          className="input max-w-xs"
          placeholder="Search name or SKU…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input max-w-[200px]" value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showLowOnly} onChange={(e) => setShowLowOnly(e.target.checked)} className="w-4 h-4" />
          Low stock only
        </label>
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Product</th>
              <th>Category</th>
              <th className="text-right">Price</th>
              <th className="text-right">Cost</th>
              <th className="text-right">Stock</th>
              <th className="text-right">Value</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const low = p.stock <= p.threshold;
              return (
                <tr key={p.id} className={low ? 'bg-amber-50/60' : ''}>
                  <td className="font-mono text-xs text-slate-500">{p.sku}</td>
                  <td className="font-medium">{p.name}</td>
                  <td className="text-slate-500">{p.category}</td>
                  <td className="text-right">{money(p.price)}</td>
                  <td className="text-right text-slate-500">{money(p.cost)}</td>
                  <td className={`text-right font-bold ${p.stock === 0 ? 'text-red-600' : low ? 'text-amber-600' : 'text-slate-700'}`}>
                    {p.stock}
                    {low && <span className="ml-1 text-[10px] font-semibold uppercase">low</span>}
                  </td>
                  <td className="text-right text-slate-500">{money(p.stock * p.cost)}</td>
                  <td className="whitespace-nowrap text-right">
                    <button className="text-brand-600 hover:text-brand-800 text-sm font-medium mr-3" onClick={() => { setFormError(''); setEditing({ ...p }); }}>
                      Edit
                    </button>
                    <button className="text-slate-500 hover:text-slate-800 text-sm font-medium" onClick={() => { setAdjusting(p); setAdjustDelta(''); }}>
                      Adjust
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && <p className="text-sm text-slate-400">No products match.</p>}

      {/* Add/Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="card w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-900 mb-4">
              {data.products.some((p) => p.id === editing.id) ? 'Edit product' : 'Add product'}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label">Name</label>
                <input className="input" value={editing.name} onChange={(e) => set('name', e.target.value)} />
              </div>
              <div>
                <label className="label">SKU</label>
                <input className="input font-mono" value={editing.sku} onChange={(e) => set('sku', e.target.value)} />
              </div>
              <div>
                <label className="label">Category</label>
                <input className="input" list="cats" value={editing.category} onChange={(e) => set('category', e.target.value)} placeholder="e.g. Groceries" />
                <datalist id="cats">
                  {categories.filter((c) => c !== 'All').map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="label">Price ($)</label>
                <input type="number" min={0} step="0.01" className="input" value={editing.price} onChange={(e) => set('price', parseFloat(e.target.value) || 0)} />
              </div>
              <div>
                <label className="label">Cost ($)</label>
                <input type="number" min={0} step="0.01" className="input" value={editing.cost} onChange={(e) => set('cost', parseFloat(e.target.value) || 0)} />
              </div>
              <div>
                <label className="label">Stock</label>
                <input type="number" min={0} step={1} className="input" value={editing.stock} onChange={(e) => set('stock', parseInt(e.target.value) || 0)} />
              </div>
              <div>
                <label className="label">Low-stock threshold</label>
                <input type="number" min={0} step={1} className="input" value={editing.threshold} onChange={(e) => set('threshold', parseInt(e.target.value) || 0)} />
              </div>
            </div>
            {formError && <p className="text-xs text-red-600 mt-3">{formError}</p>}
            <div className="flex gap-2 mt-5">
              <button className="btn-secondary flex-1" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary flex-1" onClick={saveEdit}>Save product</button>
            </div>
          </div>
        </div>
      )}

      {/* Stock adjust modal */}
      {adjusting && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="card w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-slate-900">Adjust stock</h2>
            <p className="text-sm text-slate-500 mb-4">
              {adjusting.name} · currently <span className="font-bold text-slate-800">{adjusting.stock}</span> units
            </p>
            <label className="label" htmlFor="delta">Adjustment (+ adds, − removes)</label>
            <input
              id="delta" type="number" step={1}
              className="input" placeholder="e.g. 20 or -5"
              value={adjustDelta}
              onChange={(e) => setAdjustDelta(e.target.value)}
            />
            <div className="flex gap-2 mt-2">
              {[10, 25, 50].map((v) => (
                <button key={v} className="btn-secondary text-xs !px-3 !py-1.5" onClick={() => setAdjustDelta(String(v))}>+{v}</button>
              ))}
              <button className="btn-secondary text-xs !px-3 !py-1.5" onClick={() => setAdjustDelta(String(-adjusting.stock))}>Zero it</button>
            </div>
            <div className="flex gap-2 mt-5">
              <button className="btn-secondary flex-1" onClick={() => setAdjusting(null)}>Cancel</button>
              <button className="btn-primary flex-1" onClick={doAdjust}>Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
