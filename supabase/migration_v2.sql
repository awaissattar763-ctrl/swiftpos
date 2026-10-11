-- ============================================================================
-- SwiftPOS — migration v2: Suppliers & Purchases, Customers & Khata ledger,
-- Employees & Payroll.
--
-- Run this in the Supabase SQL editor AFTER supabase/schema.sql.
-- Idempotent: safe to re-run (IF NOT EXISTS / OR REPLACE / ADD COLUMN IF NOT
-- EXISTS / DROP POLICY IF EXISTS).
-- No secrets in this file.
-- ============================================================================

create extension if not exists "pgcrypto";

-- --------------------------------------------------------------------------
-- 1. SUPPLIERS & PURCHASES
-- --------------------------------------------------------------------------

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  city text not null default '',
  country text not null default '',
  payment_terms text not null default '',
  notes text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence if not exists public.po_seq;

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null unique
    default ('PO-' || lpad(nextval('public.po_seq')::text, 6, '0')),
  supplier_id uuid references public.suppliers (id) on delete set null,
  order_date date not null default current_date,
  expected_date date,
  status text not null default 'draft'
    check (status in ('draft', 'ordered', 'received', 'cancelled')),
  subtotal numeric(12, 2) not null default 0,
  tax numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  notes text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null default '',
  qty integer not null check (qty > 0),
  unit_cost numeric(12, 2) not null default 0
);

-- --------------------------------------------------------------------------
-- 2. CUSTOMERS & KHATA (credit ledger)
-- --------------------------------------------------------------------------

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  credit_limit numeric(12, 2) not null default 0,
  notes text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- amount: positive increases what the customer owes (sale on credit),
-- negative reduces it (payment received). balance_after is a running total.
create table if not exists public.customer_ledger (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  occurred_at timestamptz not null default now(),
  type text not null check (type in ('sale', 'payment', 'adjustment')),
  amount numeric(12, 2) not null,
  balance_after numeric(12, 2) not null,
  reference text not null default '',
  notes text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Link credit sales to a customer (nullable — normal sales unaffected)
alter table public.sales
  add column if not exists customer_id uuid references public.customers (id) on delete set null;
alter table public.sales
  add column if not exists customer_name text not null default '';

-- --------------------------------------------------------------------------
-- 3. EMPLOYEES & PAYROLL
-- --------------------------------------------------------------------------

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete set null,
  name text not null,
  phone text not null default '',
  role text not null default 'staff' check (role in ('cashier', 'manager', 'staff')),
  salary_monthly numeric(12, 2) not null default 0,
  hire_date date not null default current_date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.salary_payments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  month text not null, -- 'YYYY-MM'
  amount numeric(12, 2) not null,
  paid_date date not null default current_date,
  notes text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (employee_id, month)
);

-- --------------------------------------------------------------------------
-- Indexes
-- --------------------------------------------------------------------------

create index if not exists suppliers_name_idx on public.suppliers (name);
create index if not exists po_supplier_idx on public.purchase_orders (supplier_id);
create index if not exists po_status_idx on public.purchase_orders (status);
create index if not exists po_order_date_idx on public.purchase_orders (order_date desc);
create index if not exists purchase_items_po_idx on public.purchase_items (po_id);
create index if not exists customers_name_idx on public.customers (name);
create index if not exists ledger_customer_idx on public.customer_ledger (customer_id, occurred_at desc);
create index if not exists sales_customer_idx on public.sales (customer_id);
create index if not exists employees_name_idx on public.employees (name);
create index if not exists salary_employee_idx on public.salary_payments (employee_id, month desc);

-- --------------------------------------------------------------------------
-- updated_at triggers
-- --------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists suppliers_touch on public.suppliers;
create trigger suppliers_touch
  before update on public.suppliers
  for each row execute function public.touch_updated_at();

drop trigger if exists purchase_orders_touch on public.purchase_orders;
create trigger purchase_orders_touch
  before update on public.purchase_orders
  for each row execute function public.touch_updated_at();

drop trigger if exists customers_touch on public.customers;
create trigger customers_touch
  before update on public.customers
  for each row execute function public.touch_updated_at();

drop trigger if exists employees_touch on public.employees;
create trigger employees_touch
  before update on public.employees
  for each row execute function public.touch_updated_at();

-- --------------------------------------------------------------------------
-- Row Level Security
-- --------------------------------------------------------------------------

alter table public.suppliers enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_items enable row level security;
alter table public.customers enable row level security;
alter table public.customer_ledger enable row level security;
alter table public.employees enable row level security;
alter table public.salary_payments enable row level security;

-- Helper to drop policies idempotently
do $$
declare
  pol text;
  tbl text;
