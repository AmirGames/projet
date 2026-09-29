import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Commerces près de chez vous — ZupEat' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
