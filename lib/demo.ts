// Public demo accounts created by scripts/seed.mjs.
// The password is the seed script's default (SEED_PASSWORD) — whoever runs
// the seed chooses it, and it is shown on the login screen so portfolio
// visitors can try the live demo.
export const DEMO_PASSWORD_HINT = 'SwiftDemo123!';

export const DEMO_ACCOUNTS = [
  {
    email: 'admin@swiftpos.demo',
    role: 'admin',
    name: 'Ayesha Khan',
    desc: 'Full access — users, inventory, reports, backup.',
  },
  {
    email: 'manager@swiftpos.demo',
    role: 'manager',
    name: 'Bilal Ahmed',
    desc: 'Inventory, reports, POS — no user management.',
  },
  {
    email: 'cashier@swiftpos.demo',
    role: 'cashier',
    name: 'Sara Malik',
    desc: 'POS billing and returns only.',
  },
] as const;
