import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageDevenir } from '@/components/PageDevenir';
import { contenuDevenir } from '@/lib/devenir-contenus';
import { paysDuVisiteur } from '@/lib/pays';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('titresPages');
  return { title: `${t('devenirCommercant')} — ZupEat`, description: t('devenirCommercantDescription') };
}

export default async function DevenirCommercantPage({ searchParams }: { searchParams: Promise<{ pays?: string }> }) {
  const pays = await paysDuVisiteur((await searchParams).pays);
  return <PageDevenir {...(await contenuDevenir('commercant', pays))} pays={pays} chemin="/devenir-commercant" />;
}
