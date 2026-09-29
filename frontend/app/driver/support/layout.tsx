import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Aide livreur — ZupEat' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
