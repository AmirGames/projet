import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Incidents de livraison — ZupEat' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
