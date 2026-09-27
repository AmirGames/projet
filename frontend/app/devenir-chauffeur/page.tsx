import type { Metadata } from 'next';
import { PageDevenir } from '@/components/PageDevenir';
import { CHAUFFEUR } from '@/lib/devenir-contenus';
import { paysDuVisiteur } from '@/lib/pays';

export const metadata: Metadata = {
  title: 'Devenir chauffeur VTC — ZupDrive',
  description: 'Transportez des passagers avec ZupDrive — bientôt disponible.',
};

export default async function DevenirChauffeurPage({ searchParams }: { searchParams: Promise<{ pays?: string }> }) {
  const pays = await paysDuVisiteur((await searchParams).pays);
  return <PageDevenir {...CHAUFFEUR[pays]} pays={pays} chemin="/devenir-chauffeur" />;
}
