import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EnTeteClient } from '@/components/EnTeteClient';
import { MarketplaceFooter } from '@/components/client/MarketplaceFooter';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('titresPages');
  return { title: `${t('commercesPresDeChezVous')} — ZupEat` };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <><EnTeteClient />{children}<MarketplaceFooter /></>;
}
