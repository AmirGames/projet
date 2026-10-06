import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageDevenir } from '@/components/PageDevenir';
import { VersTableauDeBord } from '@/components/VersTableauDeBord';
import { contenuDevenir } from '@/lib/devenir-contenus';
import { paysDuVisiteur } from '@/lib/pays';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('titresPages');
  return { title: `${t('devenirLivreur')} — ZupEat`, description: t('devenirLivreurDescription') };
}

export default async function DevenirLivreurPage({ searchParams }: { searchParams: Promise<{ pays?: string }> }) {
  const pays = await paysDuVisiteur((await searchParams).pays);
  return (
    <>
      <VersTableauDeBord />
      <PageDevenir {...(await contenuDevenir('livreur', pays))} pays={pays} chemin="/devenir-livreur" />
    </>
  );
}
