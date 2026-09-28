import type { MetadataRoute } from 'next';
import { PAGES_LEGALES } from '@/lib/editeur';
import { adressesRegionales, baseDuSite } from '@/lib/seo-regional';
import { espaceDuChemin, espaceDuDomaine } from '@/lib/domaines';
import { estCheminRegional } from '@/i18n/chemins-regionaux';

// Côté serveur, l'API peut avoir une autre adresse que celle vue du navigateur.
const API_URL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const PAGES_FIXES = [
  '/',
  '/devenir-commercant',
  '/devenir-livreur',
  '/devenir-chauffeur',
  ...PAGES_LEGALES.map((page) => page.href),
];

/**
 * Les pages que ce domaine sert lui-même.
 *
 * Chaque domaine a son plan : zupeat.com y listait les pages « Devenir … »,
 * qui redirigent désormais vers le domaine de ceux qu'elles recrutent, et un
 * moteur de recherche n'indexe pas une redirection. Hors du domaine public,
 * seules l'accueil et les pages de l'espace sont listées ; les pages légales,
 * communes à tous, le sont une fois, sur le domaine public.
 */
function pagesDuDomaine(hote: string) {
  const espace = espaceDuDomaine(hote);
  if (!espace) return { pages: PAGES_FIXES, boutiques: true, regions: true };

  if (espace === 'public') {
    return {
      pages: PAGES_FIXES.filter((chemin) => ['public', 'commun'].includes(espaceDuChemin(chemin))),
      boutiques: true,
      regions: true,
    };
  }

  return {
    pages: PAGES_FIXES.filter((chemin) => chemin === '/' || espaceDuChemin(chemin) === espace),
    boutiques: false,
    regions: false,
  };
}

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
  const { pages, boutiques: avecBoutiques, regions } = pagesDuDomaine(base.hostname);

  let boutiques: Array<{ slug: string; countryCode: string | null; updatedAt?: string }> = [];
  if (avecBoutiques) {
    try {
      const reponse = await fetch(`${API_URL}/api/client/stores`, { cache: 'no-store' });
      if (reponse.ok) boutiques = (await reponse.json()).data || [];
    } catch {
      // API injoignable : le plan garde au moins les pages fixes.
    }
  }

  const entrees = [
    ...pages.map((chemin) => ({ chemin, pays: null as string | null, modifie: undefined as string | undefined })),
    ...boutiques.map((b) => ({ chemin: `/store/${b.slug}`, pays: b.countryCode, modifie: b.updatedAt })),
  ];

  return entrees.flatMap(({ chemin, pays, modifie }) =>
    // Les régions (/be-fr/…) n'existent que sur le domaine public, et pour
    // les pages régionales : les autres ont une seule adresse.
    !regions || !estCheminRegional(chemin)
      ? [{ url: absolue(chemin), ...(modifie && { lastModified: new Date(modifie) }) }]
      : adressesRegionales(chemin, pays).map((version) => ({
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
