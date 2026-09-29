import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Audit de sécurité — ZupEat' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
