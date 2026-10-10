import type { Metadata } from 'next';
import './globals.css';
import { StoreProvider } from '@/lib/store';
import Shell from '@/components/Shell';

export const metadata: Metadata = {
  title: 'SwiftPOS — Retail POS Concept Demo',
  description:
    'SwiftPOS is a concept demo of a retail point-of-sale system. Fictional seed data, simulated checkout, no real payments.',
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
