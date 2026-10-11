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

const DEMO_SUPPLIERS = [
  { name: 'FreshLine Distributors', phone: '+92 300 1112233', email: 'orders@freshline.pk', address: 'Plot 12, Industrial Area', city: 'Lahore', country: 'Pakistan', payment_terms: 'Net 15' },
  { name: 'Metro Foods Wholesale', phone: '+92 321 4455667', email: 'sales@metrofoods.pk', address: 'Main Boulevard, Gulberg', city: 'Lahore', country: 'Pakistan', payment_terms: 'Cash on delivery' },
  { name: 'PakDairy Suppliers', phone: '+92 333 7788990', email: 'info@pakdairy.pk', address: 'Dairy Colony', city: 'Karachi', country: 'Pakistan', payment_terms: 'Net 30' },
  { name: 'Global Beverages Co.', phone: '+1 312 555 0142', email: 'orders@globalbev.com', address: '440 W Randolph St', city: 'Chicago', country: 'USA', payment_terms: 'Net 30' },
  { name: 'HomeCare Essentials Ltd', phone: '+92 345 9900112', email: 'trade@homecare.pk', address: 'S.I.T.E. Area', city: 'Karachi', country: 'Pakistan', payment_terms: 'Net 15' },
];

const DEMO_CUSTOMERS = [
  { name: 'Ahmed Raza', phone: '+92 300 5551234', address: 'House 45, DHA Phase 2, Lahore', credit_limit: 50000 },
  { name: 'Fatima Siddiqui', phone: '+92 321 6667890', address: 'Flat 12-B, Gulshan, Karachi', credit_limit: 25000 },
  { name: 'Bilal Chaudhry', phone: '+92 333 7774567', address: 'Shop 8, Anarkali Bazaar, Lahore', credit_limit: 100000 },
  { name: 'Ayesha Malik', phone: '+92 345 8882345', address: 'Street 7, Model Town, Lahore', credit_limit: 30000 },
  { name: 'Usman Tariq', phone: '+92 300 9996789', address: 'House 112, Bahria Town, Karachi', credit_limit: 75000 },
  { name: 'Sana Iqbal', phone: '+92 321 1113456', address: 'Apartment 5-C, Clifton, Karachi', credit_limit: 20000 },
  { name: 'Imran Sheikh', phone: '+92 333 2227890', address: 'Main Road, Sialkot', credit_limit: 60000 },
  { name: 'Nadia Hussain', phone: '+92 345 3334567', address: 'House 78, Satellite Town, Rawalpindi', credit_limit: 40000 },
  { name: 'Kamran Ali', phone: '+92 300 4448901', address: 'Shop 3, Liberty Market, Lahore', credit_limit: 80000 },
  { name: 'Rabia Anwar', phone: '+92 321 5552345', address: 'Street 15, Johar Town, Lahore', credit_limit: 35000 },
];

const DEMO_EMPLOYEES = [
  { name: 'Hassan Raza', phone: '+92 300 1237890', role: 'cashier', salary_monthly: 45000, hire_date: '2025-11-15' },
  { name: 'Maryam Nawaz', phone: '+92 321 2348901', role: 'cashier', salary_monthly: 42000, hire_date: '2026-02-01' },
  { name: 'Danish Ali', phone: '+92 333 3459012', role: 'staff', salary_monthly: 38000, hire_date: '2026-05-10' },
  { name: 'Saba Qureshi', phone: '+92 345 4560123', role: 'manager', salary_monthly: 75000, hire_date: '2025-08-01' },
];

async function seedSuppliers(bySku) {
  const { count } = await supabase.from('suppliers').select('id', { count: 'exact', head: true });
  if (count && count > 0) {
    console.log(`  suppliers already present (${count}) — skipping`);
    return;
  }
  const { data: sups, error } = await supabase.from('suppliers').insert(DEMO_SUPPLIERS).select('id,name');
  if (error) throw error;
  console.log(`  suppliers: ${sups.length}`);

  // 8 purchase orders: 5 received, 2 ordered, 1 draft
  const rand = mulberry32(4242);
  const skus = Object.keys(bySku);
  const statuses = ['received', 'received', 'received', 'received', 'received', 'ordered', 'ordered', 'draft'];
  let poCount = 0;
  for (let i = 0; i < statuses.length; i++) {
    const sup = sups[i % sups.length];
    const nItems = 3 + Math.floor(rand() * 4);
    const items = [];
    const used = new Set();
    for (let k = 0; k < nItems; k++) {
      const sku = skus[Math.floor(rand() * skus.length)];
      if (used.has(sku)) continue;
      used.add(sku);
      const p = bySku[sku];
      const qty = 10 + Math.floor(rand() * 40);
      items.push({ product_id: p.id, product_name: p.name, qty, unit_cost: round2(p.cost_price * (0.95 + rand() * 0.1)) });
    }
    const subtotal = round2(items.reduce((a, it) => a + it.qty * it.unit_cost, 0));
    const tax = round2(subtotal * 0.05);
    const daysAgo = 5 + Math.floor(rand() * 50);
    const orderDate = new Date();
    orderDate.setDate(orderDate.getDate() - daysAgo);
    const { data: po, error: poErr } = await supabase
      .from('purchase_orders')
      .insert({
        supplier_id: sup.id,
        order_date: orderDate.toISOString().slice(0, 10),
        expected_date: new Date(orderDate.getTime() + 7 * 864e5).toISOString().slice(0, 10),
        status: statuses[i],
        subtotal,
        tax,
        total: round2(subtotal + tax),
        received_at: statuses[i] === 'received' ? orderDate.toISOString() : null,
      })
      .select('id,po_number')
      .single();
    if (poErr) throw poErr;
    const { error: iErr } = await supabase.from('purchase_items').insert(items.map((it) => ({ ...it, po_id: po.id })));
    if (iErr) throw iErr;
    if (statuses[i] === 'received') {
      // mirror receiving: bump stock + log movements
      for (const it of items) {
        const p = bySku[Object.keys(bySku).find((s) => bySku[s].id === it.product_id)];
        const { data: cur } = await supabase.from('products').select('stock_qty').eq('id', it.product_id).single();
        await supabase.from('products').update({ stock_qty: (cur?.stock_qty ?? 0) + it.qty }).eq('id', it.product_id);
        await supabase.from('stock_movements').insert({
          product_id: it.product_id,
          change_qty: it.qty,
          reason: 'purchase',
          ref_id: po.po_number,
        });
      }
    }
    poCount++;
  }
  console.log(`  purchase orders: ${poCount}`);
}

