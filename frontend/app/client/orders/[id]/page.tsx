'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MapPin, Clock, Phone, AlertCircle, Wifi, WifiOff } from 'lucide-react';
import { useOrderTracking } from '@/lib/use-order-tracking';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Order {
  id: string;
  status: string;
  totalAmount: number;
  deliveryAddress: string;
  createdAt: string;
  items?: any[];
}

interface OrderDelivery {
  id: string;
  status: string;
  estimatedTime?: string;
  actualTime?: string;
  latitude?: number;
  longitude?: number;
  driver?: {
    id: string;
    name: string;
    phone: string;
    vehicleType: string;
    rating: number;
  };
}

export default function OrderTrackingPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;

  const { orderStatus, deliveryLocation, eta, isConnected } = useOrderTracking(orderId);

  const [order, setOrder] = useState<Order | null>(null);
  const [delivery, setDelivery] = useState<OrderDelivery | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadOrderData();
  }, [orderId]);

  // Update order status when WebSocket status changes
  useEffect(() => {
    if (orderStatus && order) {
      setOrder(prev => prev ? { ...prev, status: orderStatus } : null);
    }
  }, [orderStatus]);

  const loadOrderData = async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      router.push('/login');
      return;
    }

    try {
      const orderResponse = await fetch(`${API_URL}/api/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (orderResponse.ok) {
        const orderData = await orderResponse.json();
        setOrder(orderData.data);
      } else if (orderResponse.status === 404) {
        setError('Commande non trouvée');
      }

      const deliveryResponse = await fetch(`${API_URL}/api/deliveries/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (deliveryResponse.ok) {
        const deliveryData = await deliveryResponse.json();
        setDelivery(deliveryData.data);
      }

      setLoading(false);
    } catch (err) {
      console.error('Error loading order:', err);
      setError('Erreur lors du chargement de la commande');
      setLoading(false);
    }
  };

  const getStatusInfo = (status: string) => {
    const statuses: Record<string, { label: string; color: string; icon: string }> = {
      PENDING: { label: 'En attente', color: 'yellow', icon: '⏳' },
      CONFIRMED: { label: 'Confirmée', color: 'blue', icon: '✓' },
      PREPARING: { label: 'En préparation', color: 'orange', icon: '👨‍🍳' },
      READY: { label: 'Prête', color: 'green', icon: '📦' },
      PICKED_UP: { label: 'En route', color: 'purple', icon: '🚗' },
      DELIVERED: { label: 'Livrée', color: 'green', icon: '✓✓' },
      CANCELLED: { label: 'Annulée', color: 'red', icon: '✗' },
    };
    return statuses[status] || { label: status, color: 'gray', icon: '?' };
  };

  const getProgressPercentage = () => {
    if (!order) return 0;
    const statuses = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'PICKED_UP', 'DELIVERED'];
    const currentIndex = statuses.indexOf(order.status);
    return currentIndex >= 0 ? ((currentIndex + 1) / statuses.length) * 100 : 0;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-white text-lg mb-4">Chargement de la commande...</p>
          <div className="w-12 h-12 border-4 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900">
        <header className="bg-gray-800 border-b border-gray-700">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <Link href="/client/orders" className="flex items-center gap-2 text-orange-500 hover:text-orange-400">
              <ArrowLeft size={20} />
              Retour aux commandes
            </Link>
          </div>
        </header>
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="bg-red-900 border border-red-700 rounded-lg p-4 text-red-200 flex items-center gap-3">
            <AlertCircle size={24} />
            <div>
              <p className="font-semibold mb-1">Erreur</p>
              <p>{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!order) return null;

  const statusInfo = getStatusInfo(order.status);
  const progress = getProgressPercentage();

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <Link href="/client/orders" className="flex items-center gap-2 text-orange-500 hover:text-orange-400 mb-4">
            <ArrowLeft size={20} />
            Retour aux commandes
          </Link>
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-white">Commande #{order.id.slice(0, 8)}</h1>
              <p className="text-gray-400">
                {new Date(order.createdAt).toLocaleString('fr-FR')}
              </p>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-gray-700 rounded-lg">
              {isConnected ? (
                <>
                  <Wifi size={16} className="text-green-500 animate-pulse" />
                  <span className="text-green-400 text-sm">En direct</span>
                </>
              ) : (
                <>
                  <WifiOff size={16} className="text-orange-500" />
                  <span className="text-orange-400 text-sm">Hors ligne</span>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Order Status */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-bold text-white mb-6">Statut de la commande</h2>

              {/* Status Badge */}
              <div className="mb-6 p-4 bg-gray-700 rounded-lg">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-3xl">{statusInfo.icon}</span>
                  <div>
                    <p className="text-gray-400 text-sm">Statut actuel</p>
                    <p className="text-white text-xl font-semibold">{statusInfo.label}</p>
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mb-6">
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-orange-500 to-red-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
              </div>

              {/* Timeline */}
              <div className="space-y-4">
                {['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'PICKED_UP', 'DELIVERED'].map((status, index) => {
                  const completed = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'PICKED_UP', 'DELIVERED'].indexOf(order.status) >= index;
                  return (
                    <div key={status} className="flex items-center gap-4">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                          completed ? 'bg-orange-600 text-white' : 'bg-gray-700 text-gray-400'
                        }`}
                      >
                        {index + 1}
                      </div>
                      <p className={`font-semibold ${completed ? 'text-white' : 'text-gray-500'}`}>
                        {getStatusInfo(status).label}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Delivery Location */}
            {deliveryLocation && (
              <div className="bg-gray-800 rounded-lg p-6">
                <h2 className="text-xl font-bold text-white mb-4">Localisation du livreur</h2>
                <div className="bg-gray-700 rounded-lg p-4 text-center">
                  <p className="text-gray-400 mb-2">Coordonnées GPS</p>
                  <p className="text-white font-monospace text-sm">
                    {deliveryLocation.latitude.toFixed(4)}, {deliveryLocation.longitude.toFixed(4)}
                  </p>
                  {eta && (
                    <div className="mt-4 p-3 bg-orange-900 rounded-lg">
                      <p className="text-orange-200">
                        ⏱️ Arrivée estimée: <span className="font-bold">{eta} minutes</span>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Driver Info */}
            {delivery?.driver && (
              <div className="bg-gray-800 rounded-lg p-6">
                <h2 className="text-xl font-bold text-white mb-4">Information du livreur</h2>

                <div className="bg-gray-700 rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white font-semibold">{delivery.driver.name}</p>
                      <p className="text-gray-400 text-sm">{delivery.driver.vehicleType}</p>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-orange-500">{delivery.driver.rating}</div>
                      <p className="text-gray-400 text-xs">⭐ Note</p>
                    </div>
                  </div>

                  <div className="space-y-2 pt-4 border-t border-gray-600">
                    <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition flex items-center justify-center gap-2">
                      <Phone size={18} />
                      Appeler le livreur
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Order Items */}
            {order.items && order.items.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-6">
                <h2 className="text-xl font-bold text-white mb-4">Articles commandés</h2>

                <div className="space-y-3">
                  {order.items.map((item: any) => (
                    <div key={item.id} className="flex justify-between items-center p-3 bg-gray-700 rounded">
                      <div>
                        <p className="text-white font-semibold">{item.name}</p>
                        <p className="text-gray-400 text-sm">x{item.quantity}</p>
                      </div>
                      <p className="text-orange-400 font-bold">
                        €{((item.price * item.quantity) / 100).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-gray-800 rounded-lg p-6 sticky top-8 space-y-6">
              {/* Delivery Address */}
              <div>
                <p className="text-gray-400 text-sm mb-2">Adresse de livraison</p>
                <div className="flex gap-2 text-white">
                  <MapPin size={20} className="text-orange-500 flex-shrink-0 mt-0.5" />
                  <p className="font-semibold">{order.deliveryAddress}</p>
                </div>
              </div>

              {/* ETA */}
              {eta && (
                <div className="p-4 bg-orange-900 rounded-lg">
                  <p className="text-orange-200 text-sm mb-1">Temps estimé</p>
                  <p className="text-white text-2xl font-bold flex items-center gap-2">
                    <Clock size={24} />
                    {eta} min
                  </p>
                </div>
              )}

              {/* Order Total */}
              <div className="pt-4 border-t border-gray-700">
                <p className="text-gray-400 text-sm mb-2">Total</p>
                <p className="text-white text-2xl font-bold">
                  €{(order.totalAmount / 100).toFixed(2)}
                </p>
              </div>

              {/* Help */}
              <button className="w-full bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 rounded-lg transition">
                Besoin d'aide ?
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
