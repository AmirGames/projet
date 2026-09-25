import type { Metadata } from 'next';
import { PageDevenir } from '@/components/PageDevenir';
import { LIVREUR } from '@/lib/devenir-contenus';
import { paysDuVisiteur } from '@/lib/pays';

export const metadata: Metadata = {
  title: 'Devenir livreur — Zupone',
  description: 'Livrez les commandes des commerces de proximité, à votre rythme.',
};

export default function DevenirLivreurPage({ searchParams }: { searchParams: { pays?: string } }) {
  const pays = paysDuVisiteur(searchParams.pays);
  return <PageDevenir {...LIVREUR[pays]} pays={pays} chemin="/devenir-livreur" />;
}
