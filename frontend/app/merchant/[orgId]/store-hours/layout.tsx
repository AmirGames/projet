import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Horaires d\'ouverture — ZupEat' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
