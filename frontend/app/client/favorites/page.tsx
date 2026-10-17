'use client';


import { jetonAcces } from '@/lib/jeton-session';
import { signalerErreur } from '@/lib/erreurs';
import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, Star, MapPin, Heart, Trash2 } from 'lucide-react';

import { euro } from '@/lib/format';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import { IllustrationFamille } from '@/components/IllustrationFamille';
import { visuelDeFamille } from '@/lib/visuels-familles';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface FavoriteStore {
  id: string;
  storeId: string;
  store: {
    id: string;
    name: string;
    /** L'adresse lisible de la vitrine, seule porte d'entrée désormais. */
    slug: string;
    description?: string;
    address?: string;
    city?: string;
    /** Moyenne des avis publiés, null tant que personne n'a noté. */
    rating?: number | null;
    totalRatings?: number;
    deliveryCost?: number;
    distance?: number;
    settings?: { logo?: string | null; banner?: string | null } | null;
    /** La famille (« pizza », « sushi »…), pour l'illustration sans photo. */
    famille?: string | null;
  };
}

export default function FavoritesPage() {
  const locale = useLocale();
  const t = useTranslations('clientFavorites');
  const router = useRouter();
  const [favorites, setFavorites] = useState<FavoriteStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadFavorites = useCallback(async () => {
    const token = jetonAcces();
    if (!token) {
      router.push('/login');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/client/me/favorites`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Failed to fetch favorites');
      const data = await response.json();
      setFavorites(data.data || []);
    } catch (err) {
      signalerErreur('Error loading favorites:', err);
      setError(t('loadingError'));
    } finally {
      setLoading(false);
    }
  }, [router, t]);

  useEffectChargement(() => {
    loadFavorites();
  }, [loadFavorites]);

  const removeFavorite = async (storeId: string) => {
    const token = jetonAcces();
    if (!token) return;

    try {
      const response = await fetch(`${API_URL}/api/client/me/favorites/${storeId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to remove favorite');

      setFavorites(favorites.filter(fav => fav.storeId !== storeId));
    } catch (err) {
      signalerErreur('Error removing favorite:', err);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFDFB]">
      {/* Header */}
      <header className="pt-4">
        <div className="mx-auto max-w-7xl px-5 py-8 md:px-8 md:py-10">
          <Link href="/client" className="mb-4 inline-flex items-center gap-2 rounded-lg text-sm font-semibold text-neutral-600 transition hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]">
            <ArrowLeft size={20} />
            {t('back')}
          </Link>
          <h1 className="text-3xl font-black tracking-tight text-gray-900 md:text-4xl">{t('title')}</h1>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 pb-16 md:px-8">
        {error && (
          <div role="alert" className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-20">
            <p className="text-gray-900 text-lg">{t('loading')}</p>
          </div>
        ) : favorites.length === 0 ? (
          <div className="rounded-3xl border border-orange-100 bg-[#FFF4EB] px-6 py-16 text-center">
            <Heart size={48} className="mx-auto mb-4 text-[#FF7A00]" />
            <p className="text-gray-900 text-xl mb-4">{t('noFavorites')}</p>
              <Link href="/client" className="font-bold text-[#A94F00] underline underline-offset-4 hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]">
              {t('discoverRestaurants')}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {favorites.map(favorite => {
              const store = favorite.store;
              return (
                <article key={favorite.id} className="group overflow-hidden rounded-3xl border border-neutral-200 bg-white transition duration-300 hover:-translate-y-1 hover:shadow-xl">
                  {/* Comme sur l'accueil : la photo de couverture, ou l'illustration
                      de la catégorie ; le logo en pastille, ou l'emoji de la
                      catégorie sur une photo. */}
                  <div className="relative aspect-[1.8] overflow-hidden bg-gray-100">
                    {store.settings?.banner ? (
                      <img src={store.settings.banner} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    ) : (
                      <IllustrationFamille famille={store.famille} />
                    )}
                    {(store.settings?.logo || store.settings?.banner) && (
                      <div className="absolute bottom-3 left-3">
                        {store.settings?.logo ? (
                          <img
                            src={store.settings.logo}
                            alt={store.name}
                            className="h-12 w-12 rounded-xl bg-white object-contain p-1 shadow-md"
                          />
                        ) : (
                          <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-2xl shadow-md">
                            {visuelDeFamille(store.famille).emoji}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="p-5">
                    {/* Name & Remove Button */}
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-lg font-bold text-gray-900 flex-1">{store.name}</h3>
                      <button
                        onClick={() => removeFavorite(store.id)}
                        type="button"
                        aria-label={`${t('removeFavorite')} — ${store.name}`}
                        className="rounded-full p-2 text-neutral-500 transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>

                    {/* Description */}
                    <p className="text-sm text-gray-500 mb-3 line-clamp-2">
                      {store.description}
                    </p>

                    {/* Rating & Reviews */}
                    <div className="flex items-center gap-2 mb-3">
                      {store.totalRatings && store.rating != null ? (
                        <>
                          <div className="flex items-center gap-1">
                            <Star size={16} className="text-yellow-500 fill-yellow-500" />
                            <span className="text-gray-900 font-semibold">
                              {Number(store.rating).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                            </span>
                          </div>
                          <span className="text-gray-500 text-sm">({store.totalRatings} avis)</span>
                        </>
                      ) : (
                        <span className="text-gray-500 text-sm">{t('pasDAvis')}</span>
                      )}
                    </div>

                    {/* Location & Delivery */}
                    <div className="space-y-2 text-sm mb-4">
                      {store.address && (
                        <div className="flex items-center gap-2 text-gray-500">
                          <MapPin size={14} />
                          <span>{store.address}</span>
                        </div>
                      )}

                      {store.deliveryCost !== undefined && (
                        <div className="text-gray-500">
                          {t('deliveryCost')} {euro(store.deliveryCost)}
                        </div>
                      )}
                    </div>

                    {/* CTA Button */}
                    <Link href={`/store/${store.slug}`} className="block w-full rounded-full bg-[#FF5A00] py-3 text-center font-bold text-white transition hover:bg-[#D94B00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A00] focus-visible:ring-offset-2">
                        {t('viewMenu')}
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

