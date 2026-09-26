import type { Metadata } from 'next';
import Link from '@/components/LienRegional';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Côté serveur, l'API peut avoir une autre adresse que celle vue du navigateur.
const API_URL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type Page = { slug: string; titre: string; contenu: string; version: string; publieLe: string | null };

async function lirePage(slug: string): Promise<Page | null> {
  try {
    // Sans cache : une version publiée depuis l'espace superowner doit
    // s'afficher tout de suite.
    const reponse = await fetch(`${API_URL}/pages-legales/${slug}`, { cache: 'no-store' });
    if (!reponse.ok) return null;
    return (await reponse.json()).data;
  } catch {
    return null;
  }
}

export async function metadataLegale(slug: string): Promise<Metadata> {
  const page = await lirePage(slug);
  return { title: `${page?.titre ?? 'Informations légales'} — Zupone` };
}

/**
 * Affiche une page légale telle que publiée depuis l'espace superowner.
 * Le Markdown est rendu sans HTML brut : un texte saisi ne peut pas injecter
 * de script dans la page.
 */
export default async function PageLegale({ slug }: { slug: string }) {
  const page = await lirePage(slug);

  if (!page) {
    return (
      <>
        <h1>Informations légales</h1>
        <p>Ce texte est momentanément indisponible. Merci de réessayer dans quelques instants.</p>
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
        }}
      >
        {page.contenu}
      </ReactMarkdown>
      <p className="mt-10 text-sm text-slate-500">
        Version {page.version}
        {page.publieLe && ` — en vigueur depuis le ${new Date(page.publieLe).toLocaleDateString('fr-FR')}`}
      </p>
    </>
  );
}
