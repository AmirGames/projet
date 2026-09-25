'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, ShoppingCart } from 'lucide-react';

import { euro } from '@/lib/format';
import {
  EVENEMENT_PANIERS,
  nombreDArticles,
  tousLesPaniers,
  totalDuPanier,
  type PanierBoutique,
} from '@/lib/paniers';
import { lireAdresseLivraison, type AdresseLivraison } from '@/lib/adresseLivraison';

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
  const conteneur = useRef<HTMLDivElement>(null);

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
                  <Link
                    // Retour à la vitrine, panier ouvert ; à défaut de
                    // l'adresse de la vitrine, le tunnel de commande.
                    href={
                      panier.storeSlug
                        ? `/store/${panier.storeSlug}?panier=1`
                        : `/checkout?boutique=${panier.storeId}`
                    }
                    onClick={() => setOuvert(false)}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-700/60 transition"
                  >
                    <span className="w-12 h-12 flex-shrink-0 rounded-full bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-white text-lg font-bold">
                      {(panier.storeName || '?').charAt(0).toUpperCase()}
                    </span>
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
