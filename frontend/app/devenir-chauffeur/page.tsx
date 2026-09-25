import type { Metadata } from 'next';
import { PageDevenir } from '@/components/PageDevenir';
import { CHAUFFEUR } from '@/lib/devenir-contenus';
import { paysDuVisiteur } from '@/lib/pays';

export const metadata: Metadata = {
  title: 'Devenir chauffeur VTC — Zupone',
  description: 'Transportez des passagers avec Zupone — bientôt disponible.',
};

export default function DevenirChauffeurPage({ searchParams }: { searchParams: { pays?: string } }) {
  const pays = paysDuVisiteur(searchParams.pays);
  return <PageDevenir {...CHAUFFEUR[pays]} pays={pays} chemin="/devenir-chauffeur" />;
}
