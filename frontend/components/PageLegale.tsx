import type { Metadata } from 'next';
import Link from '@/components/LienRegional';
import ReactMarkdown from 'react-markdown';
import { getLocale, getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import remarkGfm from 'remark-gfm';
import { estDomaineZupDrive } from '@/lib/domaines';

// Côté serveur, l'API peut avoir une autre adresse que celle vue du navigateur.
const API_URL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type Page = { slug: string; titre: string; contenu: string; version: string; publieLe: string | null; parDefaut?: boolean };

const SLUGS_DRIVE: Record<string, string> = {
  'mentions-legales': 'drive-mentions-legales',
  cgu: 'drive-cgu',
  cgv: 'drive-cgv',
  'conditions-chauffeurs': 'drive-conditions-chauffeurs',
  'conditions-societes': 'drive-conditions-societes',
  confidentialite: 'drive-confidentialite',
  cookies: 'drive-cookies',
  accessibilite: 'drive-accessibilite',
};

async function contexteLegale(slug: string) {
  const entetes = await headers();
  const hote = entetes.get('x-forwarded-host') || entetes.get('host') || '';
  const drive = estDomaineZupDrive(hote);
  return {
    drive,
    marque: drive ? 'ZupDrive' : 'ZupEat',
    slug: drive ? SLUGS_DRIVE[slug] ?? null : slug,
  };
}

async function lirePage(slug: string): Promise<Page | null> {
  try {
    // Sans cache : une version publiée depuis l'espace superowner doit
    // s'afficher tout de suite.
    const reponse = await fetch(`${API_URL}/api/pages-legales/${slug}`, { cache: 'no-store' });
    if (!reponse.ok) return null;
    return (await reponse.json()).data;
  } catch {
    return null;
  }
}

export async function metadataLegale(slug: string): Promise<Metadata> {
  const contexte = await contexteLegale(slug);
  const [page, t] = await Promise.all([
    contexte.slug ? lirePage(contexte.slug) : Promise.resolve(null),
    getTranslations('pageLegale'),
  ]);
  const indisponible = !page || (contexte.drive && page.parDefaut);
  return {
    title: `${page?.titre ?? t('titre')} — ${contexte.marque}`,
    ...(indisponible && contexte.drive ? { robots: { index: false, follow: false } } : {}),
  };
}

/**
 * Affiche une page légale telle que publiée depuis l'espace superowner.
 * Le Markdown est rendu sans HTML brut : un texte saisi ne peut pas injecter
 * de script dans la page.
 */
export default async function PageLegale({ slug }: { slug: string }) {
  const contexte = await contexteLegale(slug);
  const [page, t, locale] = await Promise.all([
    contexte.slug ? lirePage(contexte.slug) : Promise.resolve(null),
    getTranslations('pageLegale'),
    getLocale(),
  ]);

  // Ne jamais montrer un brouillon ZupDrive au public, et ne jamais servir un
  // document ZupEat sur un domaine ZupDrive si un chemin n'a pas d'équivalent.
  if (!page || (contexte.drive && page.parDefaut)) {
    return (
      <>
        <h1>{t('titre')}</h1>
        <p>{t('indisponible')}</p>
      </>
    );
  }

  return (
    <>
      <h1>{page.titre}</h1>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Les liens internes restent dans le site, les autres s'ouvrent à part.
          a: ({ href = '', children }) =>
            href.startsWith('/') ? (
              <Link href={href}>{children}</Link>
            ) : (
              <a href={href} target={href.startsWith('mailto:') ? undefined : '_blank'} rel="noopener noreferrer">
                {children}
              </a>
            ),
          // Les tableaux RGPD ont plusieurs colonnes : les garder lisibles sur
          // mobile au lieu de les écraser ou de faire déborder toute la page.
          table: ({ children }) => (
            <div
              className="my-6 w-full overflow-x-auto rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              role="region"
              aria-label={t('tableauDefilant')}
              tabIndex={0}
            >
              <table className="min-w-[40rem]">{children}</table>
            </div>
          ),
        }}
      >
        {page.contenu}
      </ReactMarkdown>
      <p className="mt-10 text-sm text-slate-500">
        {t('version', { version: page.version })}
        {page.publieLe && t('enVigueur', { date: new Date(page.publieLe).toLocaleDateString(locale) })}
      </p>
    </>
  );
}
