'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, MapPin, Star, Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface Restaurant {
  id: string;
  name: string;
  /** L'adresse lisible de la vitrine, seule porte d'entrée désormais. */
  slug: string;
  description: string;
  cuisine: string;
  rating: number;
  deliveryTime: number;
  deliveryFee: number;
  imageUrl?: string;
  address: string;
  isOpen: boolean;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function RestaurantsPage() {
  const t = useTranslations('restaurants');
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [filteredRestaurants, setFilteredRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [cuisineFilter, setCuisineFilter] = useState('');

  useEffect(() => {
    fetchRestaurants();
  }, []);

  useEffect(() => {
    filterRestaurants();
  }, [searchTerm, cuisineFilter, restaurants]);

  const fetchRestaurants = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/client/stores`, {
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) throw new Error('Erreur lors du chargement');
      const data = await res.json();

      setRestaurants(
        (data.data || []).map((boutique: any) => ({
          id: boutique.id,
          name: boutique.name,
          // Le lien de la vitrine passe par le slug : sans lui, la carte
          // menait vers /store/undefined.
          slug: boutique.slug,
          description: boutique.description || '',
          cuisine: boutique.city || '',
          rating: Number(boutique.rating || 0),
          deliveryTime: 30,
          deliveryFee: Number(boutique.deliveryCost || 0),
          address: [boutique.address, boutique.city].filter(Boolean).join(', '),
          isOpen: boutique.isOpenNow,
        }))
      );
    } catch (err) {
      console.error('Erreur:', err);
      setRestaurants([]);
    } finally {
      setLoading(false);
    }
  };

  const filterRestaurants = () => {
    let filtered = restaurants;

    if (searchTerm) {
      filtered = filtered.filter(
        (r) =>
          r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          r.description.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (cuisineFilter) {
      filtered = filtered.filter((r) => r.cuisine === cuisineFilter);
    }

    setFilteredRestaurants(filtered);
  };

  const uniqueCuisines = [...new Set(restaurants.map((r) => r.cuisine))];

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-green-700 py-8">
        <div className="max-w-6xl mx-auto px-6">
          <h1 className="text-4xl font-bold mb-4">Découvrez les restaurants</h1>
          <p className="text-green-100">Trouvez vos restaurants préférés et commandez maintenant</p>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="bg-gray-800 border-b border-gray-700 py-6">
        <div className="max-w-6xl mx-auto px-6">
          <div className="space-y-4">
            {/* Search Box */}
            <div className="relative">
              <Search className="absolute left-4 top-3 text-gray-500" size={20} />
              <input
                type="text"
                placeholder="Rechercher un restaurant..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            {/* Cuisine Filter */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setCuisineFilter('')}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  cuisineFilter === ''
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Tous
              </button>
              {uniqueCuisines.map((cuisine) => (
                <button
                  key={cuisine}
                  onClick={() => setCuisineFilter(cuisine)}
                  className={`px-4 py-2 rounded-lg font-medium transition ${
                    cuisineFilter === cuisine
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {cuisine}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="max-w-6xl mx-auto px-6 py-12">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
          </div>
        ) : filteredRestaurants.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg">Aucun restaurant ne correspond à votre recherche</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredRestaurants.map((restaurant) => (
              <Link
                key={restaurant.id}
                href={`/store/${restaurant.slug}`}
                className="group bg-gray-800 rounded-lg overflow-hidden hover:shadow-lg transition transform hover:scale-105"
              >
                {/* Image */}
                <div className="h-48 bg-gradient-to-br from-green-600 to-green-700 relative overflow-hidden">
                  {restaurant.imageUrl ? (
                    <img
                      src={restaurant.imageUrl}
                      alt={restaurant.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-5xl">
                      🍽️
                    </div>
                  )}
                  {!restaurant.isOpen && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <p className="text-white font-bold">Fermé</p>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-4">
                  <h3 className="text-lg font-bold text-white mb-2 group-hover:text-green-400">
                    {restaurant.name}
                  </h3>

                  <p className="text-sm text-gray-400 mb-3 line-clamp-2">
                    {restaurant.description}
                  </p>

                  <div className="space-y-2 mb-3">
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <Star size={16} className="text-yellow-500" />
                      <span>{restaurant.rating.toFixed(1)} / 5</span>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <Clock size={16} />
                      <span>{restaurant.deliveryTime} min</span>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <MapPin size={16} />
                      <span className="truncate">{restaurant.address}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-gray-700">
                    <span className="text-xs text-gray-500">{restaurant.cuisine}</span>
                    <span className="text-sm font-medium text-green-400">
                      {restaurant.deliveryFee > 0 ? `€${restaurant.deliveryFee.toFixed(2)}` : 'Gratuit'}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
