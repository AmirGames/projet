import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

// L'adresse porte un code à usage unique le temps d'un instant : qu'aucune
// requête de la page ne le communique ailleurs, et qu'aucun moteur ne l'indexe.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('titresPages');
  return {
    title: `${t('connexionEnCours')} — ZupEat`,
    referrer: 'no-referrer',
    robots: { index: false, follow: false },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
