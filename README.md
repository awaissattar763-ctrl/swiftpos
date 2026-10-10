# SwiftPOS — Retail POS (working build)

SwiftPOS is the developer's own original portfolio build of a complete
retail / departmental-store point-of-sale system: Next.js + TypeScript +
Tailwind CSS frontend, Supabase (PostgreSQL + Auth) backend, statically
exported and hosted on GitHub Pages.

**Honest scope notes**

- SwiftMart General Store is fictional; all products, sales and figures are
  demo seed data created by `scripts/seed.mjs`.
- Cash / Card / Digital are recorded as tender types on each sale.
  **Live payment-gateway processing is out of scope** — tenders are simulated
  records, no real money moves.
- No fake clients, no fake metrics anywhere.

## 1. Create the Supabase project

1. Create a free project at https://supabase.com.
2. Open the SQL editor and run `supabase/schema.sql` (all tables + RLS policies).
3. In **Project Settings → API**, copy the **Project URL** and the
   **anon public** key. (The service-role key stays server-side only —
   it is used just for the seed script, never in the app.)

## 2. Seed demo data

```bash
SUPABASE_URL=https://xyzcompany.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
SEED_PASSWORD=SwiftDemo123! \
node scripts/seed.mjs
```

This creates three demo logins (one per role) and the fictional SwiftMart
catalog, ~30 days of sales history and expenses:

| Role    | Email                  | Password        |
| ------- | ---------------------- | --------------- |
| Admin   | admin@swiftpos.demo    | (SEED_PASSWORD) |
| Manager | manager@swiftpos.demo  | (SEED_PASSWORD) |
| Cashier | cashier@swiftpos.demo  | (SEED_PASSWORD) |

The login screen shows these accounts to portfolio visitors. Re-running the
seed is safe: users, categories and products are upserted; sales/expenses are
only seeded when their tables are empty.

## 3. Build & deploy

```bash
# local dev (needs the two env vars below in .env.local)
npm install
npm run dev

# production static export (env vars are baked in at build time)
NEXT_PUBLIC_SUPABASE_URL=https://xyzcompany.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ... \
npm run build

# deploy ./out/ to GitHub Pages
./deploy.sh
```

Without the two `NEXT_PUBLIC_` variables the build still succeeds, but the
deployed site shows a "Backend not connected" notice instead of the app.

## 4. Role model (UI + RLS)

| Capability              | Cashier | Manager | Admin |
| ----------------------- | ------- | ------- | ----- |
| POS billing, returns    | ✓       | ✓       | ✓     |
| Dashboard, reports      |         | ✓       | ✓     |
| Inventory CRUD, expenses |         | ✓       | ✓     |
| Backup export/import    |         | ✓       | ✓     |
| User roles, activation  |         |         | ✓     |

Row Level Security in `supabase/schema.sql` enforces the same matrix in the
database (`public.current_role()` reads the signed-in user's profile).

## 5. Offline outbox

If the device goes offline mid-sale (or a request fails with a network
error), the completed sale is queued in `localStorage` and a "pending sync"
badge appears in the header. The queue flushes automatically when the
connection returns (online event + every 20 seconds).

Limitation: **only completed sales are queued**. Returns, inventory edits and
expenses require a live connection and fail with a message when offline.

## Project layout

```
app/                Next.js App Router pages (all client-rendered)
components/         Shell (nav/header/footer), charts, access-denied
lib/
  supabase.ts       Supabase client (env-driven, build-safe placeholders)
  store.tsx         Auth + data layer + offline outbox (React context)
  types.ts          Shared TypeScript types
  format.ts         Money/date helpers
supabase/
  schema.sql        Full PostgreSQL schema + RLS (run once)
scripts/
  seed.mjs          Demo users + fictional store seed data
deploy.sh           Rebuild + force-push ./out/ to gh-pages
```

Live demo: https://awaissattar763-ctrl.github.io/swiftpos/
Repo: https://github.com/awaissattar763-ctrl/swiftpos
