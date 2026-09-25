import type { MetadataRoute } from 'next';
import { baseDuSite } from '@/lib/seo-regional';

export const dynamic = 'force-dynamic';

/**
 * Les espaces derrière une connexion n'ont rien à faire dans un moteur de
 * recherche ; le plan du site indique les pages publiques de chaque région.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = await baseDuSite();
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/merchant', '/driver', '/superowner', '/client', '/dashboard', '/checkout', '/track'],
    },
    sitemap: new URL('/sitemap.xml', base).toString(),
  };
}
