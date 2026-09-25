'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { MapPin, Star, Clock, TrendingUp, Heart } from 'lucide-react';

import { ChoixAdresseLivraison } from '@/components/ChoixAdresseLivraison';
import { lireAdresseLivraison, type AdresseLivraison } from '@/lib/adresseLivraison';

import { euro } from '@/lib/format';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Store {
  id: string;
  name: string;
  slug: string;
  description?: string;
  address?: string;
  city?: string;
  /** Moyenne des avis publiés, null tant que personne n'a noté. */
  rating?: number | null;
  totalRatings?: number;
  /** Part des avis à 4 ou 5 étoiles, null sans avis. */
  satisfactionPercentage?: number | null;
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
  /** Le logo que le commerçant a déposé depuis ses paramètres. */
  settings?: { logo?: string | null } | null;
  /** Les frais jusqu'à l'adresse du client, quand elle est connue. */
  livraison?: {
    livrable: boolean;
    frais: number;
    minimum: number;
    deliveryMinutes: number | null;
  } | null;
}

/** Les frais qui s'appliquent vraiment : ceux de la zone, sinon le forfait. */
const fraisDe = (store: Store) =>
  store.livraison ? (store.livraison.livrable ? store.livraison.frais : Infinity) : store.deliveryCost || 0;

