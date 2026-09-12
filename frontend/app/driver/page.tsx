'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MapPin, Package, Clock, DollarSign, LogOut, Fuel, Navigation2 } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Delivery {
  id: string;
  orderId: string;
  status: 'PENDING' | 'ACCEPTED' | 'PICKED_UP' | 'DELIVERED' | 'FAILED';
  estimatedTime?: number;
  pickupAddress: string;
  deliveryAddress: string;
  customerName: string;
  customerPhone: string;
  distance?: number;
  totalAmount?: number;
  items?: any[];
}

interface Driver {
  id: string;
  name: string;
  phone: string;
  rating: number;
  totalEarnings: number;
  completedDeliveries: number;
  isAvailable: boolean;
  currentLocation?: { latitude: number; longitude: number };
}

export default function DriverDashboard() {
  const router = useRouter();
  const [driver, setDriver] = useState<Driver | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDelivery, setActiveDelivery] = useState<Delivery | null>(null);
  const [isAvailable, setIsAvailable] = useState(true);
  const [earnings, setEarnings] = useState(0);

  useEffect(() => {
    loadDriverData();
  }, []);

  const loadDriverData = async () => {
    const token = localStorage.getItem('driverToken');
    if (!token) {
      router.push('/driver/login');
      return;
    }

    try {
      // Load driver info
      const driverResponse = await fetch(`${API_URL}/api/drivers/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (driverResponse.ok) {
        const driverData = await driverResponse.json();
        setDriver(driverData.data);
        setEarnings(driverData.data.totalEarnings || 0);
      } else {
        throw new Error('Failed to load driver info');
      }

      // Load available deliveries
      const deliveriesResponse = await fetch(
        `${API_URL}/api/drivers/deliveries?status=PENDING`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (deliveriesResponse.ok) {
        const deliveriesData = await deliveriesResponse.json();
        setDeliveries(deliveriesData.data || []);
      }

      setLoading(false);
    } catch (err) {
      console.error('Error loading driver data:', err);
      router.push('/driver/login');
    }
  };

  const handleAcceptDelivery = async (delivery: Delivery) => {
    const token = localStorage.getItem('driverToken');
    if (!token) return;

    try {
      const response = await fetch(`${API_URL}/api/drivers/deliveries/${delivery.id}/accept`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      if (response.ok) {
        setActiveDelivery(delivery);
        setDeliveries(deliveries.filter(d => d.id !== delivery.id));
      }
    } catch (err) {
      console.error('Error accepting delivery:', err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('driverToken');
    router.push('/driver/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-white text-lg">Chargement...</p>
          <div className="w-12 h-12 border-4 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto mt-4"></div>
        </div>
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-white text-lg mb-4">Erreur de chargement</p>
          <button
            onClick={() => router.push('/driver/login')}
            className="bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2 px-4 rounded-lg"
          >
            Se connecter
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-white">Tableau de bord livreur</h1>
              <p className="text-gray-400">Bienvenue, {driver.name}</p>
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition"
            >
              <LogOut size={18} />
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Note</p>
                <p className="text-white text-3xl font-bold">{driver.rating}</p>
              </div>
              <div className="text-4xl">⭐</div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Revenus du jour</p>
                <p className="text-white text-3xl font-bold">€{(earnings / 100).toFixed(2)}</p>
              </div>
              <DollarSign size={32} className="text-green-500" />
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Livraisons complétées</p>
                <p className="text-white text-3xl font-bold">{driver.completedDeliveries}</p>
              </div>
              <Package size={32} className="text-blue-500" />
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Statut</p>
                <div className="flex items-center gap-2 mt-2">
                  <div className={`w-3 h-3 rounded-full ${isAvailable ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <p className="text-white font-semibold">{isAvailable ? 'Disponible' : 'Occupé'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Active Delivery */}
          {activeDelivery ? (
            <div className="lg:col-span-2">
              <div className="bg-gray-800 rounded-lg p-6">
                <h2 className="text-xl font-bold text-white mb-6">Livraison en cours</h2>

                <div className="space-y-6">
                  {/* Pickup Location */}
                  <div>
                    <p className="text-orange-500 font-semibold mb-2">À récupérer</p>
                    <div className="bg-gray-700 rounded-lg p-4 flex gap-3">
                      <MapPin size={24} className="text-orange-500 flex-shrink-0" />
                      <div>
                        <p className="text-white font-semibold">{activeDelivery.pickupAddress}</p>
                        <p className="text-gray-400 text-sm">{activeDelivery.customerName}</p>
                      </div>
                    </div>
                  </div>

                  {/* Delivery Location */}
                  <div>
                    <p className="text-green-500 font-semibold mb-2">Livrer à</p>
                    <div className="bg-gray-700 rounded-lg p-4 flex gap-3">
                      <MapPin size={24} className="text-green-500 flex-shrink-0" />
                      <div>
                        <p className="text-white font-semibold">{activeDelivery.deliveryAddress}</p>
                        <p className="text-gray-400 text-sm">{activeDelivery.customerName}</p>
                      </div>
                    </div>
                  </div>

                  {/* Delivery Info */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-700 rounded-lg p-4">
                      <p className="text-gray-400 text-sm mb-2">Distance</p>
                      <p className="text-white text-2xl font-bold">{activeDelivery.distance || 0} km</p>
                    </div>
                    <div className="bg-gray-700 rounded-lg p-4">
                      <p className="text-gray-400 text-sm mb-2">Montant</p>
                      <p className="text-white text-2xl font-bold">€{((activeDelivery.totalAmount || 0) / 100).toFixed(2)}</p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-3 pt-4 border-t border-gray-600">
                    <Link href={`/driver/deliveries/${activeDelivery.id}`} className="block">
                      <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition flex items-center justify-center gap-2">
                        <Navigation2 size={20} />
                        Commencer la livraison
                      </button>
                    </Link>

                    <button className="w-full bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 rounded-lg transition">
                      Appeler le client
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="lg:col-span-2">
              <div className="bg-gray-800 rounded-lg p-6">
                <h2 className="text-xl font-bold text-white mb-6">Livraisons disponibles</h2>

                {deliveries.length === 0 ? (
                  <div className="text-center py-12">
                    <Package size={48} className="mx-auto text-gray-600 mb-4" />
                    <p className="text-white text-lg">Aucune livraison disponible</p>
                    <p className="text-gray-400">Les nouvelles livraisons apparaîtront ici</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {deliveries.map((delivery) => (
                      <div
                        key={delivery.id}
                        className="bg-gray-700 rounded-lg p-4 hover:bg-gray-650 transition cursor-pointer"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <p className="text-white font-semibold">Commande #{delivery.orderId.slice(0, 8)}</p>
                            <p className="text-gray-400 text-sm">{delivery.customerName}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-orange-400 font-bold">€{((delivery.totalAmount || 0) / 100).toFixed(2)}</p>
                            {delivery.distance && (
                              <p className="text-gray-400 text-sm">{delivery.distance} km</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-gray-400 text-sm mb-4">
                          <Clock size={14} />
                          <span>{delivery.estimatedTime || 15} min</span>
                        </div>

                        <button
                          onClick={() => handleAcceptDelivery(delivery)}
                          className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2 rounded-lg transition"
                        >
                          Accepter la livraison
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Driver Info Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-gray-800 rounded-lg p-6 sticky top-8 space-y-6">
              <div>
                <p className="text-gray-400 text-sm mb-2">Profil</p>
                <div className="w-16 h-16 bg-gradient-to-r from-orange-500 to-red-500 rounded-full flex items-center justify-center text-white text-2xl font-bold">
                  {driver.name.charAt(0)}
                </div>
                <p className="text-white font-semibold mt-3">{driver.name}</p>
                <p className="text-gray-400 text-sm">{driver.phone}</p>
              </div>

              <div className="pt-6 border-t border-gray-700 space-y-4">
                <button
                  onClick={() => setIsAvailable(!isAvailable)}
                  className={`w-full font-semibold py-2 rounded-lg transition ${
                    isAvailable
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-white'
                  }`}
                >
                  {isAvailable ? '✓ Disponible' : 'Indisponible'}
                </button>

                <Link href="/driver/earnings" className="block">
                  <button className="w-full bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 rounded-lg transition">
                    Voir les revenus
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
