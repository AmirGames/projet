import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Dossier d'incident — ZupEat",
  // Données personnelles : jamais indexé.
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
