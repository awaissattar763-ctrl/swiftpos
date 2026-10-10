import {
  DemoUser,
  Expense,
  Product,
  ReturnRecord,
  Sale,
  SaleItem,
  StoreData,
  Tender,
} from './types';

/** Deterministic PRNG so seeded demo data is stable. */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// sku, name, category, price, cost, stock, low-stock threshold
const CATALOG: [string, string, string, number, number, number, number][] = [
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

const CASHIERS = ['Sara Malik', 'Usman Tariq'];
const TAX_RATE = 0.05;

export function buildSeed(): StoreData {
  const rand = mulberry32(20261010);

  const products: Product[] = CATALOG.map(([sku, name, category, price, cost, stock, threshold], i) => ({
    id: `p${String(i + 1).padStart(2, '0')}`,
    sku,
    name,
    category,
    price,
    cost,
    stock,
    threshold,
  }));

  const soldQty: Record<string, number> = {};
  const sales: Sale[] = [];
  let saleSeq = 0;

  const now = new Date();

  for (let d = 89; d >= 0; d--) {
    const day = new Date(now);
    day.setDate(day.getDate() - d);
    // Weekends are busier
    const weekendBoost = day.getDay() === 0 || day.getDay() === 6 ? 6 : 0;
    const numSales = 8 + Math.floor(rand() * 14) + weekendBoost;

    for (let s = 0; s < numSales; s++) {
      saleSeq += 1;
      const lineCount = 1 + Math.floor(rand() * 5);
      const used = new Set<string>();
      const items: SaleItem[] = [];

      for (let l = 0; l < lineCount; l++) {
        const p = products[Math.floor(rand() * products.length)];
        if (used.has(p.id)) continue;
        used.add(p.id);
        // Popular items sell more
        const qty = 1 + Math.floor(rand() * (p.price < 3 ? 4 : 2));
        items.push({
          productId: p.id,
          name: p.name,
          qty,
          price: p.price,
          cost: p.cost,
          returnedQty: 0,
        });
        soldQty[p.id] = (soldQty[p.id] || 0) + qty;
      }
      if (items.length === 0) continue;

      const subtotal = round2(items.reduce((a, i) => a + i.price * i.qty, 0));
      const r = rand();
      const discountPct = r < 0.08 ? 10 : r < 0.18 ? 5 : 0;
      const discountAmt = round2((subtotal * discountPct) / 100);
      const taxAmt = round2((subtotal - discountAmt) * TAX_RATE);
      const total = round2(subtotal - discountAmt + taxAmt);

      const tr = rand();
      const tender: Tender = tr < 0.5 ? 'cash' : tr < 0.85 ? 'card' : 'digital';

      const saleDate = new Date(day);
      saleDate.setHours(9 + Math.floor(rand() * 12), Math.floor(rand() * 60), 0, 0);

      const cashTendered = tender === 'cash' ? round2(Math.ceil(total) + (rand() < 0.5 ? 0 : 5)) : undefined;

      sales.push({
        id: `S-${String(saleSeq).padStart(6, '0')}`,
        date: saleDate.toISOString(),
        items,
        subtotal,
        discountPct,
        discountAmt,
        taxAmt,
        total,
        tender,
        cashier: CASHIERS[Math.floor(rand() * CASHIERS.length)],
        cashTendered,
        change: cashTendered !== undefined ? round2(cashTendered - total) : undefined,
      });
    }
  }

  // Apply sold quantities to stock, then force a few low-stock situations for the demo
  for (const p of products) {
    p.stock = Math.max(0, p.stock - (soldQty[p.id] || 0));
  }
  const forceLow: Record<string, number> = {
    p14: 5, // Eggs
    p22: 6, // Detergent
    p08: 7, // Tea
    p25: 3, // Shampoo
    p20: 18, // Chocolate (threshold 25)
  };
  for (const p of products) {
    if (forceLow[p.id] !== undefined) p.stock = forceLow[p.id];
  }

  // Seed two returns against recent sales so the Returns screen has history
  const returns: ReturnRecord[] = [];
  const recentSales = sales.slice(-12);
  const returnTargets = [recentSales[2], recentSales[7]].filter(Boolean);
  returnTargets.forEach((sale, idx) => {
    const line = sale.items[0];
    const qty = 1;
    line.returnedQty += qty;
    const prod = products.find((p) => p.id === line.productId);
    if (prod) prod.stock += qty;
    returns.push({
      id: `R-${String(idx + 1).padStart(4, '0')}`,
      date: new Date(new Date(sale.date).getTime() + 26 * 3600 * 1000).toISOString(),
      saleId: sale.id,
      items: [{ productId: line.productId, name: line.name, qty, price: line.price }],
      refundTotal: round2(line.price * qty),
      reason: idx === 0 ? 'Damaged packaging' : 'Customer changed mind',
      cashier: sale.cashier,
    });
  });

  // Seed expenses for the last 3 months
  const expenses: Expense[] = [];
  let expSeq = 0;
  const addExp = (date: Date, category: string, description: string, amount: number) => {
    expSeq += 1;
    expenses.push({
      id: `E-${String(expSeq).padStart(4, '0')}`,
      date: date.toISOString(),
      category,
      description,
      amount: round2(amount),
    });
  };
  for (let m = 0; m < 3; m++) {
    const base = new Date(now.getFullYear(), now.getMonth() - m, 1);
    addExp(new Date(base.getFullYear(), base.getMonth(), 1), 'Rent', 'Store rent', 1200);
    addExp(new Date(base.getFullYear(), base.getMonth(), 5), 'Salaries', 'Staff salaries', 2400);
    addExp(
      new Date(base.getFullYear(), base.getMonth(), 15),
      'Utilities',
      'Electricity + water',
      round2(150 + rand() * 90),
    );
    const supplyCount = 2 + Math.floor(rand() * 3);
    for (let k = 0; k < supplyCount; k++) {
      addExp(
        new Date(base.getFullYear(), base.getMonth(), 3 + Math.floor(rand() * 24)),
        'Supplies',
        ['Shopping bags', 'Receipt rolls', 'Cleaning supplies', 'Price labels'][Math.floor(rand() * 4)],
        round2(40 + rand() * 240),
      );
    }
  }

  const users: DemoUser[] = [
    { id: 'u1', name: 'Ayesha Khan', role: 'admin', active: true },
    { id: 'u2', name: 'Bilal Ahmed', role: 'manager', active: true },
    { id: 'u3', name: 'Sara Malik', role: 'cashier', active: true },
    { id: 'u4', name: 'Usman Tariq', role: 'cashier', active: true },
  ];

  return {
    version: 1,
    products,
    sales,
    returns,
    expenses,
    users,
    currentUserId: null,
    taxRate: TAX_RATE,
  };
}