export default function ClientHomePage() {
  const t = useTranslations('clientHome');
  const [stores, setStores] = useState<Store[]>([]);
  const [filteredStores, setFilteredStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  // `undefined` tant que le navigateur n'a pas été lu.
  const [adresse, setAdresse] = useState<AdresseLivraison | null | undefined>(undefined);
  const [sortBy, setSortBy] = useState('rating');

  const loadStores = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/client/stores`);
      if (!response.ok) throw new Error('Failed to load stores');

      const data = await response.json();
      const storeList = data.data || [];
      setStores(storeList);
    } catch (err) {
      console.error('Error loading stores:', err);
    } finally {
      setLoading(false);
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
    } catch (err) {
      console.error('Error loading nearby stores:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  /** Les restaurants proches de l'adresse, ou tous faute de coordonnées. */
  const chargerPour = useCallback(
    (choisie: AdresseLivraison | null) => {
      if (choisie?.latitude != null && choisie?.longitude != null) {
        loadNearbyStores(choisie.latitude, choisie.longitude);
      } else {
        loadStores();
      }
    },
    [loadNearbyStores, loadStores]
  );

  // L'adresse enregistrée lors d'une visite précédente sert d'emblée ; sans
  // elle, on ouvre directement la saisie.
  useEffect(() => {
    const enregistree = lireAdresseLivraison();
    setAdresse(enregistree);
    chargerPour(enregistree);
  }, [chargerPour]);

  useEffect(() => {
    // Copie : trier `stores` en place modifiait l'état sans que React le sache.
    const filtered = [...stores];

    if (sortBy === 'rating') {
      filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (sortBy === 'distance') {
      filtered.sort((a, b) => (a.distance ?? 999) - (b.distance ?? 999));
    } else if (sortBy === 'delivery') {
      filtered.sort((a, b) => fraisDe(a) - fraisDe(b));
    }

    // Quel que soit le tri, celles qui livrent à l'adresse passent devant
    // celles où l'on ne peut que retirer sur place (tri stable).
    filtered.sort(
      (a, b) => Number(b.livraison?.livrable !== false) - Number(a.livraison?.livrable !== false)
    );

    setFilteredStores(filtered);
  }, [stores, sortBy]);

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-orange-600 to-red-600 text-white py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold mb-4">{t('title')}</h1>
          <p className="text-xl mb-8 text-orange-100">{t('subtitle')}</p>

          {/* Adresse de livraison — une fois retenue, elle se résume à une
              pastille qu'on touche pour la changer. */}
          <div className="flex flex-col md:flex-row md:items-start gap-3 mb-6">
            <ChoixAdresseLivraison
              adresse={adresse}
              saisieOuverteSansAdresse
              onChange={(choisie) => {
                setAdresse(choisie);
                chargerPour(choisie);
              }}
            />

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="md:ml-auto h-12 px-4 rounded-lg text-gray-900 bg-white focus:outline-none"
            >
              <option value="rating">{t('sortByRating')}</option>
              <option value="distance">{t('sortByDistance')}</option>
              <option value="delivery">{t('sortByDelivery')}</option>
            </select>
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
            <p className="text-gray-400">{t('tryAnotherAddress')}</p>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-white mb-4">
                {adresse?.latitude != null ? t('nearbyRestaurants') : t('allRestaurants')} ({filteredStores.length})
              </h2>

              {/* Restaurants Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Une seule vitrine désormais, à l'adresse lisible. */}
                {filteredStores.map((store) => (
                  <Link key={store.id} href={`/store/${store.slug}`}>
                    <div className="bg-gray-800 rounded-lg overflow-hidden hover:shadow-xl transition transform hover:scale-105 cursor-pointer h-full">
                      {/* Le logo du commerce ; à défaut, son initiale. */}
                      <div className="relative bg-gradient-to-r from-orange-500 to-red-500 h-40 flex items-center justify-center">
                        {store.settings?.logo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={store.settings.logo}
                            alt={store.name}
                            className="absolute inset-0 h-full w-full object-contain p-4"
                          />
                        ) : (
                          <div className="text-center">
                            <div className="text-white text-4xl font-bold opacity-50">{store.name.charAt(0)}</div>
                          </div>
                        )}

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
                          {store.totalRatings && store.rating != null ? (
                            <>
                              <div className="flex items-center gap-1">
                                <Star size={16} className="text-yellow-500 fill-yellow-500" />
                                <span className="text-white font-semibold">
                                  {store.rating.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                </span>
                              </div>
                              <span className="text-gray-500 text-sm">({store.totalRatings} {t('reviews')})</span>
                              {store.satisfactionPercentage != null && (
                                <span className="text-green-400 text-sm font-semibold">
                                  👍 {store.satisfactionPercentage}%
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-gray-500 text-sm">{t('noReviewsYet')}</span>
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

                          {(store.livraison?.deliveryMinutes != null || store.estimatedDeliveryTime) && (
                            <div className="flex items-center gap-2 text-gray-400">
                              <Clock size={14} />
                              <span>
                                {store.livraison?.deliveryMinutes != null
                                  ? `${store.livraison.deliveryMinutes} min`
                                  : store.estimatedDeliveryTime}
                              </span>
                            </div>
                          )}

                          {store.distance && (
                            <div className="text-gray-400">
                              📍 {store.distance} km
                            </div>
                          )}
                        </div>

                        {/* Delivery Cost */}
                        {/* Les frais jusqu'à l'adresse retenue ; à défaut, le
                            forfait de la boutique. */}
                        {store.livraison ? (
                          <div className="mt-3 pt-3 border-t border-gray-700 text-sm">
                            {store.livraison.livrable ? (
                              <>
                                <span className="text-orange-400 font-semibold">
                                  {store.livraison.frais > 0
                                    ? `${t('deliveryFee')} ${euro(store.livraison.frais)}`
                                    : t('freeDelivery')}
                                </span>
                                {store.livraison.minimum > 0 && (
                                  <span className="text-gray-400">
                                    {' '}· {t('minimum')} {euro(store.livraison.minimum)}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-amber-400 font-semibold">{t('notDelivered')}</span>
                            )}
                          </div>
                        ) : (
                          store.deliveryCost !== undefined && (
                            <div className="mt-3 pt-3 border-t border-gray-700">
                              <span className="text-orange-400 font-semibold">
                                {t('fees')} {euro(store.deliveryCost)}
                              </span>
                            </div>
                          )
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
