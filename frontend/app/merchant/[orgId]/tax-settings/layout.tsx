import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'TVA et taxes — ZupEat' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
