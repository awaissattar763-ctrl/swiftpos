-- ============================================================================
-- SwiftPOS — PostgreSQL schema for Supabase
-- Run this in the Supabase SQL editor (fresh project).
-- No secrets in this file. Demo credentials are created by scripts/seed.mjs.
-- ============================================================================

create extension if not exists "pgcrypto";

-- --------------------------------------------------------------------------
-- Tables
-- --------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role text not null default 'cashier' check (role in ('admin', 'manager', 'cashier')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  category_id uuid references public.categories (id) on delete set null,
  cost_price numeric(12, 2) not null default 0,
  sale_price numeric(12, 2) not null default 0,
  stock_qty integer not null default 0,
  low_stock_threshold integer not null default 5,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence public.sale_seq;

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  sale_number text not null unique
    default ('S-' || lpad(nextval('public.sale_seq')::text, 6, '0')),
  occurred_at timestamptz not null default now(),
  subtotal numeric(12, 2) not null,
  discount_pct numeric(5, 2) not null default 0,
  discount_amt numeric(12, 2) not null default 0,
  tax_amt numeric(12, 2) not null default 0,
  total numeric(12, 2) not null,
  tender text not null check (tender in ('cash', 'card', 'digital')),
  cash_tendered numeric(12, 2),
  change_due numeric(12, 2),
  cashier_id uuid references public.profiles (id) on delete set null,
  cashier_name text not null default '',
  created_at timestamptz not null default now()
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  qty integer not null check (qty > 0),
  unit_price numeric(12, 2) not null,
  unit_cost numeric(12, 2) not null,
  returned_qty integer not null default 0
);

create sequence public.return_seq;

create table public.returns (
  id uuid primary key default gen_random_uuid(),
  return_number text not null unique
    default ('R-' || lpad(nextval('public.return_seq')::text, 6, '0')),
  occurred_at timestamptz not null default now(),
  sale_id uuid references public.sales (id) on delete set null,
  refund_total numeric(12, 2) not null,
  reason text not null default '',
  cashier_id uuid references public.profiles (id) on delete set null,
  cashier_name text not null default '',
  created_at timestamptz not null default now()
);

create table public.return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.returns (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  qty integer not null check (qty > 0),
  unit_price numeric(12, 2) not null
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  category text not null,
  description text not null default '',
  amount numeric(12, 2) not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products (id) on delete set null,
  change_qty integer not null,
  reason text not null,
  ref_id text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- Indexes
-- --------------------------------------------------------------------------

create index products_sku_idx on public.products (sku);
create index products_category_idx on public.products (category_id);
create index sales_occurred_idx on public.sales (occurred_at desc);
create index sale_items_sale_idx on public.sale_items (sale_id);
create index returns_occurred_idx on public.returns (occurred_at desc);
create index return_items_return_idx on public.return_items (return_id);
create index expenses_occurred_idx on public.expenses (occurred_at desc);
create index stock_movements_product_idx on public.stock_movements (product_id);

-- --------------------------------------------------------------------------
-- Triggers
-- --------------------------------------------------------------------------

-- Keep products.updated_at fresh
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger products_touch
  before update on public.products
  for each row execute function public.touch_updated_at();

-- Auto-create a cashier profile for every new auth user
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'cashier'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --------------------------------------------------------------------------
-- Role helper (security definer so RLS policies don't recurse on profiles)
-- --------------------------------------------------------------------------

create or replace function public.current_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

-- --------------------------------------------------------------------------
-- Row Level Security
-- --------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.returns enable row level security;
alter table public.return_items enable row level security;
alter table public.expenses enable row level security;
alter table public.stock_movements enable row level security;

-- profiles: read own (or all as admin); only admins update; inserts via trigger/service role
create policy "profiles readable"
  on public.profiles for select to authenticated
  using (auth.uid() = id or public.current_role() = 'admin');

create policy "admins update profiles"
  on public.profiles for update to authenticated
  using (public.current_role() = 'admin');

-- categories
create policy "authenticated read categories"
  on public.categories for select to authenticated using (true);

create policy "manager+ insert categories"
  on public.categories for insert to authenticated
  with check (public.current_role() in ('manager', 'admin'));

create policy "manager+ update categories"
  on public.categories for update to authenticated
  using (public.current_role() in ('manager', 'admin'));

create policy "admin delete categories"
  on public.categories for delete to authenticated
  using (public.current_role() = 'admin');

-- products: everyone reads; manager+ writes; only admin deletes
create policy "authenticated read products"
  on public.products for select to authenticated using (true);

create policy "manager+ insert products"
  on public.products for insert to authenticated
  with check (public.current_role() in ('manager', 'admin'));

create policy "manager+ update products"
  on public.products for update to authenticated
  using (public.current_role() in ('manager', 'admin'));

create policy "admin delete products"
  on public.products for delete to authenticated
  using (public.current_role() = 'admin');

-- sales: cashiers see their own; manager/admin see all; anyone signed in can ring a sale
create policy "sales readable by role"
  on public.sales for select to authenticated
  using (
    public.current_role() in ('admin', 'manager')
    or cashier_id = auth.uid()
  );

create policy "authenticated insert sales"
  on public.sales for insert to authenticated
  with check (
    cashier_id = auth.uid()
    or public.current_role() in ('manager', 'admin')
  );

create policy "admin update sales"
  on public.sales for update to authenticated
  using (public.current_role() = 'admin');

create policy "admin delete sales"
  on public.sales for delete to authenticated
  using (public.current_role() = 'admin');

-- sale_items
create policy "authenticated read sale_items"
  on public.sale_items for select to authenticated using (true);

create policy "authenticated insert sale_items"
  on public.sale_items for insert to authenticated with check (true);

create policy "admin update sale_items"
  on public.sale_items for update to authenticated
  using (public.current_role() = 'admin');

create policy "admin delete sale_items"
  on public.sale_items for delete to authenticated
  using (public.current_role() = 'admin');

-- returns
create policy "returns readable by role"
  on public.returns for select to authenticated
  using (
    public.current_role() in ('admin', 'manager')
    or cashier_id = auth.uid()
  );

create policy "authenticated insert returns"
  on public.returns for insert to authenticated with check (true);

create policy "admin update returns"
  on public.returns for update to authenticated
  using (public.current_role() = 'admin');

create policy "admin delete returns"
  on public.returns for delete to authenticated
  using (public.current_role() = 'admin');

-- return_items
create policy "authenticated read return_items"
  on public.return_items for select to authenticated using (true);

create policy "authenticated insert return_items"
  on public.return_items for insert to authenticated with check (true);

create policy "admin manage return_items"
  on public.return_items for update to authenticated
  using (public.current_role() = 'admin');

create policy "admin delete return_items"
  on public.return_items for delete to authenticated
  using (public.current_role() = 'admin');

-- expenses: manager/admin only
create policy "manager+ read expenses"
  on public.expenses for select to authenticated
  using (public.current_role() in ('manager', 'admin'));

create policy "manager+ insert expenses"
  on public.expenses for insert to authenticated
  with check (public.current_role() in ('manager', 'admin'));

create policy "manager+ update expenses"
  on public.expenses for update to authenticated
  using (public.current_role() in ('manager', 'admin'));

create policy "admin delete expenses"
  on public.expenses for delete to authenticated
  using (public.current_role() = 'admin');

-- stock_movements: manager/admin read; anyone signed in can log movements
create policy "manager+ read movements"
  on public.stock_movements for select to authenticated
  using (public.current_role() in ('manager', 'admin'));

create policy "authenticated insert movements"
  on public.stock_movements for insert to authenticated with check (true);
