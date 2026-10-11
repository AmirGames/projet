import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { espaceDuDomaine } from '@/lib/domaines';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('titresPages');
  const entetes = await headers();
  const hote = entetes.get('x-forwarded-host') || entetes.get('host') || '';
  const espace = espaceDuDomaine(hote);
  const marque = espace === 'groupe' || espace === 'vitrine'
    ? 'ZupOne'
    : espace === 'drive' || espace === 'chauffeur'
      ? 'ZupDrive'
      : 'ZupEat';
  return { title: `${t('connexion')} — ${marque}` };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}


