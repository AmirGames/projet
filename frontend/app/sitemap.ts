import type { MetadataRoute } from 'next';
import { PAGES_LEGALES } from '@/lib/editeur';
import { adressesRegionales, baseDuSite } from '@/lib/seo-regional';

// Côté serveur, l'API peut avoir une autre adresse que celle vue du navigateur.
const API_URL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const PAGES_FIXES = [
  '/',
  '/restaurants',
  '/devenir-commercant',
  '/devenir-livreur',
  '/devenir-chauffeur',
  ...PAGES_LEGALES.map((page) => page.href),
];

// Relu à chaque demande : un commerce validé doit y entrer sans redéploiement.
export const dynamic = 'force-dynamic';

/**
 * Le plan du site pour les moteurs de recherche : chaque page publique dans
 * chacune de ses régions, avec ses versions sœurs (hreflang). Les vitrines ne
 * figurent que dans les régions du pays de leur commerce.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = await baseDuSite();
  const absolue = (chemin: string) => new URL(chemin, base).toString();

  let boutiques: Array<{ slug: string; countryCode: string | null; updatedAt?: string }> = [];
  try {
    const reponse = await fetch(`${API_URL}/api/client/stores`, { cache: 'no-store' });
    if (reponse.ok) boutiques = (await reponse.json()).data || [];
  } catch {
    // API injoignable : le plan garde au moins les pages fixes.
  }

  const entrees = [
    ...PAGES_FIXES.map((chemin) => ({ chemin, pays: null as string | null, modifie: undefined as string | undefined })),
    ...boutiques.map((b) => ({ chemin: `/store/${b.slug}`, pays: b.countryCode, modifie: b.updatedAt })),
  ];

  return entrees.flatMap(({ chemin, pays, modifie }) =>
    adressesRegionales(chemin, pays).map((version) => ({
      url: absolue(version.chemin),
      ...(modifie && { lastModified: new Date(modifie) }),
      alternates: {
        languages: Object.fromEntries(
          Object.entries(version.langues).map(([langue, cheminSoeur]) => [langue, absolue(cheminSoeur)]),
        ),
      },
    })),
  );
}