begin
  for tbl, pol in values
    ('suppliers','authenticated read suppliers'),
    ('suppliers','manager+ insert suppliers'),
    ('suppliers','manager+ update suppliers'),
    ('suppliers','admin delete suppliers'),
    ('purchase_orders','authenticated read purchase_orders'),
    ('purchase_orders','manager+ insert purchase_orders'),
    ('purchase_orders','manager+ update purchase_orders'),
    ('purchase_orders','admin delete purchase_orders'),
    ('purchase_items','authenticated read purchase_items'),
    ('purchase_items','manager+ insert purchase_items'),
    ('purchase_items','manager+ update purchase_items'),
    ('purchase_items','admin delete purchase_items'),
    ('customers','authenticated read customers'),
    ('customers','manager+ insert customers'),
    ('customers','manager+ update customers'),
    ('customers','admin delete customers'),
    ('customer_ledger','authenticated read ledger'),
    ('customer_ledger','manager+ insert ledger'),
    ('customer_ledger','admin manage ledger'),
    ('employees','authenticated read employees'),
    ('employees','manager+ insert employees'),
    ('employees','manager+ update employees'),
    ('employees','admin delete employees'),
    ('salary_payments','manager+ read salaries'),
    ('salary_payments','manager+ insert salaries'),
    ('salary_payments','manager+ update salaries'),
    ('salary_payments','admin delete salaries')
  loop
    execute format('drop policy if exists %I on public.%I', pol, tbl);
  end loop;
end $$;

-- suppliers: everyone reads; manager+ writes; admin deletes
create policy "authenticated read suppliers"
  on public.suppliers for select to authenticated using (true);
create policy "manager+ insert suppliers"
  on public.suppliers for insert to authenticated
  with check (public.current_role() in ('manager', 'admin'));
create policy "manager+ update suppliers"
  on public.suppliers for update to authenticated
  using (public.current_role() in ('manager', 'admin'));
create policy "admin delete suppliers"
  on public.suppliers for delete to authenticated
  using (public.current_role() = 'admin');

-- purchase_orders: everyone reads; manager+ writes; admin deletes
create policy "authenticated read purchase_orders"
  on public.purchase_orders for select to authenticated using (true);
create policy "manager+ insert purchase_orders"
  on public.purchase_orders for insert to authenticated
  with check (public.current_role() in ('manager', 'admin'));
create policy "manager+ update purchase_orders"
  on public.purchase_orders for update to authenticated
  using (public.current_role() in ('manager', 'admin'));
create policy "admin delete purchase_orders"
  on public.purchase_orders for delete to authenticated
  using (public.current_role() = 'admin');

-- purchase_items: same shape as purchase_orders
create policy "authenticated read purchase_items"
  on public.purchase_items for select to authenticated using (true);
create policy "manager+ insert purchase_items"
  on public.purchase_items for insert to authenticated
  with check (public.current_role() in ('manager', 'admin'));
create policy "manager+ update purchase_items"
  on public.purchase_items for update to authenticated
  using (public.current_role() in ('manager', 'admin'));
create policy "admin delete purchase_items"
  on public.purchase_items for delete to authenticated
  using (public.current_role() = 'admin');

-- customers: everyone reads (cashiers need them at POS); manager+ writes
create policy "authenticated read customers"
  on public.customers for select to authenticated using (true);
create policy "manager+ insert customers"
  on public.customers for insert to authenticated
  with check (public.current_role() in ('manager', 'admin'));
create policy "manager+ update customers"
  on public.customers for update to authenticated
  using (public.current_role() in ('manager', 'admin'));
create policy "admin delete customers"
  on public.customers for delete to authenticated
  using (public.current_role() = 'admin');

-- customer_ledger: everyone reads; manager+ inserts payments/adjustments;
-- only admin can change history (ledger entries are append-only by design)
create policy "authenticated read ledger"
  on public.customer_ledger for select to authenticated using (true);
create policy "manager+ insert ledger"
  on public.customer_ledger for insert to authenticated
  with check (public.current_role() in ('manager', 'admin'));
create policy "admin manage ledger"
  on public.customer_ledger for update to authenticated
  using (public.current_role() = 'admin');

-- employees: everyone reads; manager+ writes; admin deletes
create policy "authenticated read employees"
  on public.employees for select to authenticated using (true);
create policy "manager+ insert employees"
  on public.employees for insert to authenticated
  with check (public.current_role() in ('manager', 'admin'));
create policy "manager+ update employees"
  on public.employees for update to authenticated
  using (public.current_role() in ('manager', 'admin'));
create policy "admin delete employees"
  on public.employees for delete to authenticated
  using (public.current_role() = 'admin');

-- salary_payments: manager/admin only (sensitive)
create policy "manager+ read salaries"
  on public.salary_payments for select to authenticated
  using (public.current_role() in ('manager', 'admin'));
create policy "manager+ insert salaries"
  on public.salary_payments for insert to authenticated
  with check (public.current_role() in ('manager', 'admin'));
create policy "manager+ update salaries"
  on public.salary_payments for update to authenticated
  using (public.current_role() in ('manager', 'admin'));
create policy "admin delete salaries"
  on public.salary_payments for delete to authenticated
  using (public.current_role() = 'admin');
