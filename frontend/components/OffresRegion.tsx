'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Flame, Sparkles, Star, Tag } from 'lucide-react';
import { filtrePays } from '@/i18n/regions';
import { useRegion } from '@/lib/region-context';
import { euro } from '@/lib/format';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface PromotionRegion {
  code: string;
  description?: string | null;
  type: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: string | number;
  minOrderAmount?: string | number | null;
  store: { id: string; name: string; slug: string; city?: string | null };
}

interface Tendance {
  cuisineType: string;
  libelle: string;
  commandes: number;
}

interface Suggestion {
  id: string;
  name: string;
  slug: string;
  city?: string | null;
  cuisineLibelle?: string | null;
  rating: number;
  dejaCommande: boolean;
}

const lireJson = (reponse: Response) => (reponse.ok ? reponse.json() : null);

/**
 * Ce qui se passe dans la région du visiteur : les promotions en cours, les
 * cuisines les plus commandées et, pour un compte connecté, des commerces
 * proches de ce qu'il commande.
 *
 * Rien ici ne suit le visiteur : la région vient de son choix de pays, les
 * tendances sont agrégées par le serveur (seuil d'acheteurs), et les
 * suggestions sont calculées côté serveur pour le seul compte connecté, qui
 * peut les désactiver depuis son profil. Une section sans contenu disparaît.
 */
export function OffresRegion() {
  const t = useTranslations('offresRegion');
  const region = useRegion();
  const [promotions, setPromotions] = useState<PromotionRegion[]>([]);
  const [tendances, setTendances] = useState<Tendance[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const filtre = filtrePays(region);

  useEffect(() => {
    let actif = true;
    fetch(`${API_URL}/api/client/promotions-region${filtre}`)
      .then(lireJson)
      .then((donnees) => actif && setPromotions(donnees?.data || []))
      .catch(() => undefined);
    fetch(`${API_URL}/api/client/tendances${filtre}`)
      .then(lireJson)
      .then((donnees) => actif && setTendances(donnees?.data || []))
      .catch(() => undefined);

    const token = localStorage.getItem('accessToken');
    if (token) {
      fetch(`${API_URL}/api/client/me/recommandations${filtre}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(lireJson)
        .then((donnees) => actif && setSuggestions(donnees?.data?.boutiques || []))
        .catch(() => undefined);
    }
    return () => {
      actif = false;
    };
  }, [filtre]);

  if (promotions.length === 0 && tendances.length === 0 && suggestions.length === 0) return null;

  const remise = (p: PromotionRegion) =>
    p.type === 'PERCENTAGE' ? `-${Number(p.discountValue)} %` : `-${euro(Number(p.discountValue))}`;

  return (
    <div className="mt-6 space-y-6">
      {suggestions.length > 0 && (
        <section aria-labelledby="offres-pour-vous">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="offres-pour-vous" className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-gray-900">
              <Sparkles size={20} className="text-orange-600" />
              {t('pourVousTitre')}
            </h2>
            <Link href="/client/profile" className="text-xs text-gray-500 underline hover:text-gray-700">
              {t('gererPersonnalisation')}
            </Link>
          </div>
          <ul className="mt-3 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {suggestions.map((s) => (
              <li key={s.id} className="shrink-0">
                <Link
                  href={`/store/${s.slug}`}
                  className="block w-56 rounded-[18px] border border-[#ECECEA] bg-white p-4 hover:shadow-sm"
                >
                  <p className="truncate font-bold text-gray-900">{s.name}</p>
                  <p className="mt-0.5 truncate text-sm text-gray-500">
                    {[s.cuisineLibelle, s.city].filter(Boolean).join(' · ')}
                  </p>
                  <p className="mt-2 flex items-center gap-1 text-sm text-gray-700">
                    <Star size={14} className="fill-amber-400 text-amber-400" />
                    {s.rating.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                    {s.dejaCommande && (
                      <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {t('dejaCommande')}
                      </span>
                    )}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {promotions.length > 0 && (
        <section aria-labelledby="offres-promotions">
          <h2 id="offres-promotions" className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-gray-900">
            <Tag size={20} className="text-orange-600" />
            {t('promotionsTitre')}
          </h2>
          <ul className="mt-3 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {promotions.map((p) => (
              <li key={`${p.store.id}-${p.code}`} className="shrink-0">
                <Link
                  href={`/store/${p.store.slug}`}
                  className="block w-64 rounded-[18px] border border-[#ECECEA] bg-white p-4 hover:shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-bold text-gray-900">{p.store.name}</p>
                    <span className="shrink-0 rounded-full bg-orange-600 px-2.5 py-0.5 text-sm font-bold text-white">
                      {remise(p)}
                    </span>
                  </div>
                  {p.description && <p className="mt-1 line-clamp-2 text-sm text-gray-500">{p.description}</p>}
                  <p className="mt-2 text-sm text-gray-700">
                    {t('code')} <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-gray-900">{p.code}</span>
                  </p>
                  {p.minOrderAmount && Number(p.minOrderAmount) > 0 && (
                    <p className="mt-1 text-xs text-gray-500">{t('minimum', { montant: euro(Number(p.minOrderAmount)) })}</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tendances.length > 0 && (
        <section aria-labelledby="offres-tendances">
          <h2 id="offres-tendances" className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-gray-900">
            <Flame size={20} className="text-orange-600" />
            {t('tendancesTitre')}
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {tendances.map((tendance) => (
              <li
                key={tendance.cuisineType}
                className="rounded-full border border-[#ECECEA] bg-white px-3 py-1.5 text-sm text-gray-800"
              >
                <span className="font-semibold">{tendance.libelle}</span>
                <span className="ml-1.5 text-gray-500">{t('commandes', { n: tendance.commandes })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
