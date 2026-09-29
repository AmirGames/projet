import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Pages légales — ZupEat' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
