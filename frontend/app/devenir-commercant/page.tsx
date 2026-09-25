import type { Metadata } from 'next';
import { PageDevenir } from '@/components/PageDevenir';
import { COMMERCANT } from '@/lib/devenir-contenus';
import { paysDuVisiteur } from '@/lib/pays';

export const metadata: Metadata = {
  title: 'Devenir commerçant — Zupone',
  description: 'Mettez votre commerce en ligne et recevez des commandes livrées.',
};

export default function DevenirCommercantPage({ searchParams }: { searchParams: { pays?: string } }) {
  const pays = paysDuVisiteur(searchParams.pays);
  return <PageDevenir {...COMMERCANT[pays]} pays={pays} chemin="/devenir-commercant" />;
}
