import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Clés API — ZupEat' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
