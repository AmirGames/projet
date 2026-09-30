import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Tickets de support — ZupEat' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
