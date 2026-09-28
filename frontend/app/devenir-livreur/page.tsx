import type { Metadata } from 'next';
import { PageDevenir } from '@/components/PageDevenir';
import { VersTableauDeBord } from '@/components/VersTableauDeBord';
import { LIVREUR } from '@/lib/devenir-contenus';
import { paysDuVisiteur } from '@/lib/pays';

export const metadata: Metadata = {
  title: 'Devenir livreur — ZupEat',
  description: 'Livrez les commandes des commerces de proximité, à votre rythme.',
};

export default async function DevenirLivreurPage({ searchParams }: { searchParams: Promise<{ pays?: string }> }) {
  const pays = await paysDuVisiteur((await searchParams).pays);
  return (
    <>
      <VersTableauDeBord />
      <PageDevenir {...LIVREUR[pays]} pays={pays} chemin="/devenir-livreur" />
    </>
  );
}
