'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Search, MapPin, Star, Clock, TrendingUp, Heart } from 'lucide-react';

import { euro } from '@/lib/format';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Store {
  id: string;
  name: string;
  slug: string;
  description?: string;
  address?: string;
  city?: string;
  rating?: number;
  totalRatings?: number;
  latitude?: number;
  longitude?: number;
  distance?: number;
  estimatedDeliveryTime?: string;
  deliveryCost?: number;
  /** Fermée momentanément (bouton rapide du commerçant) : visible, mais on n'y commande pas. */
  isOpen?: boolean;
  /** Ce que disent à la fois le planning hebdomadaire et le bouton rapide, croisés. */
  isOpenNow?: boolean;
  products?: any[];
}

interface StoreStats {
  totalReviews: number;
  averageRating: number;
  satisfactionPercentage: number;
}

export default function ClientHomePage() {
  const t = useTranslations('clientHome');
  const [stores, setStores] = useState<Store[]>([]);
  const [filteredStores, setFilteredStores] = useState<Store[]>([]);
  const [storeStats, setStoreStats] = useState<Record<string, StoreStats>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [location, setLocation] = useState({ lat: null as number | null, lng: null as number | null });
  const [address, setAddress] = useState('');
  const [useGPS, setUseGPS] = useState(false);
  const [sortBy, setSortBy] = useState('rating');

  useEffect(() => {
    loadStores();
  }, []);

  useEffect(() => {
    filterAndSortStores();
  }, [stores, searchQuery, sortBy]);

  const loadStores = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/client/stores`);
      if (!response.ok) throw new Error('Failed to load stores');

      const data = await response.json();
      const storeList = data.data || [];
      setStores(storeList);

      // Charger les stats pour chaque restaurant
      await loadStoresStats(storeList);
    } catch (err) {
      console.error('Error loading stores:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStoresStats = useCallback(async (storeList: Store[]) => {
    try {
      const stats: Record<string, StoreStats> = {};

      for (const store of storeList) {
        try {
          const response = await fetch(`${API_URL}/api/reviews/${store.id}/store/stats`);
          if (response.ok) {
            const data = await response.json();
            stats[store.id] = data;
          }
        } catch (error) {
          console.error(`Error fetching stats for store ${store.id}:`, error);
        }
      }

      setStoreStats(stats);
    } catch (error) {
      console.error('Error fetching stores stats:', error);
    }
  }, []);

  const loadNearbyStores = useCallback(async (lat: number, lng: number) => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/client/stores/nearby?latitude=${lat}&longitude=${lng}&maxDistance=10`);
      if (!response.ok) throw new Error('Failed to load nearby stores');

      const data = await response.json();
      const storeList = data.data || [];
      setStores(storeList);

      // Charger les stats pour chaque restaurant
      await loadStoresStats(storeList);
    } catch (err) {
      console.error('Error loading nearby stores:', err);
    } finally {
      setLoading(false);
    }
  }, [loadStoresStats]);

  const getLocationByGPS = useCallback(() => {
    if (!navigator.geolocation) {
      alert(t('geolocationNotSupported'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setLocation({ lat: latitude, lng: longitude });
        setUseGPS(true);
        loadNearbyStores(latitude, longitude);
      },
      (error) => {
        console.error('GPS error:', error);
        alert(t('cantAccessLocation'));
      }
    );
  }, [loadNearbyStores, t]);

  const filterAndSortStores = () => {
    let filtered = stores;

    if (searchQuery) {
      filtered = filtered.filter(store =>
        store.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        store.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Sort
    if (sortBy === 'rating') {
      filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (sortBy === 'distance' && location.lat) {
      filtered.sort((a, b) => (a.distance || 999) - (b.distance || 999));
    } else if (sortBy === 'delivery') {
      filtered.sort((a, b) => (a.deliveryCost || 0) - (b.deliveryCost || 0));
    }

    setFilteredStores(filtered);
  };

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-orange-600 to-red-600 text-white py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold mb-4">{t('title')}</h1>
          <p className="text-xl mb-8 text-orange-100">{t('subtitle')}</p>

          {/* Search & Location */}
          <div className="space-y-4 mb-6">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-4 top-3 text-gray-400" size={20} />
              <input
                type="text"
                placeholder={t('searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 rounded-lg text-gray-900 focus:outline-none"
              />
            </div>

            {/* Location Options */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="relative">
                <MapPin className="absolute left-4 top-3 text-gray-400" size={20} />
                <input
                  type="text"
                  placeholder={t('locationPlaceholder')}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 rounded-lg text-gray-900 focus:outline-none"
                />
              </div>
              <button
                onClick={getLocationByGPS}
                className="bg-white text-red-600 font-semibold py-3 px-6 rounded-lg hover:bg-orange-50 flex items-center justify-center gap-2"
              >
                <MapPin size={18} />
                {t('myLocation')}
              </button>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-4 py-3 rounded-lg text-gray-900 bg-white focus:outline-none"
              >
                <option value="rating">{t('sortByRating')}</option>
                <option value="distance">{t('sortByDistance')}</option>
                <option value="delivery">{t('sortByDelivery')}</option>
              </select>
            </div>

            {/* GPS Status */}
            {useGPS && location.lat && (
              <p className="text-sm text-orange-100">
                ✓ Localisation: {location.lat.toFixed(4)}, {location.lng?.toFixed(4)}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-12">
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <p className="text-white text-lg">{t('loadingRestaurants')}</p>
          </div>
        ) : filteredStores.length === 0 ? (
          <div className="text-center py-20">
            <TrendingUp size={48} className="mx-auto text-gray-600 mb-4" />
            <p className="text-white text-lg">{t('noRestaurantsFound')}</p>
            <p className="text-gray-400">{t('tryAnotherSearch')}</p>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-white mb-4">
                {searchQuery ? t('searchResults') : t('nearbyRestaurants')} ({filteredStores.length})
              </h2>

              {/* Restaurants Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Une seule vitrine désormais, à l'adresse lisible. */}
                {filteredStores.map((store) => (
                  <Link key={store.id} href={`/store/${store.slug}`}>
                    <div className="bg-gray-800 rounded-lg overflow-hidden hover:shadow-xl transition transform hover:scale-105 cursor-pointer h-full">
                      {/* Restaurant Image Placeholder */}
                      <div className="relative bg-gradient-to-r from-orange-500 to-red-500 h-40 flex items-center justify-center">
                        <div className="text-center">
                          <div className="text-white text-4xl font-bold opacity-50">{store.name.charAt(0)}</div>
                        </div>

                        {/* Une boutique fermée disparaissait de la liste : le
                            client croyait le commerce parti. */}
                        {store.isOpenNow === false && (
                          <span className="absolute inset-x-0 bottom-0 bg-gray-900/80 py-1.5 text-center text-xs font-semibold text-amber-300">
                            {store.isOpen === false ? t('temporarilyUnavailable') : t('closedNow')}
                          </span>
                        )}
                      </div>

                      <div className="p-4">
                        {/* Name & Badge */}
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="text-lg font-bold text-white">{store.name}</h3>
                          <Heart size={18} className="text-gray-400 hover:text-red-500" />
                        </div>

                        {/* Description */}
                        <p className="text-sm text-gray-400 mb-3 line-clamp-2">{store.description}</p>

                        {/* Rating & Reviews */}
                        <div className="flex items-center gap-2 mb-3 flex-wrap">
                          <div className="flex items-center gap-1">
                            <Star size={16} className="text-yellow-500 fill-yellow-500" />
                            <span className="text-white font-semibold">{store.rating || 4.5}</span>
                          </div>
                          <span className="text-gray-500 text-sm">({store.totalRatings || 0} {t('reviews')})</span>
                          {storeStats[store.id] && storeStats[store.id].totalReviews > 0 && (
                            <span className="text-green-400 text-sm font-semibold">
                              👍 {storeStats[store.id].satisfactionPercentage}%
                            </span>
                          )}
                        </div>

                        {/* Location & Delivery */}
                        <div className="space-y-2 text-sm">
                          {store.address && (
                            <div className="flex items-center gap-2 text-gray-400">
                              <MapPin size={14} />
                              <span>{store.address}</span>
                            </div>
                          )}

                          {store.estimatedDeliveryTime && (
                            <div className="flex items-center gap-2 text-gray-400">
                              <Clock size={14} />
                              <span>{store.estimatedDeliveryTime}</span>
                            </div>
                          )}

                          {store.distance && (
                            <div className="text-gray-400">
                              📍 {store.distance} km
                            </div>
                          )}
                        </div>

                        {/* Delivery Cost */}
                        {store.deliveryCost !== undefined && (
                          <div className="mt-3 pt-3 border-t border-gray-700">
                            <span className="text-orange-400 font-semibold">
                              {t('fees')} {euro(store.deliveryCost)}
                            </span>
                          </div>
                        )}

                        {/* CTA Button */}
                        <button className="w-full mt-4 bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2 rounded-lg transition">
                          {t('seeMenu')}
                        </button>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
