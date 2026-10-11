'use client';

import { useEffect, useMemo, useState } from 'react';
import { useStore, roleAllowed } from '@/lib/store';
import { getSupabase } from '@/lib/supabase';
import { money, fmtDate } from '@/lib/format';
import Denied from '@/components/Denied';

interface Supplier {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  country: string;
  payment_terms: string;
  notes: string;
  is_active: boolean;
}

interface PO {
  id: string;
  po_number: string;
  supplier_id: string | null;
  order_date: string;
  expected_date: string | null;
  status: 'draft' | 'ordered' | 'received' | 'cancelled';
  subtotal: number;
  tax: number;
  total: number;
  notes: string;
}

interface POItem {
  product_id: string | null;
  product_name: string;
  qty: number;
  unit_cost: number;
}

interface ProductLite {
  id: string;
  sku: string;
  name: string;
  stock_qty: number;
  cost_price: number;
}

const EMPTY_SUPPLIER: Supplier = {
  id: '',
  name: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  country: '',
  payment_terms: '',
  notes: '',
  is_active: true,
};

const STATUS_STYLE: Record<PO['status'], string> = {
  draft: 'bg-slate-100 text-slate-700',
  ordered: 'bg-blue-100 text-blue-800',
  received: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-700',
};

export default function SuppliersPage() {
  const { currentUser } = useStore();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pos, setPos] = useState<PO[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'suppliers' | 'orders'>('suppliers');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [formError, setFormError] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // PO builder state
  const [building, setBuilding] = useState(false);
  const [poSupplier, setPoSupplier] = useState('');
  const [poDate, setPoDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [poExpected, setPoExpected] = useState('');
  const [poNotes, setPoNotes] = useState('');
  const [poTaxPct, setPoTaxPct] = useState('0');
  const [poItems, setPoItems] = useState<POItem[]>([]);
  const [itemSearch, setItemSearch] = useState('');

  const load = async () => {
    const sb = getSupabase();
    setLoading(true);
    const [{ data: sup }, { data: orders }, { data: prods }] = await Promise.all([
      sb.from('suppliers').select('*').order('name'),
      sb.from('purchase_orders').select('*').order('order_date', { ascending: false }).limit(200),
      sb.from('products').select('id,sku,name,stock_qty,cost_price').eq('is_active', true).order('name'),
    ]);
    setSuppliers((sup || []) as Supplier[]);
    setPos((orders || []) as PO[]);
    setProducts((prods || []) as ProductLite[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  if (!roleAllowed(currentUser?.role, 'suppliers')) return <Denied />;

  const supMap = useMemo(() => new Map(suppliers.map((s) => [s.id, s.name])), [suppliers]);

  const filteredSuppliers = suppliers.filter((s) => {
    const q = search.trim().toLowerCase();
    return !q || s.name.toLowerCase().includes(q) || s.phone.includes(q) || s.city.toLowerCase().includes(q);
  });

  // ---- supplier CRUD ----
  const saveSupplier = async () => {
    if (!editing) return;
    if (!editing.name.trim()) return setFormError('Supplier name is required.');
    setFormError('');
    const sb = getSupabase();
    const payload = {
      name: editing.name.trim(),
      phone: editing.phone.trim(),
      email: editing.email.trim(),
      address: editing.address.trim(),
      city: editing.city.trim(),
      country: editing.country.trim(),
      payment_terms: editing.payment_terms.trim(),
      notes: editing.notes.trim(),
      is_active: editing.is_active,
    };
    const { error } = editing.id
      ? await sb.from('suppliers').update(payload).eq('id', editing.id)
      : await sb.from('suppliers').insert(payload);
    if (error) return setFormError(error.message);
    setEditing(null);
    load();
  };

  // ---- PO builder ----
  const poSubtotal = poItems.reduce((a, i) => a + i.qty * i.unit_cost, 0);
  const poTax = (poSubtotal * (parseFloat(poTaxPct) || 0)) / 100;
  const poTotal = poSubtotal + poTax;

  const addItem = (p: ProductLite) => {
    if (poItems.some((i) => i.product_id === p.id)) return;
    setPoItems([...poItems, { product_id: p.id, product_name: p.name, qty: 1, unit_cost: Number(p.cost_price) || 0 }]);
    setItemSearch('');
  };

  const createPO = async (asOrdered: boolean) => {
    if (!poSupplier) return setMsg({ ok: false, text: 'Select a supplier first.' });
    if (!poItems.length) return setMsg({ ok: false, text: 'Add at least one item.' });
    const sb = getSupabase();
    const { data, error } = await sb
      .from('purchase_orders')
      .insert({
        supplier_id: poSupplier,
        order_date: poDate,
        expected_date: poExpected || null,
        status: asOrdered ? 'ordered' : 'draft',
        subtotal: poSubtotal,
        tax: poTax,
        total: poTotal,
        notes: poNotes.trim(),
        created_by: currentUser?.id ?? null,
      })
      .select('id,po_number')
      .single();
    if (error) return setMsg({ ok: false, text: error.message });
    const { error: iErr } = await sb.from('purchase_items').insert(
      poItems.map((i) => ({
        po_id: data.id,
        product_id: i.product_id,
        product_name: i.product_name,
        qty: i.qty,
        unit_cost: i.unit_cost,
      })),
    );
    if (iErr) return setMsg({ ok: false, text: iErr.message });
    setMsg({ ok: true, text: `PO ${data.po_number} created${asOrdered ? ' and marked Ordered' : ''}.` });
    setBuilding(false);
    setPoSupplier('');
    setPoNotes('');
    setPoItems([]);
    setPoTaxPct('0');
    load();
  };

  const setStatus = async (po: PO, status: PO['status']) => {
    const sb = getSupabase();
    if (status === 'received' && po.status !== 'received') {
      // Receiving: add stock + log movements + refresh cost
      const { data: items, error: iErr } = await sb.from('purchase_items').select('*').eq('po_id', po.id);
      if (iErr) return setMsg({ ok: false, text: iErr.message });
      for (const it of items || []) {
        if (!it.product_id) continue;
        const { data: prod } = await sb.from('products').select('stock_qty').eq('id', it.product_id).single();
        const newQty = (prod?.stock_qty ?? 0) + it.qty;
        await sb.from('products').update({ stock_qty: newQty, cost_price: it.unit_cost }).eq('id', it.product_id);
        await sb.from('stock_movements').insert({
          product_id: it.product_id,
          change_qty: it.qty,
          reason: 'purchase',
          ref_id: po.po_number,
          created_by: currentUser?.id ?? null,
        });
      }
      const { error } = await sb
        .from('purchase_orders')
        .update({ status: 'received', received_at: new Date().toISOString() })
        .eq('id', po.id);
      if (error) return setMsg({ ok: false, text: error.message });
      setMsg({ ok: true, text: `${po.po_number} received — stock updated.` });
    } else {
      const { error } = await sb.from('purchase_orders').update({ status }).eq('id', po.id);
      if (error) return setMsg({ ok: false, text: error.message });
      setMsg({ ok: true, text: `${po.po_number} → ${status}.` });
    }
    load();
  };

  const itemMatches = itemSearch.trim()
    ? products
        .filter(
          (p) =>
            p.name.toLowerCase().includes(itemSearch.trim().toLowerCase()) ||
            p.sku.toLowerCase().includes(itemSearch.trim().toLowerCase()),
        )
        .slice(0, 8)
    : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Suppliers & Purchases</h1>
          <p className="text-sm text-slate-500">Manage suppliers, raise purchase orders, receive stock.</p>
        </div>
        <div className="flex gap-2">
          <button
            className={`btn ${tab === 'suppliers' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab('suppliers')}
          >
            Suppliers
          </button>
          <button
            className={`btn ${tab === 'orders' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab('orders')}
          >
            Purchase Orders
          </button>
        </div>
      </div>

      {msg && (
        <div className={`rounded-lg px-4 py-2 text-sm ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
          {msg.text}
        </div>
      )}

      {loading ? (
        <div className="text-slate-400 text-sm">Loading…</div>
      ) : tab === 'suppliers' ? (
        <>
          <div className="flex gap-2 flex-wrap items-center">
            <input className="input max-w-xs" placeholder="Search name, phone, city…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className="btn-primary" onClick={() => { setFormError(''); setEditing({ ...EMPTY_SUPPLIER }); }}>
              + Add supplier
            </button>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th><th>Phone</th><th>City / Country</th><th>Payment terms</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filteredSuppliers.map((s) => (
                  <tr key={s.id}>
                    <td className="font-medium">{s.name}{s.email && <div className="text-xs text-slate-400">{s.email}</div>}</td>
                    <td className="font-mono text-xs">{s.phone || '—'}</td>
                    <td>{[s.city, s.country].filter(Boolean).join(', ') || '—'}</td>
                    <td className="text-xs">{s.payment_terms || '—'}</td>
                    <td>{s.is_active ? <span className="text-green-700 text-xs font-semibold">Active</span> : <span className="text-slate-400 text-xs">Inactive</span>}</td>
                    <td className="text-right"><button className="btn-secondary !px-3 !py-1 text-xs" onClick={() => { setFormError(''); setEditing({ ...s }); }}>Edit</button></td>
                  </tr>
                ))}
                {!filteredSuppliers.length && <tr><td colSpan={6} className="text-center text-slate-400 py-8">No suppliers yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div>
            {!building ? (
              <button className="btn-primary" onClick={() => { setBuilding(true); setMsg(null); }}>+ New purchase order</button>
            ) : (
              <div className="card p-4 space-y-3">
                <h2 className="font-bold text-slate-900">New Purchase Order</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div><label className="label">Supplier *</label>
                    <select className="input" value={poSupplier} onChange={(e) => setPoSupplier(e.target.value)}>
                      <option value="">Select…</option>
                      {suppliers.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select></div>
                  <div><label className="label">Order date</label><input type="date" className="input" value={poDate} onChange={(e) => setPoDate(e.target.value)} /></div>
                  <div><label className="label">Expected date</label><input type="date" className="input" value={poExpected} onChange={(e) => setPoExpected(e.target.value)} /></div>
                  <div><label className="label">Tax %</label><input className="input" value={poTaxPct} onChange={(e) => setPoTaxPct(e.target.value)} inputMode="decimal" /></div>
                </div>
                <div>
                  <label className="label">Add products</label>
                  <input className="input max-w-sm" placeholder="Search product name or SKU…" value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} />
                  {itemMatches.length > 0 && (
                    <div className="mt-1 border border-slate-200 rounded-lg max-w-sm bg-white shadow-sm">
                      {itemMatches.map((p) => (
                        <button key={p.id} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex justify-between" onClick={() => addItem(p)}>
                          <span>{p.name} <span className="text-xs text-slate-400 font-mono">{p.sku}</span></span>
                          <span className="text-xs text-slate-400">stock {p.stock_qty}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {poItems.length > 0 && (
                  <div className="table-wrap">
                    <table className="data">
                      <thead><tr><th>Product</th><th>Qty</th><th>Unit cost</th><th>Line total</th><th></th></tr></thead>
                      <tbody>
                        {poItems.map((i, idx) => (
                          <tr key={idx}>
                            <td>{i.product_name}</td>
                            <td><input type="number" min={1} className="input !w-20" value={i.qty} onChange={(e) => setPoItems(poItems.map((x, j) => j === idx ? { ...x, qty: Math.max(1, parseInt(e.target.value) || 1) } : x))} /></td>
                            <td><input type="number" min={0} step="0.01" className="input !w-28" value={i.unit_cost} onChange={(e) => setPoItems(poItems.map((x, j) => j === idx ? { ...x, unit_cost: Math.max(0, parseFloat(e.target.value) || 0) } : x))} /></td>
                            <td>{money(i.qty * i.unit_cost)}</td>
                            <td><button className="text-red-600 text-xs" onClick={() => setPoItems(poItems.filter((_, j) => j !== idx))}>Remove</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div>
                  <label className="label">Notes</label>
                  <input className="input" placeholder="Delivery instructions, etc." value={poNotes} onChange={(e) => setPoNotes(e.target.value)} />
                </div>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="text-sm text-slate-600">
                    Subtotal <b>{money(poSubtotal)}</b> · Tax <b>{money(poTax)}</b> · <span className="text-lg font-bold text-slate-900">{money(poTotal)}</span>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-secondary" onClick={() => setBuilding(false)}>Cancel</button>
                    <button className="btn-secondary" onClick={() => createPO(false)}>Save as draft</button>
                    <button className="btn-primary" onClick={() => createPO(true)}>Create & mark Ordered</button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>PO #</th><th>Supplier</th><th>Order date</th><th>Status</th><th className="text-right">Total</th><th></th></tr></thead>
              <tbody>
                {pos.map((p) => (
                  <tr key={p.id}>
                    <td className="font-mono text-xs font-semibold">{p.po_number}</td>
                    <td>{supMap.get(p.supplier_id || '') || '—'}</td>
                    <td className="text-xs">{fmtDate(p.order_date)}</td>
                    <td><span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_STYLE[p.status]}`}>{p.status}</span></td>
                    <td className="text-right font-semibold">{money(Number(p.total))}</td>
                    <td className="text-right whitespace-nowrap">
                      {p.status === 'draft' && <button className="btn-secondary !px-2 !py-1 text-xs mr-1" onClick={() => setStatus(p, 'ordered')}>Mark ordered</button>}
                      {p.status === 'ordered' && <button className="btn-primary !px-2 !py-1 text-xs mr-1" onClick={() => setStatus(p, 'received')}>Receive stock</button>}
                      {(p.status === 'draft' || p.status === 'ordered') && <button className="text-red-600 text-xs" onClick={() => setStatus(p, 'cancelled')}>Cancel</button>}
                    </td>
                  </tr>
                ))}
                {!pos.length && <tr><td colSpan={6} className="text-center text-slate-400 py-8">No purchase orders yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setEditing(null)}>
          <div className="card p-6 w-full max-w-lg space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-lg text-slate-900">{editing.id ? 'Edit supplier' : 'Add supplier'}</h2>
            {formError && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{formError}</div>}
            <div><label className="label">Name *</label><input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Phone (+92…)</label><input className="input" placeholder="+92 300 1234567" value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></div>
              <div><label className="label">Email</label><input className="input" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></div>
            </div>
            <div><label className="label">Address</label><input className="input" value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">City</label><input className="input" value={editing.city} onChange={(e) => setEditing({ ...editing, city: e.target.value })} /></div>
              <div><label className="label">Country</label><input className="input" value={editing.country} onChange={(e) => setEditing({ ...editing, country: e.target.value })} /></div>
            </div>
            <div><label className="label">Payment terms</label><input className="input" placeholder="e.g. Net 30, Cash on delivery" value={editing.payment_terms} onChange={(e) => setEditing({ ...editing, payment_terms: e.target.value })} /></div>
            <div><label className="label">Notes</label><input className="input" value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} className="w-4 h-4" /> Active
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary" onClick={saveSupplier}>Save supplier</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
