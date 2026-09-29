import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Étiquettes produits — ZupEat' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
