'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Star, MapPin, Heart, Trash2 } from 'lucide-react';

import { euro } from '@/lib/format';

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
  };
}

export default function FavoritesPage() {
  const t = useTranslations('clientFavorites');
  const router = useRouter();
  const [favorites, setFavorites] = useState<FavoriteStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadFavorites = useCallback(async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      router.push('/login');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/client/me/favorites`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setFavorites(data.data || []);
      }
    } catch (err) {
      console.error('Error loading favorites:', err);
      setError(t('loadingError'));
    } finally {
      setLoading(false);
    }
  }, [router, t]);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  const removeFavorite = async (storeId: string) => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    try {
      await fetch(`${API_URL}/api/client/me/favorites/${storeId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      setFavorites(favorites.filter(fav => fav.storeId !== storeId));
    } catch (err) {
      console.error('Error removing favorite:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="pt-4">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <Link href="/client" className="flex items-center gap-2 text-orange-500 hover:text-orange-400 mb-4">
            <ArrowLeft size={20} />
            {t('back')}
          </Link>
          <h1 className="text-3xl font-bold text-white">{t('title')}</h1>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {error && (
          <div className="bg-red-900 border border-red-700 rounded-lg p-4 mb-6 text-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-20">
            <p className="text-white text-lg">{t('loading')}</p>
          </div>
        ) : favorites.length === 0 ? (
          <div className="text-center py-20 bg-gray-800 rounded-lg">
            <Heart size={48} className="mx-auto text-gray-600 mb-4" />
            <p className="text-white text-xl mb-4">{t('noFavorites')}</p>
            <Link href="/client" className="text-orange-500 hover:text-orange-400">
              {t('discoverRestaurants')}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {favorites.map(favorite => {
              const store = favorite.store;
              return (
                <div key={favorite.id} className="bg-gray-800 rounded-lg overflow-hidden hover:shadow-lg transition">
                  {/* Store Image Placeholder */}
                  <div className="bg-gradient-to-r from-orange-500 to-red-500 h-40 flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-white text-4xl font-bold opacity-50">
                        {store.name.charAt(0)}
                      </div>
                    </div>
                  </div>

                  <div className="p-4">
                    {/* Name & Remove Button */}
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-lg font-bold text-white flex-1">{store.name}</h3>
                      <button
                        onClick={() => removeFavorite(store.id)}
                        className="text-red-500 hover:text-red-400 p-1"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>

                    {/* Description */}
                    <p className="text-sm text-gray-400 mb-3 line-clamp-2">
                      {store.description}
                    </p>

                    {/* Rating & Reviews */}
                    <div className="flex items-center gap-2 mb-3">
                      {store.totalRatings && store.rating != null ? (
                        <>
                          <div className="flex items-center gap-1">
                            <Star size={16} className="text-yellow-500 fill-yellow-500" />
                            <span className="text-white font-semibold">
                              {Number(store.rating).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                            </span>
                          </div>
                          <span className="text-gray-500 text-sm">({store.totalRatings} avis)</span>
                        </>
                      ) : (
                        <span className="text-gray-500 text-sm">Pas encore d&apos;avis</span>
                      )}
                    </div>

                    {/* Location & Delivery */}
                    <div className="space-y-2 text-sm mb-4">
                      {store.address && (
                        <div className="flex items-center gap-2 text-gray-400">
                          <MapPin size={14} />
                          <span>{store.address}</span>
                        </div>
                      )}

                      {store.deliveryCost !== undefined && (
                        <div className="text-gray-400">
                          {t('deliveryCost')} {euro(store.deliveryCost)}
                        </div>
                      )}
                    </div>

                    {/* CTA Button */}
                    <Link href={`/store/${store.slug}`} className="w-full block">
                      <button className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2 rounded-lg transition">
                        {t('viewMenu')}
                      </button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
