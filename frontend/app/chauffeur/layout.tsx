import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('titresPages');
  return {
    title: `${t('dossierChauffeur')} — ZupDrive`,
    // Espace personnel : rien à indexer.
    robots: { index: false, follow: false },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
