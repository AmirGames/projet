import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Commandes — ZupEat' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
