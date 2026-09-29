import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Impression de commande — ZupEat' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
