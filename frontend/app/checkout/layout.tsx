import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { MarketplaceFooter } from '@/components/client/MarketplaceFooter';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('titresPages');
  return { title: `${t('paiement')} — ZupEat` };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}<MarketplaceFooter /></>;
}

