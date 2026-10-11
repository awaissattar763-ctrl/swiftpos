'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
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
import { getSupabase, isNetworkError, isSupabaseConfigured } from './supabase';

const OUTBOX_KEY = 'swiftpos-outbox-v1';

export interface NewSaleInput {
  lines: { productId: string; qty: number }[];
  discountPct: number;
  tender: Tender;
  cashTendered?: number;
  cashier: string;
  customerId?: string;
  customerName?: string;
}

export interface NewReturnInput {
  saleId: string;
  lines: { productId: string; qty: number }[];
  reason: string;
  cashier: string;
}

interface QueuedSale extends NewSaleInput {
  queuedAt: string;
  cashierId: string;
}

interface StoreContextValue {
  loaded: boolean;
  configured: boolean;
  online: boolean;
  pendingSync: number;
  data: StoreData | null;
  currentUser: DemoUser | null;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  completeSale: (
    input: NewSaleInput,
  ) => Promise<{ sale: Sale | null; queued: boolean; error?: string }>;
  processReturn: (
    input: NewReturnInput,
  ) => Promise<{ record: ReturnRecord } | { error: string }>;
  saveProduct: (p: Product) => Promise<{ error?: string }>;
  adjustStock: (productId: string, delta: number) => Promise<{ error?: string }>;
  addExpense: (e: { date: string; category: string; description: string; amount: number }) => Promise<{ error?: string }>;
  saveUser: (u: DemoUser) => Promise<{ error?: string }>;
  setUserActive: (id: string, active: boolean) => Promise<{ error?: string }>;
  importData: (json: string) => Promise<{ ok: boolean; error?: string }>;
  exportData: () => Promise<string>;
  refresh: () => Promise<void>;
}

const StoreContext = createContext<StoreContextValue | null>(null);

const round2 = (n: number) => Math.round(n * 100) / 100;
const TAX_RATE = 0.05;

// ---------------------------------------------------------------------------
// Row mappers (snake_case DB rows -> camelCase app types)
// ---------------------------------------------------------------------------

function mapProductRow(r: any, catName: string): Product {
  return {
    id: r.id,
    sku: r.sku,
    name: r.name,
    category: catName,
    price: Number(r.sale_price),
    cost: Number(r.cost_price),
    stock: r.stock_qty,
    threshold: r.low_stock_threshold,
  };
}

function mapSaleRow(s: any, items: any[]): Sale {
  return {
    id: s.id,
    date: s.occurred_at,
    items: items.map((i) => ({
      productId: i.product_id,
      name: i.product_name,
      qty: i.qty,
      price: Number(i.unit_price),
      cost: Number(i.unit_cost),
      returnedQty: i.returned_qty,
    })),
    subtotal: Number(s.subtotal),
    discountPct: Number(s.discount_pct),
    discountAmt: Number(s.discount_amt),
    taxAmt: Number(s.tax_amt),
    total: Number(s.total),
    tender: s.tender,
    cashier: s.cashier_name,
    cashTendered: s.cash_tendered != null ? Number(s.cash_tendered) : undefined,
    change: s.change_due != null ? Number(s.change_due) : undefined,
  };
}

function mapReturnRow(r: any, items: any[]): ReturnRecord {
  return {
    id: r.id,
    date: r.occurred_at,
    saleId: r.sale_id,
    items: items.map((i) => ({
      productId: i.product_id,
      name: i.product_name,
      qty: i.qty,
      price: Number(i.unit_price),
    })),
    refundTotal: Number(r.refund_total),
    reason: r.reason,
    cashier: r.cashier_name,
  };
}

function mapExpenseRow(e: any): Expense {
  return {
    id: e.id,
    date: e.occurred_at,
    category: e.category,
    description: e.description,
    amount: Number(e.amount),
  };
}

function mapProfileRow(p: any): DemoUser {
  return { id: p.id, name: p.full_name, email: p.email || '', role: p.role, active: p.is_active };
}

// ---------------------------------------------------------------------------
// Outbox helpers (localStorage queue for offline sales)
// ---------------------------------------------------------------------------

