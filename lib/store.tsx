'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  DemoUser,
  Expense,
  Product,
  ReturnRecord,
  Role,
  Sale,
  SaleItem,
  StoreData,
  Tender,
} from './types';
import { buildSeed } from './seed';

const STORAGE_KEY = 'swiftpos-demo-v1';

export interface NewSaleInput {
  lines: { productId: string; qty: number }[];
  discountPct: number;
  tender: Tender;
  cashTendered?: number;
  cashier: string;
}

export interface NewReturnInput {
  saleId: string;
  lines: { productId: string; qty: number }[];
  reason: string;
  cashier: string;
}

interface StoreContextValue {
  loaded: boolean;
  data: StoreData | null;
  currentUser: DemoUser | null;
  login: (userId: string) => void;
  logout: () => void;
  completeSale: (input: NewSaleInput) => Sale | null;
  processReturn: (input: NewReturnInput) => { record: ReturnRecord } | { error: string };
  saveProduct: (p: Product) => void;
  adjustStock: (productId: string, delta: number) => void;
  addExpense: (e: Omit<Expense, 'id'>) => void;
  saveUser: (u: DemoUser) => void;
  setUserActive: (id: string, active: boolean) => void;
  importData: (json: string) => { ok: boolean; error?: string };
  exportData: () => string;
  resetDemo: () => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

const round2 = (n: number) => Math.round(n * 100) / 100;

function nextId(prefix: string, existing: string[]): string {
  let max = 0;
  for (const id of existing) {
    const m = id.match(/(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-${String(max + 1).padStart(6, '0')}`;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<StoreData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const dataRef = useRef<StoreData | null>(null);
  dataRef.current = data;

  // Load once on the client
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === 1 && Array.isArray(parsed.products)) {
          setData(parsed as StoreData);
        } else {
          setData(buildSeed());
        }
      } else {
        setData(buildSeed());
      }
    } catch {
      setData(buildSeed());
    }
    setLoaded(true);
  }, []);

  // Persist on every change
  useEffect(() => {
    if (!loaded || !data) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // storage full / unavailable — demo continues in memory
    }
  }, [data, loaded]);

  const currentUser: DemoUser | null =
    data?.users.find((u) => u.id === data.currentUserId && u.active) ?? null;

  const login = (userId: string) => {
    const d = dataRef.current;
    if (!d) return;
    const user = d.users.find((u) => u.id === userId && u.active);
    if (!user) return;
    setData({ ...d, currentUserId: userId });
  };

  const logout = () => {
    const d = dataRef.current;
    if (!d) return;
    setData({ ...d, currentUserId: null });
  };

  const completeSale = (input: NewSaleInput): Sale | null => {
    const d = dataRef.current;
    if (!d) return null;

    const items: SaleItem[] = [];
    for (const line of input.lines) {
      const p = d.products.find((x) => x.id === line.productId);
      if (!p || line.qty <= 0) continue;
      const qty = Math.min(line.qty, p.stock);
      if (qty <= 0) continue;
      items.push({
        productId: p.id,
        name: p.name,
        qty,
        price: p.price,
        cost: p.cost,
        returnedQty: 0,
      });
    }
    if (items.length === 0) return null;

    const subtotal = round2(items.reduce((a, i) => a + i.price * i.qty, 0));
    const discountPct = Math.min(100, Math.max(0, input.discountPct));
    const discountAmt = round2((subtotal * discountPct) / 100);
    const taxAmt = round2((subtotal - discountAmt) * d.taxRate);
    const total = round2(subtotal - discountAmt + taxAmt);

    const sale: Sale = {
      id: nextId('S', d.sales.map((s) => s.id)),
      date: new Date().toISOString(),
      items,
      subtotal,
      discountPct,
      discountAmt,
      taxAmt,
      total,
      tender: input.tender,
      cashier: input.cashier,
      cashTendered: input.cashTendered,
      change:
        input.cashTendered !== undefined ? round2(input.cashTendered - total) : undefined,
    };

    const products = d.products.map((p) => {
      const line = items.find((i) => i.productId === p.id);
      return line ? { ...p, stock: Math.max(0, p.stock - line.qty) } : p;
    });

    setData({ ...d, products, sales: [...d.sales, sale] });
    return sale;
  };

  const processReturn = (
    input: NewReturnInput,
  ): { record: ReturnRecord } | { error: string } => {
    const d = dataRef.current;
    if (!d) return { error: 'Store not loaded.' };
    const sale = d.sales.find((s) => s.id === input.saleId);
    if (!sale) return { error: 'Sale not found.' };

    const returnItems: ReturnRecord['items'] = [];
    for (const line of input.lines) {
      const saleLine = sale.items.find((i) => i.productId === line.productId);
      if (!saleLine || line.qty <= 0) continue;
      const returnable = saleLine.qty - saleLine.returnedQty;
      const qty = Math.min(line.qty, returnable);
      if (qty <= 0) continue;
      returnItems.push({ productId: saleLine.productId, name: saleLine.name, qty, price: saleLine.price });
    }
    if (returnItems.length === 0) return { error: 'Nothing to return.' };

    const refundTotal = round2(returnItems.reduce((a, i) => a + i.qty * i.price, 0));
    const record: ReturnRecord = {
      id: nextId('R', d.returns.map((r) => r.id)).replace('R-', 'R-'),
      date: new Date().toISOString(),
      saleId: sale.id,
      items: returnItems,
      refundTotal,
      reason: input.reason || 'No reason given',
      cashier: input.cashier,
    };
    // nextId pads to 6; returns use 4-digit style in seed — normalize
    record.id = record.id.replace(/^R-0{2}/, 'R-');

    const sales = d.sales.map((s) =>
      s.id === sale.id
        ? {
            ...s,
            items: s.items.map((i) => {
              const r = returnItems.find((x) => x.productId === i.productId);
              return r ? { ...i, returnedQty: i.returnedQty + r.qty } : i;
            }),
          }
        : s,
    );
    const products = d.products.map((p) => {
      const r = returnItems.find((x) => x.productId === p.id);
      return r ? { ...p, stock: p.stock + r.qty } : p;
    });

    setData({ ...d, sales, products, returns: [...d.returns, record] });
    return { record };
  };

  const saveProduct = (p: Product) => {
    const d = dataRef.current;
    if (!d) return;
    const exists = d.products.some((x) => x.id === p.id);
    setData({
      ...d,
      products: exists ? d.products.map((x) => (x.id === p.id ? p : x)) : [...d.products, p],
    });
  };

  const adjustStock = (productId: string, delta: number) => {
    const d = dataRef.current;
    if (!d) return;
    setData({
      ...d,
      products: d.products.map((p) =>
        p.id === productId ? { ...p, stock: Math.max(0, p.stock + delta) } : p,
      ),
    });
  };

  const addExpense = (e: Omit<Expense, 'id'>) => {
    const d = dataRef.current;
    if (!d) return;
    const id = nextId('E', d.expenses.map((x) => x.id)).replace(/^E-0{2}/, 'E-');
    setData({ ...d, expenses: [...d.expenses, { ...e, id }] });
  };

  const saveUser = (u: DemoUser) => {
    const d = dataRef.current;
    if (!d) return;
    const exists = d.users.some((x) => x.id === u.id);
    setData({
      ...d,
      users: exists ? d.users.map((x) => (x.id === u.id ? u : x)) : [...d.users, u],
    });
  };

  const setUserActive = (id: string, active: boolean) => {
    const d = dataRef.current;
    if (!d) return;
    setData({ ...d, users: d.users.map((u) => (u.id === id ? { ...u, active } : u)) });
  };

  const importData = (json: string): { ok: boolean; error?: string } => {
    try {
      const parsed = JSON.parse(json);
      if (!parsed || parsed.version !== 1) return { ok: false, error: 'Not a SwiftPOS backup file.' };
      for (const k of ['products', 'sales', 'returns', 'expenses', 'users']) {
        if (!Array.isArray(parsed[k])) return { ok: false, error: `Backup is missing "${k}".` };
      }
      setData({ ...parsed, currentUserId: null });
      return { ok: true };
    } catch {
      return { ok: false, error: 'Could not parse the file as JSON.' };
    }
  };

  const exportData = (): string => JSON.stringify(dataRef.current, null, 2);

  const resetDemo = () => {
    const fresh = buildSeed();
    setData(fresh);
  };

  return (
    <StoreContext.Provider
      value={{
        loaded,
        data,
        currentUser,
        login,
        logout,
        completeSale,
        processReturn,
        saveProduct,
        adjustStock,
        addExpense,
        saveUser,
        setUserActive,
        importData,
        exportData,
        resetDemo,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}

export function roleAllowed(role: Role | undefined, page: string): boolean {
  if (!role) return false;
  const matrix: Record<string, Role[]> = {
    dashboard: ['admin', 'manager'],
    pos: ['admin', 'manager', 'cashier'],
    returns: ['admin', 'manager', 'cashier'],
    inventory: ['admin', 'manager'],
    reports: ['admin', 'manager'],
    users: ['admin'],
    data: ['admin', 'manager'],
  };
  return (matrix[page] || []).includes(role);
}