async function seedCustomers() {
  const { count } = await supabase.from('customers').select('id', { count: 'exact', head: true });
  if (count && count > 0) {
    console.log(`  customers already present (${count}) — skipping`);
    return;
  }
  const { data: custs, error } = await supabase.from('customers').insert(DEMO_CUSTOMERS).select('id,name');
  if (error) throw error;
  console.log(`  customers: ${custs.length}`);

  // ledger entries: a few sales on credit + some payments
  const rand = mulberry32(9090);
  let entries = 0;
  for (const c of custs) {
    let bal = 0;
    const nSales = 1 + Math.floor(rand() * 3);
    for (let s = 0; s < nSales; s++) {
      const amt = round2(500 + rand() * 8000);
      bal = round2(bal + amt);
      const d = new Date();
      d.setDate(d.getDate() - Math.floor(rand() * 25));
      await supabase.from('customer_ledger').insert({
        customer_id: c.id,
        occurred_at: d.toISOString(),
        type: 'sale',
        amount: amt,
        balance_after: bal,
        reference: `S-${String(100000 + Math.floor(rand() * 899999))}`,
        notes: 'Credit sale (khata)',
      });
      entries++;
    }
    if (rand() < 0.7 && bal > 0) {
      const pay = round2(Math.min(bal, 500 + rand() * bal * 0.6));
      bal = round2(bal - pay);
      const d = new Date();
      d.setDate(d.getDate() - Math.floor(rand() * 10));
      await supabase.from('customer_ledger').insert({
        customer_id: c.id,
        occurred_at: d.toISOString(),
        type: 'payment',
        amount: -pay,
        balance_after: bal,
        reference: `PAY-${Date.now().toString(36).toUpperCase()}`,
        notes: 'Payment received',
      });
      entries++;
    }
  }
  console.log(`  ledger entries: ${entries}`);
}

async function seedEmployees(adminId) {
  const { count } = await supabase.from('employees').select('id', { count: 'exact', head: true });
  if (count && count > 0) {
    console.log(`  employees already present (${count}) — skipping`);
    return;
  }
  const { data: emps, error } = await supabase.from('employees').insert(DEMO_EMPLOYEES).select('id,name,salary_monthly');
  if (error) throw error;
  console.log(`  employees: ${emps.length}`);

  // 2 months of salary payments (last month + month before)
  const now = new Date();
  const months = [0, 1].map((back) => {
    const d = new Date(now.getFullYear(), now.getMonth() - back - 1, 1);
    return d.toISOString().slice(0, 7);
  });
  let pays = 0;
  for (const e of emps) {
    for (const m of months) {
      const [y, mo] = m.split('-').map(Number);
      const paidDate = new Date(y, mo, 5).toISOString().slice(0, 10);
      const { error: pErr } = await supabase.from('salary_payments').insert({
        employee_id: e.id,
        month: m,
        amount: e.salary_monthly,
        paid_date: paidDate,
        notes: 'Monthly salary',
        created_by: adminId,
      });
      if (pErr && !/duplicate|unique/i.test(pErr.message)) throw pErr;
      if (!pErr) pays++;
    }
  }
  console.log(`  salary payments: ${pays}`);
}

async function main() {
  console.log('Seeding SwiftPOS demo data…');
  const ids = await ensureUsers();
  const catMap = await ensureCategories();
  const { bySku } = await seedProducts(catMap);
  await seedSales(bySku, ids['cashier'], 'Sara Malik');
  await seedExpenses(ids['admin']);
  await seedSuppliers(bySku);
  await seedCustomers();
  await seedEmployees(ids['admin']);
  console.log('\nDone. Demo logins (password: ' + SEED_PASSWORD + '):');
  for (const u of DEMO_USERS) console.log(`  ${u.role.padEnd(8)} ${u.email}`);
}

main().catch((e) => {
  console.error('Seed failed:', e.message || e);
  process.exit(1);
});
