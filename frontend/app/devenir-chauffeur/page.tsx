import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageDevenir } from '@/components/PageDevenir';
import { CHAUFFEUR } from '@/lib/devenir-contenus';
import { paysDuVisiteur } from '@/lib/pays';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('titresPages');
  return { title: `${t('devenirChauffeur')} — ZupDrive`, description: t('devenirChauffeurDescription') };
}

export default async function DevenirChauffeurPage({ searchParams }: { searchParams: Promise<{ pays?: string }> }) {
  const pays = await paysDuVisiteur((await searchParams).pays);
  return <PageDevenir {...CHAUFFEUR[pays]} pays={pays} chemin="/devenir-chauffeur" />;
}
