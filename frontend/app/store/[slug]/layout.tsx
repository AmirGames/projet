import type { Metadata } from 'next';
import { alternatesRegionales } from '@/lib/seo-regional';

// Côté serveur, l'API peut avoir une autre adresse que celle vue du navigateur.
const API_URL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * La vitrine n'existe, pour les moteurs de recherche, que dans les régions du
 * pays du commerce : /be-fr/store/x et /be-en/store/x pour une friterie
 * bruxelloise, jamais /fr-fr/store/x — sinon chaque vitrine compterait autant
 * de doublons que le site a de régions. Son nom sert de titre.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  let boutique: { name?: string; countryCode?: string | null } | undefined;

  try {
    const reponse = await fetch(`${API_URL}/api/stores/slug/${encodeURIComponent(slug)}`, {
      next: { revalidate: 300 },
    });
    if (reponse.ok) boutique = (await reponse.json()).store;
  } catch {
    // API injoignable : la vitrine s'affiche quand même, avec les balises
    // communes à toutes les régions.
  }

  return {
    ...(boutique?.name && { title: `${boutique.name} — Zupone` }),
    alternates: await alternatesRegionales(boutique?.countryCode),
  };
}

export default function LayoutVitrine({ children }: { children: React.ReactNode }) {
  return children;
}
