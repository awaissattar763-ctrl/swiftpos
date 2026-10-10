export type Role = 'admin' | 'manager' | 'cashier';
export type Tender = 'cash' | 'card' | 'digital';

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  price: number; // selling price per unit
  cost: number; // unit cost (for profit reports)
  stock: number;
  threshold: number; // low-stock alert threshold
}

export interface SaleItem {
  productId: string;
  name: string;
  qty: number;
  price: number;
  cost: number;
  returnedQty: number;
}

export interface Sale {
  id: string;
  date: string; // ISO string
  items: SaleItem[];
  subtotal: number;
  discountPct: number;
  discountAmt: number;
  taxAmt: number;
  total: number;
  tender: Tender;
  cashier: string;
  cashTendered?: number;
  change?: number;
}

export interface ReturnItem {
  productId: string;
  name: string;
  qty: number;
  price: number;
}

export interface ReturnRecord {
  id: string;
  date: string;
  saleId: string;
  items: ReturnItem[];
  refundTotal: number;
  reason: string;
  cashier: string;
}

export interface Expense {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
}

export interface DemoUser {
  id: string;
  name: string;
  role: Role;
  active: boolean;
}

export interface StoreData {
  version: 1;
  products: Product[];
  sales: Sale[];
  returns: ReturnRecord[];
  expenses: Expense[];
  users: DemoUser[];
  currentUserId: string | null;
  taxRate: number;
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  manager: 'Manager',
  cashier: 'Cashier',
};

export const TENDER_LABEL: Record<Tender, string> = {
  cash: 'Cash',
  card: 'Card',
  digital: 'Digital',
};
