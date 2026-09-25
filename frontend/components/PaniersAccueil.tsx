'use client';

import { useEffect, useRef, useState } from 'react';
import Link from '@/components/LienRegional';
import { useRouter } from 'next/navigation';
import { ChevronRight, ShoppingCart } from 'lucide-react';

import { euro } from '@/lib/format';
import {
  EVENEMENT_PANIERS,
  nombreDArticles,
  retenirVitrineDuPanier,
  tousLesPaniers,
  totalDuPanier,
  type PanierBoutique,
} from '@/lib/paniers';
import { lireAdresseLivraison, type AdresseLivraison } from '@/lib/adresseLivraison';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/** Ce que le panier montre d'un commerce : l'adresse de sa vitrine et son logo. */
interface FicheCommerce {
  slug: string | null;
  logo: string | null;
}

/** La fiche d'un commerce, retrouvée depuis son identifiant. */
async function ficheDuCommerce(storeId: string): Promise<FicheCommerce | null> {
  try {
    const reponse = await fetch(`${API_URL}/api/client/stores/${storeId}`);
    if (!reponse.ok) return null;
    const donnees = await reponse.json();
    const slug = donnees?.data?.slug;
    const logo = donnees?.data?.settings?.logo;
    return {
      slug: typeof slug === 'string' && slug ? slug : null,
      logo: typeof logo === 'string' && logo ? logo : null,
    };
  } catch {
    return null;
  }
}

/** L'adresse de la vitrine d'un commerce, retrouvée depuis son identifiant. */
async function slugDuCommerce(storeId: string): Promise<string | null> {
  return (await ficheDuCommerce(storeId))?.slug ?? null;
}

/**
 * Le panier de l'accueil : tous les paniers en cours, un par commerce.
 *
 * Le rappel « un panier vous attend ailleurs » vivait dans le panier de chaque
 * vitrine, où il n'avait rien à faire : on y compose la commande d'un seul
 * commerce. Ici, comme sur les grandes plateformes, on voit d'un coup d'œil
 * chaque panier, son sous-total et l'adresse de livraison, et on y retourne.
 */
export function PaniersAccueil() {
  const [paniers, setPaniers] = useState<PanierBoutique[]>([]);
  const [adresse, setAdresse] = useState<AdresseLivraison | null>(null);
  const [ouvert, setOuvert] = useState(false);
  // Le logo n'est pas gardé dans le panier : il est relu à l'ouverture, et le
  // commerçant peut le changer entre-temps.
  const [logos, setLogos] = useState<Record<string, string | null>>({});
  const conteneur = useRef<HTMLDivElement>(null);
  const router = useRouter();

  /**
   * Un panier ramène toujours à la vitrine, où l'on peut encore ajouter des
   * articles. Un panier créé avant qu'on garde l'adresse de la vitrine la
   * retrouve à l'ouverture de la liste, puis la garde.
   */
  useEffect(() => {
    if (!ouvert) return;
    paniers
      .filter((panier) => !panier.storeSlug || !(panier.storeId in logos))
      .forEach(async (panier) => {
        const fiche = await ficheDuCommerce(panier.storeId);
        if (!fiche) return;
        if (fiche.slug && !panier.storeSlug) retenirVitrineDuPanier(panier.storeId, fiche.slug);
        setLogos((actuels) => ({ ...actuels, [panier.storeId]: fiche.logo }));
      });
    // `logos` se remplit ici même : le relire relancerait la recherche.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert, paniers]);

  // Au cas où l'on clique avant que l'adresse soit retrouvée.
  const allerAuCommerce = async (panier: PanierBoutique) => {
    setOuvert(false);
    const slug = panier.storeSlug || (await slugDuCommerce(panier.storeId));
    if (slug) {
      retenirVitrineDuPanier(panier.storeId, slug);
      router.push(`/store/${slug}?panier=1`);
    } else {
      // Commerce introuvable (supprimé, réseau coupé) : reste le tunnel.
      router.push(`/checkout?boutique=${panier.storeId}`);
    }
  };

  useEffect(() => {
    const relire = () => {
      setPaniers(tousLesPaniers());
      setAdresse(lireAdresseLivraison());
    };

    relire();
    // Un autre onglet, cet onglet, ou un retour sur la page.
    window.addEventListener('storage', relire);
    window.addEventListener(EVENEMENT_PANIERS, relire);
    window.addEventListener('focus', relire);
    return () => {
      window.removeEventListener('storage', relire);
      window.removeEventListener(EVENEMENT_PANIERS, relire);
      window.removeEventListener('focus', relire);
    };
  }, []);

  // Refermer au clic à l'extérieur, ou avec Échap.
  useEffect(() => {
    if (!ouvert) return;
    const auClic = (e: MouseEvent) => {
      if (conteneur.current && !conteneur.current.contains(e.target as Node)) setOuvert(false);
    };
    const auClavier = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOuvert(false);
    };
    document.addEventListener('mousedown', auClic);
    document.addEventListener('keydown', auClavier);
    return () => {
      document.removeEventListener('mousedown', auClic);
      document.removeEventListener('keydown', auClavier);
    };
  }, [ouvert]);

  return (
    <div ref={conteneur} className="relative">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-label={`Paniers (${paniers.length})`}
        aria-expanded={ouvert}
        className="relative p-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-700"
      >
        <ShoppingCart size={22} />
        {paniers.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 rounded-full bg-orange-600 text-white text-xs font-bold flex items-center justify-center">
            {paniers.length}
          </span>
        )}
      </button>

      {ouvert && (
        <div className="absolute right-0 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] bg-gray-800 border border-gray-700 rounded-xl shadow-2xl overflow-hidden z-50">
          {paniers.length === 0 ? (
            <p className="px-4 py-6 text-center text-gray-400 text-sm">Vos paniers sont vides</p>
          ) : (
            <ul className="divide-y divide-gray-700 max-h-[70vh] overflow-y-auto">
              {paniers.map((panier) => (
                <li key={panier.storeId}>
                  {/* Retour à la vitrine, panier ouvert : on peut y ajouter
                      des articles avant de commander. */}
                  <Link
                    href={`/store/${panier.storeSlug || ''}?panier=1`}
                    onClick={(e) => {
                      e.preventDefault();
                      allerAuCommerce(panier);
                    }}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-700/60 transition"
                  >
                    {logos[panier.storeId] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={logos[panier.storeId] as string}
                        alt={panier.storeName || 'Commerce'}
                        className="w-12 h-12 flex-shrink-0 rounded-full bg-white object-contain p-1"
                      />
                    ) : (
                      <span className="w-12 h-12 flex-shrink-0 rounded-full bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-white text-lg font-bold">
                        {(panier.storeName || '?').charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-white truncate">
                        {panier.storeName || 'Commerce'}
                      </span>
                      <span className="block text-sm text-gray-400">
                        Sous-total : {euro(totalDuPanier(panier.lignes))}
                      </span>
                      {adresse && (
                        <span className="block text-xs text-gray-500 truncate">
                          Livrer à {adresse.label}
                        </span>
                      )}
                    </span>
                    <span className="w-7 h-7 flex-shrink-0 rounded-full bg-white text-gray-900 text-sm font-bold flex items-center justify-center">
                      {nombreDArticles(panier.lignes)}
                    </span>
                    <ChevronRight size={18} className="flex-shrink-0 text-gray-500" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