function readOutbox(): QueuedSale[] {
  try {
    const raw = window.localStorage.getItem(OUTBOX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeOutbox(q: QueuedSale[]) {
  try {
    window.localStorage.setItem(OUTBOX_KEY, JSON.stringify(q));
  } catch {
    // ignore — demo continues in memory
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [configured] = useState(() => isSupabaseConfigured());
  const [online, setOnline] = useState(true);
  const [pendingSync, setPendingSync] = useState(0);
  const [data, setData] = useState<StoreData | null>(null);
  const [currentUser, setCurrentUser] = useState<DemoUser | null>(null);
  const dataRef = useRef<StoreData | null>(null);
  dataRef.current = data;
  const userRef = useRef<DemoUser | null>(null);
  userRef.current = currentUser;

  const fetchAll = useCallback(async (): Promise<StoreData | null> => {
    const sb = getSupabase();

    const { data: catRows, error: catErr } = await sb.from('categories').select('id,name');
    if (catErr) throw catErr;
    const catName = new Map((catRows || []).map((c: any) => [c.id, c.name]));

    const { data: prodRows, error: prodErr } = await sb
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('name');
    if (prodErr) throw prodErr;

    const { data: saleRows, error: saleErr } = await sb
      .from('sales')
      .select('*')
      .order('occurred_at', { ascending: false })
      .limit(2000);
    if (saleErr) throw saleErr;

    const saleIds = (saleRows || []).map((s: any) => s.id);
    let itemRows: any[] = [];
    for (let i = 0; i < saleIds.length; i += 500) {
      const { data: chunk, error } = await sb
        .from('sale_items')
        .select('*')
        .in('sale_id', saleIds.slice(i, i + 500));
      if (error) throw error;
      itemRows = itemRows.concat(chunk || []);
    }
    const itemsBySale = new Map<string, any[]>();
    for (const it of itemRows) {
      const arr = itemsBySale.get(it.sale_id) || [];
      arr.push(it);
      itemsBySale.set(it.sale_id, arr);
    }

    const { data: retRows, error: retErr } = await sb
      .from('returns')
      .select('*')
      .order('occurred_at', { ascending: false })
      .limit(500);
    if (retErr) throw retErr;
    const retIds = (retRows || []).map((r: any) => r.id);
    let retItemRows: any[] = [];
    if (retIds.length) {
      const { data: chunk, error } = await sb.from('return_items').select('*').in('return_id', retIds);
      if (error) throw error;
      retItemRows = chunk || [];
    }
    const itemsByReturn = new Map<string, any[]>();
    for (const it of retItemRows) {
      const arr = itemsByReturn.get(it.return_id) || [];
      arr.push(it);
      itemsByReturn.set(it.return_id, arr);
    }

    const { data: expRows, error: expErr } = await sb
      .from('expenses')
      .select('*')
      .order('occurred_at', { ascending: false })
      .limit(1000);
    if (expErr && !/permission|policy|denied/i.test(expErr.message)) throw expErr;

    // Users: admins see all profiles; others see only their own (RLS)
    const { data: userRows } = await sb.from('profiles').select('*').order('full_name');

    return {
      version: 1,
      products: (prodRows || []).map((r: any) => mapProductRow(r, catName.get(r.category_id) || 'Uncategorized')),
      sales: (saleRows || []).map((s: any) => mapSaleRow(s, itemsBySale.get(s.id) || [])),
      returns: (retRows || []).map((r: any) => mapReturnRow(r, itemsByReturn.get(r.id) || [])),
      expenses: (expRows || []).map(mapExpenseRow),
      users: (userRows || []).map(mapProfileRow),
      currentUserId: userRef.current?.id ?? null,
      taxRate: TAX_RATE,
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    try {
      const d = await fetchAll();
      if (d) setData(d);
    } catch (e) {
      console.error('refresh failed', e);
    }
  }, [fetchAll]);

  const loadProfile = useCallback(async (userId: string): Promise<DemoUser | null> => {
    const sb = getSupabase();
    const { data: row, error } = await sb.from('profiles').select('*').eq('id', userId).single();
    if (error || !row) return null;
    const u = mapProfileRow(row);
    if (!u.active) return null;
    return u;
  }, []);

  // ---- offline outbox flush ----
  const flushOutbox = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    const queue = readOutbox();
    if (!queue.length) {
      setPendingSync(0);
      return;
    }
    const remaining: QueuedSale[] = [];
    for (const q of queue) {
      const res = await insertSaleRemote(q, q.cashierId);
      if (!res.ok) {
        if (res.network) remaining.push(q);
        else {
          // Permanent failure — drop with a console note rather than looping forever
          console.error('Dropping unsyncable sale:', res.error);
        }
      }
    }
    writeOutbox(remaining);
    setPendingSync(remaining.length);
    if (remaining.length < queue.length) await refresh();
  }, [refresh]);

  // ---- init: auth state, online listeners, outbox ----
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoaded(true);
      return;
    }
    const sb = getSupabase();
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine);
    setPendingSync(readOutbox().length);

    const init = async () => {
      const { data: sess } = await sb.auth.getSession();
      if (sess.session?.user) {
        const u = await loadProfile(sess.session.user.id);
        if (u) {
          setCurrentUser(u);
          await refresh();
        } else {
          await sb.auth.signOut();
        }
      }
      setLoaded(true);
      flushOutbox();
    };
    init();

    const { data: sub } = sb.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const u = await loadProfile(session.user.id);
        if (u) {
          setCurrentUser(u);
          await refresh();
        } else {
          await sb.auth.signOut();
          setCurrentUser(null);
        }
      } else if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
        setData(null);
      }
    });

    const onOnline = () => {
      setOnline(true);
      flushOutbox();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const timer = setInterval(flushOutbox, 20000);

    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(timer);
    };
  }, [flushOutbox, loadProfile, refresh]);

  // ---- auth actions ----
  const signIn = async (email: string, password: string): Promise<{ error?: string }> => {
    const sb = getSupabase();
    const { data: sess, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return { error: 'Invalid email or password.' };
    const userId = sess.user?.id;
    if (!userId) return { error: 'Sign-in failed. Try again.' };
    const u = await loadProfile(userId);
    if (!u) {
      await sb.auth.signOut();
      return { error: 'This account is deactivated or has no profile.' };
    }
    setCurrentUser(u);
    await refresh();
    return {};
  };

  const logout = async () => {
    await getSupabase().auth.signOut();
    setCurrentUser(null);
    setData(null);
  };

  // ---- sales ----
  const completeSale = async (
    input: NewSaleInput,
  ): Promise<{ sale: Sale | null; queued: boolean; error?: string }> => {
    const d = dataRef.current;
    const u = userRef.current;
    if (!d || !u) return { sale: null, queued: false, error: 'Store not ready.' };

    const items: SaleItem[] = [];
    for (const line of input.lines) {
      const p = d.products.find((x) => x.id === line.productId);
      if (!p || line.qty <= 0) continue;
      const qty = Math.min(line.qty, p.stock);
      if (qty <= 0) continue;
      items.push({ productId: p.id, name: p.name, qty, price: p.price, cost: p.cost, returnedQty: 0 });
    }
    if (!items.length) return { sale: null, queued: false, error: 'Cart is empty.' };

    const subtotal = round2(items.reduce((a, i) => a + i.price * i.qty, 0));
    const discountPct = Math.min(100, Math.max(0, input.discountPct));
    const discountAmt = round2((subtotal * discountPct) / 100);
    const taxAmt = round2((subtotal - discountAmt) * TAX_RATE);
    const total = round2(subtotal - discountAmt + taxAmt);

    const payload = { ...input, discountPct, cashierId: u.id };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const q = readOutbox();
      q.push({ ...payload, queuedAt: new Date().toISOString() });
      writeOutbox(q);
      setPendingSync(q.length);
      return { sale: localPendingSale(items, subtotal, discountPct, discountAmt, taxAmt, total, input), queued: true };
    }

    const res = await insertSaleRemote(payload, u.id);
    if (!res.ok) {
      if (res.network) {
        const q = readOutbox();
        q.push({ ...payload, queuedAt: new Date().toISOString() });
        writeOutbox(q);
        setPendingSync(q.length);
        return { sale: localPendingSale(items, subtotal, discountPct, discountAmt, taxAmt, total, input), queued: true };
      }
      return { sale: null, queued: false, error: res.error || 'Could not complete the sale.' };
    }
    await refresh();
    return { sale: res.sale!, queued: false };
  };

  const processReturn = async (
    input: NewReturnInput,
  ): Promise<{ record: ReturnRecord } | { error: string }> => {
    const d = dataRef.current;
    const u = userRef.current;
    if (!d || !u) return { error: 'Store not ready.' };
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { error: 'You appear to be offline. Returns need a connection and are not queued.' };
    }
    const sale = d.sales.find((s) => s.id === input.saleId);
    if (!sale) return { error: 'Sale not found.' };

    const sb = getSupabase();
    try {
      const returnItems: { productId: string; name: string; qty: number; price: number }[] = [];
      for (const line of input.lines) {
        const sl = sale.items.find((i) => i.productId === line.productId);
        if (!sl || line.qty <= 0) continue;
        const qty = Math.min(line.qty, sl.qty - sl.returnedQty);
        if (qty <= 0) continue;
        returnItems.push({ productId: sl.productId, name: sl.name, qty, price: sl.price });
      }
      if (!returnItems.length) return { error: 'Nothing to return.' };
      const refundTotal = round2(returnItems.reduce((a, i) => a + i.qty * i.price, 0));

      const { data: retRow, error: rErr } = await sb
        .from('returns')
        .insert({
          sale_id: sale.id,
          refund_total: refundTotal,
          reason: input.reason || 'No reason given',
          cashier_id: u.id,
          cashier_name: input.cashier,
        })
        .select('id,return_number,occurred_at')
        .single();
      if (rErr) throw rErr;

      const { error: riErr } = await sb.from('return_items').insert(
        returnItems.map((i) => ({
          return_id: retRow.id,
          product_id: i.productId,
          product_name: i.name,
          qty: i.qty,
          unit_price: i.price,
        })),
      );
      if (riErr) throw riErr;

      // fetch current sale_items to bump returned_qty
      const { data: sItems, error: siErr } = await sb.from('sale_items').select('*').eq('sale_id', sale.id);
      if (siErr) throw siErr;
      for (const ri of returnItems) {
        const row = (sItems || []).find((x: any) => x.product_id === ri.productId);
        if (!row) continue;
        const { error: uErr } = await sb
          .from('sale_items')
          .update({ returned_qty: row.returned_qty + ri.qty })
          .eq('id', row.id);
        if (uErr) throw uErr;

        const prod = d.products.find((p) => p.id === ri.productId);
        const { error: pErr } = await sb
          .from('products')
          .update({ stock_qty: (prod ? prod.stock : 0) + ri.qty })
          .eq('id', ri.productId);
        if (pErr) throw pErr;
        await sb.from('stock_movements').insert({
          product_id: ri.productId,
          change_qty: ri.qty,
          reason: 'return',
          ref_id: retRow.return_number,
          created_by: u.id,
        });
      }

      await refresh();
      return {
        record: {
          id: retRow.id,
          date: retRow.occurred_at,
          saleId: sale.id,
          items: returnItems,
          refundTotal,
          reason: input.reason,
          cashier: input.cashier,
        },
      };
    } catch (e: any) {
      if (isNetworkError(e)) return { error: 'Network error — return not processed.' };
      return { error: e.message || 'Could not process the return.' };
    }
  };

  // ---- inventory ----
  const ensureCategory = async (name: string): Promise<string | null> => {
    const sb = getSupabase();
    const clean = name.trim() || 'Uncategorized';
    const { data: row, error } = await sb
      .from('categories')
      .upsert({ name: clean }, { onConflict: 'name' })
      .select('id')
      .single();
    if (error) return null;
    return row.id;
  };

  const saveProduct = async (p: Product): Promise<{ error?: string }> => {
    const d = dataRef.current;
    const u = userRef.current;
    if (!d || !u) return { error: 'Store not ready.' };
    if (!p.name.trim()) return { error: 'Product name is required.' };
    if (!p.sku.trim()) return { error: 'SKU is required.' };
    const sb = getSupabase();
    try {
      const category_id = await ensureCategory(p.category);
      if (!category_id) return { error: 'Could not save the category.' };
      const existing = d.products.find((x) => x.id === p.id);
      if (existing) {
        const delta = Math.floor(p.stock) - existing.stock;
        const { error } = await sb
          .from('products')
          .update({
            sku: p.sku.trim(),
            name: p.name.trim(),
            category_id,
            sale_price: p.price,
            cost_price: p.cost,
            stock_qty: Math.max(0, Math.floor(p.stock)),
            low_stock_threshold: Math.max(0, Math.floor(p.threshold)),
          })
          .eq('id', p.id);
        if (error) throw error;
        if (delta !== 0) {
          await sb.from('stock_movements').insert({
            product_id: p.id,
            change_qty: delta,
            reason: 'correction',
            ref_id: null,
            created_by: u.id,
          });
        }
      } else {
        const { error } = await sb.from('products').insert({
          sku: p.sku.trim(),
          name: p.name.trim(),
          category_id,
          sale_price: p.price,
          cost_price: p.cost,
          stock_qty: Math.max(0, Math.floor(p.stock)),
          low_stock_threshold: Math.max(0, Math.floor(p.threshold)),
        });
        if (error) {
          if (/duplicate|unique/i.test(error.message)) return { error: `SKU "${p.sku}" is already in use.` };
          throw error;
        }
      }
      await refresh();
      return {};
    } catch (e: any) {
      return { error: e.message || 'Could not save the product.' };
    }
  };

  const adjustStock = async (productId: string, delta: number): Promise<{ error?: string }> => {
    const d = dataRef.current;
    const u = userRef.current;
    if (!d || !u) return { error: 'Store not ready.' };
    const p = d.products.find((x) => x.id === productId);
    if (!p) return { error: 'Product not found.' };
    const sb = getSupabase();
    try {
      const { error } = await sb
        .from('products')
        .update({ stock_qty: Math.max(0, p.stock + delta) })
        .eq('id', productId);
      if (error) throw error;
      await sb.from('stock_movements').insert({
        product_id: productId,
        change_qty: delta,
        reason: 'adjustment',
        ref_id: null,
        created_by: u.id,
      });
      await refresh();
      return {};
    } catch (e: any) {
      return { error: e.message || 'Could not adjust stock.' };
    }
  };

  // ---- expenses ----
  const addExpense = async (e: {
    date: string;
    category: string;
    description: string;
    amount: number;
  }): Promise<{ error?: string }> => {
    const u = userRef.current;
    if (!u) return { error: 'Store not ready.' };
    try {
      const { error } = await getSupabase().from('expenses').insert({
        occurred_at: new Date(e.date + 'T12:00:00').toISOString(),
        category: e.category,
        description: e.description,
        amount: e.amount,
        created_by: u.id,
      });
      if (error) throw error;
      await refresh();
      return {};
    } catch (err: any) {
      return { error: err.message || 'Could not add the expense.' };
    }
  };

  // ---- users (admin) ----
  const saveUser = async (usr: DemoUser): Promise<{ error?: string }> => {
    try {
      const { error } = await getSupabase()
        .from('profiles')
        .update({ full_name: usr.name.trim(), role: usr.role })
        .eq('id', usr.id);
      if (error) throw error;
      await refresh();
      return {};
    } catch (e: any) {
      return { error: e.message || 'Could not save the user.' };
    }
  };

  const setUserActive = async (id: string, active: boolean): Promise<{ error?: string }> => {
    try {
      const { error } = await getSupabase().from('profiles').update({ is_active: active }).eq('id', id);
      if (error) throw error;
      await refresh();
      return {};
    } catch (e: any) {
      return { error: e.message || 'Could not update the user.' };
    }
  };

  // ---- backup / restore ----
  const exportData = async (): Promise<string> => {
    const sb = getSupabase();
    const [cats, prods, sales, items, rets, ritems, exps] = await Promise.all([
      sb.from('categories').select('*'),
      sb.from('products').select('*'),
      sb.from('sales').select('*').order('occurred_at'),
      sb.from('sale_items').select('*'),
      sb.from('returns').select('*').order('occurred_at'),
      sb.from('return_items').select('*'),
      sb.from('expenses').select('*').order('occurred_at'),
    ]);
    return JSON.stringify(
      {
        version: 1,
        app: 'swiftpos',
        exported_at: new Date().toISOString(),
        categories: cats.data || [],
        products: prods.data || [],
        sales: sales.data || [],
        sale_items: items.data || [],
        returns: rets.data || [],
        return_items: ritems.data || [],
        expenses: exps.data || [],
      },
      null,
      2,
    );
  };

  const importData = async (json: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const parsed = JSON.parse(json);
      if (!parsed || parsed.app !== 'swiftpos' || parsed.version !== 1) {
        return { ok: false, error: 'Not a SwiftPOS backup file.' };
      }
      const sb = getSupabase();
      if (Array.isArray(parsed.categories) && parsed.categories.length) {
        const { error } = await sb
          .from('categories')
          .upsert(parsed.categories.map((c: any) => ({ name: c.name })), { onConflict: 'name' });
        if (error) throw error;
      }
      const { data: catRows } = await sb.from('categories').select('id,name');
      const catId = new Map((catRows || []).map((c: any) => [c.name, c.id]));
      // products need category names — exported rows carry category_id; resolve via exported categories
      const expCats = new Map((parsed.categories || []).map((c: any) => [c.id, c.name]));
      if (Array.isArray(parsed.products) && parsed.products.length) {
        const { error } = await sb.from('products').upsert(
          parsed.products.map((p: any) => ({
            id: p.id,
            sku: p.sku,
            name: p.name,
            category_id: catId.get(expCats.get(p.category_id)) || null,
            cost_price: p.cost_price,
            sale_price: p.sale_price,
            stock_qty: p.stock_qty,
            low_stock_threshold: p.low_stock_threshold,
            is_active: p.is_active,
          })),
          { onConflict: 'sku' },
        );
        if (error) throw error;
      }
      if (Array.isArray(parsed.sales) && parsed.sales.length) {
        const { error } = await sb.from('sales').upsert(
          parsed.sales.map((s: any) => ({
            id: s.id,
            sale_number: s.sale_number,
            occurred_at: s.occurred_at,
            subtotal: s.subtotal,
            discount_pct: s.discount_pct,
            discount_amt: s.discount_amt,
            tax_amt: s.tax_amt,
            total: s.total,
            tender: s.tender,
            cash_tendered: s.cash_tendered,
            change_due: s.change_due,
            cashier_name: s.cashier_name,
          })),
          { onConflict: 'sale_number' },
        );
        if (error) throw error;
        if (Array.isArray(parsed.sale_items) && parsed.sale_items.length) {
          const saleIds = parsed.sales.map((s: any) => s.id);
          await sb.from('sale_items').delete().in('sale_id', saleIds);
          const { error: ie } = await sb.from('sale_items').insert(
            parsed.sale_items.map((i: any) => ({
              sale_id: i.sale_id,
              product_id: i.product_id,
              product_name: i.product_name,
              qty: i.qty,
              unit_price: i.unit_price,
              unit_cost: i.unit_cost,
              returned_qty: i.returned_qty || 0,
            })),
          );
          if (ie) throw ie;
        }
      }
      if (Array.isArray(parsed.returns) && parsed.returns.length) {
        const { error } = await sb.from('returns').upsert(
          parsed.returns.map((r: any) => ({
            id: r.id,
            return_number: r.return_number,
            occurred_at: r.occurred_at,
            sale_id: r.sale_id,
            refund_total: r.refund_total,
            reason: r.reason,
            cashier_name: r.cashier_name,
          })),
          { onConflict: 'return_number' },
        );
        if (error) throw error;
        if (Array.isArray(parsed.return_items) && parsed.return_items.length) {
          const retIds = parsed.returns.map((r: any) => r.id);
          await sb.from('return_items').delete().in('return_id', retIds);
          const { error: ie } = await sb.from('return_items').insert(
            parsed.return_items.map((i: any) => ({
              return_id: i.return_id,
              product_id: i.product_id,
              product_name: i.product_name,
              qty: i.qty,
              unit_price: i.unit_price,
            })),
          );
          if (ie) throw ie;
        }
      }
      if (Array.isArray(parsed.expenses) && parsed.expenses.length) {
        const { error } = await sb.from('expenses').upsert(
          parsed.expenses.map((e: any) => ({
            id: e.id,
            occurred_at: e.occurred_at,
            category: e.category,
            description: e.description,
            amount: e.amount,
          })),
          { onConflict: 'id' },
        );
        if (error) throw error;
      }
      await refresh();
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e.message || 'Restore failed.' };
    }
  };

  return (
    <StoreContext.Provider
      value={{
        loaded,
        configured,
        online,
        pendingSync,
        data,
        currentUser,
        signIn,
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
        refresh,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Remote sale insert (used by completeSale and the outbox flusher)
// ---------------------------------------------------------------------------

async function insertSaleRemote(
  input: NewSaleInput & { cashierId: string },
  cashierId: string,
): Promise<{ ok: boolean; sale?: Sale; error?: string; network?: boolean }> {
  const sb = getSupabase();
  try {
    const { data: prodRows, error: pErr } = await sb.from('products').select('*');
    if (pErr) throw pErr;
    const byId = new Map((prodRows || []).map((p: any) => [p.id, p]));

    const items: SaleItem[] = [];
    for (const line of input.lines) {
      const p = byId.get(line.productId);
      if (!p || line.qty <= 0) continue;
      const qty = Math.min(line.qty, p.stock_qty);
      if (qty <= 0) continue;
      items.push({
        productId: p.id,
        name: p.name,
        qty,
        price: Number(p.sale_price),
        cost: Number(p.cost_price),
        returnedQty: 0,
      });
    }
    if (!items.length) return { ok: false, error: 'All items are out of stock.' };

    const subtotal = round2(items.reduce((a, i) => a + i.price * i.qty, 0));
    const discountPct = Math.min(100, Math.max(0, input.discountPct));
    const discountAmt = round2((subtotal * discountPct) / 100);
    const taxAmt = round2((subtotal - discountAmt) * TAX_RATE);
    const total = round2(subtotal - discountAmt + taxAmt);

    const { data: saleRow, error: sErr } = await sb
      .from('sales')
      .insert({
        subtotal,
        discount_pct: discountPct,
        discount_amt: discountAmt,
        tax_amt: taxAmt,
        total,
        tender: input.tender,
        cash_tendered: input.cashTendered,
        change_due:
          input.cashTendered !== undefined ? round2(input.cashTendered - total) : null,
        cashier_id: cashierId,
        cashier_name: input.cashier,
        customer_id: input.customerId || null,
        customer_name: input.customerName || '',
      })
      .select('id,sale_number,occurred_at')
      .single();
    if (sErr) throw sErr;

    // Credit (khata) sale: append to the customer's ledger
    if (input.customerId) {
      const { data: last } = await sb
        .from('customer_ledger')
        .select('balance_after')
        .eq('customer_id', input.customerId)
        .order('occurred_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const prevBal = Number(last?.balance_after ?? 0);
      await sb.from('customer_ledger').insert({
        customer_id: input.customerId,
        type: 'sale',
        amount: total,
        balance_after: round2(prevBal + total),
        reference: saleRow.sale_number,
        notes: `Credit sale ${saleRow.sale_number}`,
        created_by: cashierId,
      });
    }

    const { error: iErr } = await sb.from('sale_items').insert(
      items.map((i) => ({
        sale_id: saleRow.id,
        product_id: i.productId,
        product_name: i.name,
        qty: i.qty,
        unit_price: i.price,
        unit_cost: i.cost,
        returned_qty: 0,
      })),
    );
    if (iErr) throw iErr;

    for (const i of items) {
      const p = byId.get(i.productId);
      const { error: uErr } = await sb
        .from('products')
        .update({ stock_qty: Math.max(0, p.stock_qty - i.qty) })
        .eq('id', i.productId);
      if (uErr) throw uErr;
      await sb.from('stock_movements').insert({
        product_id: i.productId,
        change_qty: -i.qty,
        reason: 'sale',
        ref_id: saleRow.sale_number,
        created_by: cashierId,
      });
    }

    return {
      ok: true,
      sale: {
        id: saleRow.id,
        date: saleRow.occurred_at,
        items,
        subtotal,
        discountPct,
        discountAmt,
        taxAmt,
        total,
        tender: input.tender,
        cashier: input.cashier,
        cashTendered: input.cashTendered,
        change: input.cashTendered !== undefined ? round2(input.cashTendered - total) : undefined,
      },
    };
  } catch (e: any) {
    if (isNetworkError(e)) return { ok: false, network: true };
    return { ok: false, error: e.message || 'Could not complete the sale.' };
  }
}

function localPendingSale(
  items: SaleItem[],
  subtotal: number,
  discountPct: number,
  discountAmt: number,
  taxAmt: number,
  total: number,
  input: NewSaleInput,
): Sale {
  return {
    id: `pending-${Date.now()}`,
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
    change: input.cashTendered !== undefined ? round2(input.cashTendered - total) : undefined,
  };
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
    suppliers: ['admin', 'manager'],
    customers: ['admin', 'manager', 'cashier'],
    employees: ['admin', 'manager'],
    reports: ['admin', 'manager'],
    users: ['admin'],
    data: ['admin', 'manager'],
  };
  return (matrix[page] || []).includes(role);
}
