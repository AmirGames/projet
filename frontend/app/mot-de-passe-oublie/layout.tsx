import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('titresPages');
  return { title: `${t('motDePasseOublie')} — ZupOne` };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

