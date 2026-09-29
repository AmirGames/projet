import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Journaux d\'accès — ZupEat' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
