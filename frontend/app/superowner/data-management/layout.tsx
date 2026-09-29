import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Gestion des données — ZupEat' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
