import type { Metadata } from 'next';
import '../styles/reset.css';
import styles from './layout.module.css';
import Header from '@/components/Header/Header';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'True AML - Anti-Money Laundering Service',
  description: 'True AML service for TRON blockchain',
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className={styles.container}>
          <Header />
          <main className={styles.main}>{children}</main>
        </div>
      </body>
    </html>
  );
}

