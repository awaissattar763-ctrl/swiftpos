/**
 * SwiftPOS seed script — populates a fresh Supabase project with demo data.
 *
 * Usage:
 *   SUPABASE_URL=https://xyz.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   SEED_PASSWORD=SwiftDemo123! \
 *   node scripts/seed.mjs
 *
 * Requires the service-role key (bypasses RLS). Never commit keys.
 * Safe to re-run: users/profiles/categories/products are upserted; sales and
 * expenses are only seeded when the tables are empty.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SEED_PASSWORD = process.env.SEED_PASSWORD || 'SwiftDemo123!';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round2 = (n) => Math.round(n * 100) / 100;

// sku, name, category, sale_price, cost_price, stock, threshold
const CATALOG = [
  ['1001', 'Basmati Rice 5kg', 'Groceries', 12.99, 9.5, 42, 10],
  ['1002', 'Whole Wheat Flour 10kg', 'Groceries', 9.49, 7.0, 35, 8],
  ['1003', 'Sugar 1kg', 'Groceries', 1.79, 1.2, 120, 25],
  ['1004', 'Sunflower Oil 1L', 'Groceries', 4.29, 3.1, 58, 12],
  ['1005', 'Red Lentils 1kg', 'Groceries', 2.49, 1.7, 64, 15],
  ['1006', 'Chickpeas 1kg', 'Groceries', 2.19, 1.5, 47, 12],
  ['1007', 'Iodized Salt 800g', 'Groceries', 0.99, 0.55, 150, 30],
  ['1008', 'Black Tea 900g', 'Groceries', 7.99, 5.6, 38, 10],
  ['2001', 'Cola 1.5L', 'Beverages', 2.49, 1.6, 96, 24],
  ['2002', 'Orange Juice 1L', 'Beverages', 3.79, 2.6, 44, 12],
  ['2003', 'Mineral Water 1.5L', 'Beverages', 1.29, 0.7, 180, 40],
  ['2004', 'Energy Drink 250ml', 'Beverages', 2.99, 1.9, 72, 18],
  ['3001', 'Whole Milk 1L', 'Dairy & Eggs', 1.89, 1.25, 60, 15],
  ['3002', 'Eggs (dozen)', 'Dairy & Eggs', 3.49, 2.4, 48, 12],
  ['3003', 'Butter 250g', 'Dairy & Eggs', 4.59, 3.2, 33, 8],
  ['3004', 'Yogurt 500g', 'Dairy & Eggs', 2.29, 1.5, 41, 10],
  ['3005', 'Cheese Slices 200g', 'Dairy & Eggs', 3.99, 2.8, 27, 8],
  ['4001', 'Potato Chips 150g', 'Snacks', 2.19, 1.3, 88, 20],
  ['4002', 'Biscuits Family Pack', 'Snacks', 3.29, 2.1, 66, 15],
  ['4003', 'Chocolate Bar 100g', 'Snacks', 1.99, 1.15, 104, 25],
  ['4004', 'Savory Mix 400g', 'Snacks', 2.79, 1.75, 52, 12],
  ['5001', 'Laundry Detergent 1kg', 'Household', 5.49, 3.8, 39, 10],
  ['5002', 'Dish Soap 500ml', 'Household', 2.89, 1.8, 57, 12],
  ['5003', 'Tissue Box 200ct', 'Household', 2.49, 1.55, 74, 15],
  ['6001', 'Shampoo 400ml', 'Personal Care', 5.99, 4.0, 36, 8],
  ['6002', 'Bath Soap Bar', 'Personal Care', 1.49, 0.85, 92, 20],
  ['6003', 'Toothpaste 120g', 'Personal Care', 3.19, 2.0, 68, 15],
];

const DEMO_USERS = [
  { email: 'admin@swiftpos.demo', full_name: 'Ayesha Khan', role: 'admin' },
  { email: 'manager@swiftpos.demo', full_name: 'Bilal Ahmed', role: 'manager' },
  { email: 'cashier@swiftpos.demo', full_name: 'Sara Malik', role: 'cashier' },
];

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

async function ensureUsers() {
  const ids = {};
  for (const u of DEMO_USERS) {
    let userId;
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password: SEED_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: u.full_name },
    });
    if (error) {
      if (/already been registered/i.test(error.message)) {
        const { data: list } = await supabase.auth.admin.listUsers();
        const found = (list?.users || []).find((x) => x.email === u.email);
        if (!found) throw new Error(`User ${u.email} exists but could not be listed.`);
        userId = found.id;
        console.log(`  user exists: ${u.email}`);
      } else {
        throw error;
      }
    } else {
      userId = data.user.id;
      console.log(`  created user: ${u.email}`);
    }
    const { error: pErr } = await supabase.from('profiles').upsert(
      { id: userId, email: u.email, full_name: u.full_name, role: u.role, is_active: true },
      { onConflict: 'id' },
    );
    if (pErr) throw pErr;
    ids[u.role] = userId;
  }
  return ids;
}

async function ensureCategories() {
  const names = [...new Set(CATALOG.map((c) => c[2]))];
  const { error } = await supabase
    .from('categories')
    .upsert(names.map((name) => ({ name })), { onConflict: 'name' });
  if (error) throw error;
  const { data, error: e2 } = await supabase.from('categories').select('id,name');
  if (e2) throw e2;
  const map = {};
  for (const c of data) map[c.name] = c.id;
  console.log(`  categories: ${data.length}`);
  return map;
}

async function seedProducts(catMap) {
  const rand = mulberry32(20261010);
  const soldQty = {};
  const now = new Date();

  // Simulate 30 days of sales to derive realistic stock levels
  for (let d = 29; d >= 0; d--) {
    const day = new Date(now);
    day.setDate(day.getDate() - d);
    const weekendBoost = day.getDay() === 0 || day.getDay() === 6 ? 4 : 0;
    const numSales = 6 + Math.floor(rand() * 10) + weekendBoost;
    for (let s = 0; s < numSales; s++) {
      const lines = 1 + Math.floor(rand() * 4);
      const used = new Set();
      for (let l = 0; l < lines; l++) {
        const idx = Math.floor(rand() * CATALOG.length);
        if (used.has(idx)) continue;
        used.add(idx);
        const sku = CATALOG[idx][0];
        const qty = 1 + Math.floor(rand() * (CATALOG[idx][3] < 3 ? 4 : 2));
        soldQty[sku] = (soldQty[sku] || 0) + qty;
      }
    }
  }

  const forceLow = { 3002: 5, 5001: 6, 1008: 7, 6001: 3, 4003: 18 };

  const rows = CATALOG.map(([sku, name, category, price, cost, stock, threshold]) => {
    let finalStock = Math.max(0, stock - (soldQty[sku] || 0));
    if (forceLow[sku] !== undefined) finalStock = forceLow[sku];
    return {
      sku,
      name,
      category_id: catMap[category],
      sale_price: price,
      cost_price: cost,
      stock_qty: finalStock,
      low_stock_threshold: threshold,
      is_active: true,
    };
  });

  const { error } = await supabase.from('products').upsert(rows, { onConflict: 'sku' });
  if (error) throw error;
  console.log(`  products: ${rows.length}`);

  const { data: prods, error: e2 } = await supabase.from('products').select('*');
  if (e2) throw e2;
  const bySku = {};
  for (const p of prods) bySku[p.sku] = p;
  return { bySku, soldQty };
}

async function seedSales(bySku, cashierId, cashierName) {
  const { count } = await supabase.from('sales').select('id', { count: 'exact', head: true });
  if (count && count > 0) {
    console.log(`  sales already present (${count}) — skipping sales seed`);
    return;
  }

  const rand = mulberry32(20261011);
  const now = new Date();
  const saleRows = [];
  const itemsBySaleIdx = [];

  for (let d = 29; d >= 0; d--) {
    const day = new Date(now);
    day.setDate(day.getDate() - d);
    const weekendBoost = day.getDay() === 0 || day.getDay() === 6 ? 4 : 0;
    const numSales = 6 + Math.floor(rand() * 10) + weekendBoost;
    for (let s = 0; s < numSales; s++) {
      const skus = Object.keys(bySku);
      const lines = 1 + Math.floor(rand() * 4);
      const used = new Set();
      const items = [];
      for (let l = 0; l < lines; l++) {
        const sku = skus[Math.floor(rand() * skus.length)];
        if (used.has(sku)) continue;
        used.add(sku);
        const p = bySku[sku];
        const qty = 1 + Math.floor(rand() * (p.sale_price < 3 ? 4 : 2));
        items.push({
          product_id: p.id,
          product_name: p.name,
          qty,
          unit_price: p.sale_price,
          unit_cost: p.cost_price,
          returned_qty: 0,
        });
      }
      if (!items.length) continue;
      const subtotal = round2(items.reduce((a, i) => a + i.unit_price * i.qty, 0));
      const r = rand();
      const discount_pct = r < 0.08 ? 10 : r < 0.18 ? 5 : 0;
      const discount_amt = round2((subtotal * discount_pct) / 100);
      const tax_amt = round2((subtotal - discount_amt) * 0.05);
      const total = round2(subtotal - discount_amt + tax_amt);
      const tr = rand();
      const tender = tr < 0.5 ? 'cash' : tr < 0.85 ? 'card' : 'digital';
      const saleDate = new Date(day);
      saleDate.setHours(9 + Math.floor(rand() * 12), Math.floor(rand() * 60), 0, 0);
      const cash_tendered = tender === 'cash' ? round2(Math.ceil(total) + (rand() < 0.5 ? 0 : 5)) : null;
      saleRows.push({
        occurred_at: saleDate.toISOString(),
        subtotal,
        discount_pct,
        discount_amt,
        tax_amt,
        total,
        tender,
        cash_tendered,
        change_due: cash_tendered != null ? round2(cash_tendered - total) : null,
        cashier_id: cashierId,
        cashier_name: cashierName,
      });
      itemsBySaleIdx.push(items);
    }
  }

  let inserted = 0;
  for (const c of chunk(saleRows.map((s, i) => ({ s, i })), 200)) {
    const { data, error } = await supabase.from('sales').insert(c.map((x) => x.s)).select('id');
    if (error) throw error;
    const itemRows = [];
    data.forEach((row, j) => {
      const items = itemsBySaleIdx[c[j].i];
      for (const it of items) itemRows.push({ sale_id: row.id, ...it });
    });
    for (const ic of chunk(itemRows, 500)) {
      const { error: ie } = await supabase.from('sale_items').insert(ic);
      if (ie) throw ie;
    }
    inserted += data.length;
  }
  console.log(`  sales: ${inserted}`);

  // One summary stock movement per product for the seeded history
  const { data: prods } = await supabase.from('products').select('id,sku');
  const moves = (prods || [])
    .map((p) => ({ product_id: p.id, change_qty: 0, reason: 'seed', ref_id: 'initial-seed' }))
    .filter(Boolean);
  if (moves.length) {
    const { error } = await supabase.from('stock_movements').insert(moves);
    if (error) throw error;
  }
}

async function seedExpenses(adminId) {
  const { count } = await supabase.from('expenses').select('id', { count: 'exact', head: true });
  if (count && count > 0) {
    console.log(`  expenses already present (${count}) — skipping expenses seed`);
    return;
  }
  const rand = mulberry32(77);
  const now = new Date();
  const rows = [];
  for (let m = 0; m < 2; m++) {
    const y = now.getFullYear();
    const mo = now.getMonth() - m;
    rows.push({ occurred_at: new Date(y, mo, 1).toISOString(), category: 'Rent', description: 'Store rent', amount: 1200, created_by: adminId });
    rows.push({ occurred_at: new Date(y, mo, 5).toISOString(), category: 'Salaries', description: 'Staff salaries', amount: 2400, created_by: adminId });
    rows.push({ occurred_at: new Date(y, mo, 15).toISOString(), category: 'Utilities', description: 'Electricity + water', amount: round2(150 + rand() * 90), created_by: adminId });
    const n = 2 + Math.floor(rand() * 2);
    for (let k = 0; k < n; k++) {
      rows.push({
        occurred_at: new Date(y, mo, 3 + Math.floor(rand() * 24)).toISOString(),
        category: 'Supplies',
        description: ['Shopping bags', 'Receipt rolls', 'Cleaning supplies'][Math.floor(rand() * 3)],
        amount: round2(40 + rand() * 200),
        created_by: adminId,
      });
    }
  }
  const { error } = await supabase.from('expenses').insert(rows);
  if (error) throw error;
  console.log(`  expenses: ${rows.length}`);
}

async function main() {
  console.log('Seeding SwiftPOS demo data…');
  const ids = await ensureUsers();
  const catMap = await ensureCategories();
  const { bySku } = await seedProducts(catMap);
  await seedSales(bySku, ids['cashier'], 'Sara Malik');
  await seedExpenses(ids['admin']);
  console.log('\nDone. Demo logins (password: ' + SEED_PASSWORD + '):');
  for (const u of DEMO_USERS) console.log(`  ${u.role.padEnd(8)} ${u.email}`);
}

main().catch((e) => {
  console.error('Seed failed:', e.message || e);
  process.exit(1);
});
