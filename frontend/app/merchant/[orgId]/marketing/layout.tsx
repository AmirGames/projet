import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Marketing — ZupEat' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
