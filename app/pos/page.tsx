'use client';

import { useMemo, useState } from 'react';
import { useStore, roleAllowed } from '@/lib/store';
import { money, fmtDateTime } from '@/lib/format';
import { Product, Sale, Tender, TENDER_LABEL } from '@/lib/types';
import Denied from '@/components/Denied';

interface CartLine {
  productId: string;
  qty: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export default function PosPage() {
  const { data, currentUser, completeSale } = useStore();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discountPct, setDiscountPct] = useState(0);
  const [tender, setTender] = useState<Tender>('cash');
  const [skuInput, setSkuInput] = useState('');
  const [skuError, setSkuError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [cashTendered, setCashTendered] = useState('');
  const [receipt, setReceipt] = useState<Sale | null>(null);

  if (!roleAllowed(currentUser?.role, 'pos')) return <Denied />;
  if (!data || !currentUser) return null;

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(data.products.map((p) => p.category)))],
    [data.products],
  );

  const filtered = data.products.filter((p) => {
    const q = search.trim().toLowerCase();
    const matchQ =
      !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
    const matchC = category === 'All' || p.category === category;
    return matchQ && matchC;
  });

  const cartDetailed = cart
    .map((l) => ({ ...l, product: data.products.find((p) => p.id === l.productId)! }))
    .filter((l) => l.product);

  const addToCart = (p: Product, qty = 1) => {
    if (p.stock <= 0) return;
    setCart((prev) => {
      const ex = prev.find((l) => l.productId === p.id);
      const cur = ex ? ex.qty : 0;
      const nextQty = Math.min(cur + qty, p.stock);
      if (ex) return prev.map((l) => (l.productId === p.id ? { ...l, qty: nextQty } : l));
      return [...prev, { productId: p.id, qty: nextQty }];
    });
  };

  const setQty = (productId: string, qty: number) => {
    const p = data.products.find((x) => x.id === productId);
    if (!p) return;
    const q = Math.max(0, Math.min(qty, p.stock));
    setCart((prev) =>
      q === 0
        ? prev.filter((l) => l.productId !== productId)
        : prev.map((l) => (l.productId === productId ? { ...l, qty: q } : l)),
    );
  };

  const scanSku = () => {
    const code = skuInput.trim().toLowerCase();
    setSkuError('');
    if (!code) return;
    const p = data.products.find((x) => x.sku.toLowerCase() === code);
    if (!p) {
      setSkuError(`No product found for SKU "${skuInput.trim()}".`);
    } else if (p.stock <= 0) {
      setSkuError(`${p.name} is out of stock.`);
    } else {
      addToCart(p);
      setSkuInput('');
    }
  };

  const subtotal = round2(cartDetailed.reduce((a, l) => a + l.product.price * l.qty, 0));
  const discPct = Math.min(100, Math.max(0, discountPct || 0));
  const discountAmt = round2((subtotal * discPct) / 100);
  const taxAmt = round2((subtotal - discountAmt) * data.taxRate);
  const total = round2(subtotal - discountAmt + taxAmt);

  const tendered = parseFloat(cashTendered);
  const change = !isNaN(tendered) ? round2(tendered - total) : 0;
  const canComplete =
    cartDetailed.length > 0 &&
    (tender !== 'cash' || (!isNaN(tendered) && tendered >= total));

  const doCheckout = () => {
    const sale = completeSale({
      lines: cart.map((l) => ({ productId: l.productId, qty: l.qty })),
      discountPct: discPct,
      tender,
      cashTendered: tender === 'cash' && !isNaN(tendered) ? round2(tendered) : undefined,
      cashier: currentUser.name,
    });
    if (sale) {
      setReceipt(sale);
      setCheckoutOpen(false);
      setCart([]);
      setDiscountPct(0);
      setCashTendered('');
      setTender('cash');
    }
  };

  const newSale = () => setReceipt(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">POS Billing</h1>
          <p className="text-sm text-slate-500">Simulated checkout — no real payment is processed.</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Left: product picker */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-4">
            <label className="label" htmlFor="sku">Scan barcode / type SKU, then Enter</label>
            <div className="flex gap-2">
              <input
                id="sku"
                className="input font-mono"
                placeholder="e.g. 1001"
                value={skuInput}
                onChange={(e) => setSkuInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && scanSku()}
              />
              <button className="btn-secondary shrink-0" onClick={scanSku}>Add</button>
            </div>
            {skuError && <p className="text-xs text-red-600 mt-1">{skuError}</p>}
          </div>

          <div className="flex gap-2 flex-wrap">
            <input
              className="input max-w-xs"
              placeholder="Search products…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select className="input max-w-[200px]" value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                disabled={p.stock <= 0}
                className="card p-3 text-left hover:border-brand-500 hover:shadow transition disabled:opacity-50"
              >
                <div className="text-sm font-semibold text-slate-800 leading-tight">{p.name}</div>
                <div className="text-[11px] text-slate-400 font-mono mt-0.5">SKU {p.sku}</div>
                <div className="flex items-center justify-between mt-2">
                  <span className="font-bold text-brand-700">{money(p.price)}</span>
                  <span className={`text-[11px] font-medium ${p.stock <= p.threshold ? 'text-amber-600' : 'text-slate-400'}`}>
                    {p.stock <= 0 ? 'Out' : `${p.stock} in stock`}
                  </span>
                </div>
              </button>
            ))}
          </div>
          {filtered.length === 0 && <p className="text-sm text-slate-400">No products match.</p>}
        </div>

        {/* Right: cart */}
        <div className="card p-4 h-fit lg:sticky lg:top-[76px]">
          <h2 className="font-bold text-slate-900 mb-3">Current sale</h2>
          {cartDetailed.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">
              Cart is empty — scan a SKU or tap a product.
            </p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto mb-4">
              {cartDetailed.map((l) => (
                <div key={l.productId} className="flex items-center gap-2 border border-slate-100 rounded-lg p-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{l.product.name}</div>
                    <div className="text-xs text-slate-400">{money(l.product.price)} each</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button className="w-7 h-7 rounded bg-slate-100 hover:bg-slate-200 font-bold" onClick={() => setQty(l.productId, l.qty - 1)}>−</button>
                    <span className="w-8 text-center text-sm font-semibold">{l.qty}</span>
                    <button className="w-7 h-7 rounded bg-slate-100 hover:bg-slate-200 font-bold" onClick={() => setQty(l.productId, l.qty + 1)}>+</button>
                  </div>
                  <div className="text-sm font-semibold w-16 text-right">{money(l.product.price * l.qty)}</div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2 text-sm border-t border-slate-100 pt-3">
            <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{money(subtotal)}</span></div>
            <div className="flex justify-between items-center text-slate-500">
              <span>Discount %</span>
              <input
                type="number" min={0} max={100}
                className="input !w-20 !py-1 text-right"
                value={discountPct}
                onChange={(e) => setDiscountPct(parseFloat(e.target.value) || 0)}
              />
            </div>
            {discountAmt > 0 && <div className="flex justify-between text-slate-500"><span>Discount</span><span>−{money(discountAmt)}</span></div>}
            <div className="flex justify-between text-slate-500"><span>Tax ({Math.round(data.taxRate * 100)}%)</span><span>{money(taxAmt)}</span></div>
            <div className="flex justify-between text-lg font-bold text-slate-900 border-t border-slate-100 pt-2"><span>Total</span><span>{money(total)}</span></div>
          </div>

          <button
            className="btn-primary w-full mt-4 py-3 text-base"
            disabled={cartDetailed.length === 0}
            onClick={() => setCheckoutOpen(true)}
          >
            Checkout →
          </button>
          <button className="btn-secondary w-full mt-2 text-sm" onClick={() => { setCart([]); setDiscountPct(0); }}>
            Clear cart
          </button>
        </div>
      </div>

      {/* Checkout modal */}
      {checkoutOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="card w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-slate-900">Checkout (simulated)</h2>
            <p className="text-xs text-slate-400 mb-4">Total due: <span className="font-bold text-slate-700">{money(total)}</span></p>

            <label className="label">Tender type</label>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {(Object.keys(TENDER_LABEL) as Tender[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTender(t)}
                  className={`rounded-lg border-2 px-3 py-2.5 text-sm font-semibold transition ${
                    tender === t ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {t === 'cash' ? '💵' : t === 'card' ? '💳' : '📱'} {TENDER_LABEL[t]}
                </button>
              ))}
            </div>

            {tender === 'cash' && (
              <div className="mb-4">
                <label className="label" htmlFor="tendered">Cash tendered</label>
                <input
                  id="tendered" type="number" min={0} step="0.01"
                  className="input" placeholder={total.toFixed(2)}
                  value={cashTendered}
                  onChange={(e) => setCashTendered(e.target.value)}
                />
                <div className="flex gap-2 mt-2">
                  {[total, Math.ceil(total), Math.ceil(total / 10) * 10].map((v, i) => (
                    <button key={i} className="btn-secondary text-xs !px-3 !py-1.5" onClick={() => setCashTendered(v.toFixed(2))}>
                      {money(v)}
                    </button>
                  ))}
                </div>
                {!isNaN(tendered) && tendered >= total && (
                  <p className="text-sm text-slate-600 mt-2">Change due: <span className="font-bold">{money(change)}</span></p>
                )}
                {!isNaN(tendered) && tendered < total && (
                  <p className="text-xs text-red-600 mt-2">Tendered amount is less than the total.</p>
                )}
              </div>
            )}

            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
              Demo only — this tender is simulated and moves no real money.
            </p>

            <div className="flex gap-2">
              <button className="btn-secondary flex-1" onClick={() => setCheckoutOpen(false)}>Back</button>
              <button className="btn-primary flex-1" disabled={!canComplete} onClick={doCheckout}>
                Complete sale
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt modal */}
      {receipt && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="card w-full max-w-sm p-0 overflow-hidden">
            <div id="receipt-print" className="p-6 bg-white">
              <div className="text-center mb-4">
                <div className="font-bold text-lg">SwiftMart General Store</div>
                <div className="text-xs text-slate-500">123 Market Street · Demo receipt</div>
                <div className="text-xs text-slate-500">{receipt.id} · {fmtDateTime(receipt.date)}</div>
                <div className="text-xs text-slate-500">Cashier: {receipt.cashier}</div>
              </div>
              <div className="border-t border-dashed border-slate-300 my-3" />
              <div className="space-y-1 text-sm">
                {receipt.items.map((i, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span>{i.name} × {i.qty}</span>
                    <span className="font-medium">{money(i.price * i.qty)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-dashed border-slate-300 my-3" />
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{money(receipt.subtotal)}</span></div>
                {receipt.discountAmt > 0 && <div className="flex justify-between text-slate-500"><span>Discount ({receipt.discountPct}%)</span><span>−{money(receipt.discountAmt)}</span></div>}
                <div className="flex justify-between text-slate-500"><span>Tax</span><span>{money(receipt.taxAmt)}</span></div>
                <div className="flex justify-between font-bold text-base"><span>Total</span><span>{money(receipt.total)}</span></div>
                <div className="flex justify-between text-slate-500"><span>Tender</span><span>{TENDER_LABEL[receipt.tender]} (simulated)</span></div>
                {receipt.cashTendered !== undefined && (
                  <>
                    <div className="flex justify-between text-slate-500"><span>Tendered</span><span>{money(receipt.cashTendered)}</span></div>
                    <div className="flex justify-between text-slate-500"><span>Change</span><span>{money(receipt.change || 0)}</span></div>
                  </>
                )}
              </div>
              <div className="border-t border-dashed border-slate-300 my-3" />
              <p className="text-center text-[11px] text-slate-400">Thank you for shopping! · Demo receipt — not a real transaction</p>
            </div>
            <div className="flex gap-2 p-4 bg-slate-50">
              <button className="btn-secondary flex-1" onClick={() => window.print()}>🖨 Print</button>
              <button className="btn-primary flex-1" onClick={newSale}>New sale</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
