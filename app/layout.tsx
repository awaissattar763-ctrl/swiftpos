import type { Metadata } from 'next';
import './globals.css';
import { StoreProvider } from '@/lib/store';
import Shell from '@/components/Shell';

export const metadata: Metadata = {
  title: 'SwiftPOS — Retail POS System',
  description:
    'SwiftPOS is the developer\u2019s own original portfolio build of a retail point-of-sale system (Next.js + Supabase). SwiftMart General Store is fictional; all figures are demo seed data.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <StoreProvider>
          <Shell>{children}</Shell>
        </StoreProvider>
      </body>
    </html>
  );
}
