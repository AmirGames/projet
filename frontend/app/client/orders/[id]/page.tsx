'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MapPin, Clock, Phone, MessageCircle, AlertCircle } from 'lucide-react';

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

  const [order, setOrder] = useState<Order | null>(null);
  const [delivery, setDelivery] = useState<OrderDelivery | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    loadOrderData();
  }, [orderId]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadOrderData();
    }, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, orderId]);

  const loadOrderData = async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      router.push('/login');
      return;
    }

    try {
      // Get order details
      const orderResponse = await fetch(`${API_URL}/api/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (orderResponse.ok) {
        const orderData = await orderResponse.json();
        setOrder(orderData.data);
      } else if (orderResponse.status === 404) {
        setError('Commande non trouvée');
      }

      // Get delivery tracking
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
      READY: { label: 'Prête à être livrée', color: 'green', icon: '📦' },
      PICKED_UP: { label: 'Livreur en route', color: 'purple', icon: '🚗' },
      DELIVERED: { label: 'Livrée', color: 'green', icon: '✓✓' },
      CANCELLED: { label: 'Annulée', color: 'red', icon: '✗' }
    };

    return statuses[status] || { label: status, color: 'gray', icon: '?' };
  };

  const deliveryStatusInfo = getStatusInfo(delivery?.status || 'PENDING');
  const orderStatusInfo = getStatusInfo(order?.status || 'PENDING');

  const progressSteps = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'PICKED_UP', 'DELIVERED'];
  const currentStep = order?.status ? progressSteps.indexOf(order.status) : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <p className="text-white text-lg">Chargement de la commande...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900">
        <header className="bg-gray-800 border-b border-gray-700">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <Link href="/client" className="flex items-center gap-2 text-orange-500 hover:text-orange-400">
              <ArrowLeft size={20} />
              Retour
            </Link>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-4 py-20 text-center">
          <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
          <p className="text-white text-xl">{error}</p>
        </div>
      </div>
    );
  }

  if (!order) return null;

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/client" className="flex items-center gap-2 text-orange-500 hover:text-orange-400">
            <ArrowLeft size={20} />
            Mes commandes
          </Link>
          <h1 className="text-white font-bold text-lg">Commande #{orderId.slice(0, 8)}</h1>
          <div className="w-20"></div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Order Status */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-bold text-white mb-6">État de la commande</h2>

              {/* Status Badge */}
              <div className="mb-6 p-4 bg-gradient-to-r from-gray-700 to-gray-600 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="text-4xl">{orderStatusInfo.icon}</span>
                  <div>
                    <p className="text-gray-400 text-sm">Status actuel</p>
                    <p className={`text-2xl font-bold text-${orderStatusInfo.color}-400`}>
                      {orderStatusInfo.label}
                    </p>
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mb-6">
                <div className="flex justify-between mb-3">
                  {progressSteps.map((step, index) => (
                    <div
                      key={step}
                      className={`flex flex-col items-center flex-1 ${
                        index > 0 ? 'ml-2' : ''
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold mb-2 transition ${
                          index <= currentStep
                            ? 'bg-orange-600 text-white'
                            : 'bg-gray-700 text-gray-400'
                        }`}
                      >
                        {index + 1}
                      </div>
                      <p className="text-xs text-gray-400 text-center line-clamp-2">
                        {getStatusInfo(step).label}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Progress Line */}
                <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-600 transition-all duration-500"
                    style={{
                      width: `${((currentStep + 1) / progressSteps.length) * 100}%`
                    }}
                  ></div>
                </div>
              </div>

              {/* Order Details */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-700 p-4 rounded-lg">
                  <p className="text-gray-400 text-sm mb-1">Commande passée</p>
                  <p className="text-white font-semibold">
                    {new Date(order.createdAt).toLocaleString('fr-FR')}
                  </p>
                </div>

                {delivery?.estimatedTime && (
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <p className="text-gray-400 text-sm mb-1">Livraison estimée</p>
                    <p className="text-white font-semibold flex items-center gap-2">
                      <Clock size={16} />
                      {delivery.estimatedTime}
                    </p>
                  </div>
                )}

                <div className="bg-gray-700 p-4 rounded-lg col-span-2">
                  <p className="text-gray-400 text-sm mb-1 flex items-center gap-2">
                    <MapPin size={16} />
                    Adresse de livraison
                  </p>
                  <p className="text-white font-semibold">{order.deliveryAddress}</p>
                </div>
              </div>
            </div>

            {/* Driver Information */}
            {delivery?.driver && (
              <div className="bg-gray-800 rounded-lg p-6">
                <h2 className="text-xl font-bold text-white mb-4">Votre livreur</h2>

                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-white font-bold text-lg">{delivery.driver.name}</p>
                    <p className="text-gray-400 text-sm">{delivery.driver.vehicleType}</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-500">⭐ {delivery.driver.rating}</div>
                    <p className="text-gray-400 text-xs">Note moyenne</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <a
                    href={`tel:${delivery.driver.phone}`}
                    className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg text-center"
                  >
                    <Phone size={16} className="inline mr-2" />
                    Appeler le livreur
                  </a>
                  <button className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg">
                    <MessageCircle size={16} className="inline mr-2" />
                    Envoyer un message
                  </button>
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
                        <p className="text-white font-semibold">{item.productName}</p>
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

          {/* Summary Sidebar */}
          <div className="lg:col-span-1">
            {/* Map Placeholder */}
            <div className="bg-gradient-to-br from-orange-600 to-red-600 rounded-lg h-64 flex items-center justify-center mb-6">
              <div className="text-center">
                <MapPin size={48} className="mx-auto text-white mb-2 opacity-50" />
                <p className="text-white">Carte GPS</p>
                <p className="text-orange-100 text-sm">(À implémenter avec Google Maps/Mapbox)</p>
              </div>
            </div>

            {/* Order Summary */}
            <div className="bg-gray-800 rounded-lg p-6 sticky top-24">
              <h2 className="text-xl font-bold text-white mb-4">Récapitulatif</h2>

              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-gray-400">
                  <span>Sous-total</span>
                  <span>€{((order.totalAmount * 0.85) / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Livraison</span>
                  <span>€{((order.totalAmount * 0.15) / 100).toFixed(2)}</span>
                </div>
              </div>

              <div className="border-t border-gray-600 pt-4">
                <div className="flex justify-between text-white text-lg font-bold">
                  <span>Total</span>
                  <span className="text-orange-500">€{(order.totalAmount / 100).toFixed(2)}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 space-y-2">
                {order.status !== 'DELIVERED' && order.status !== 'CANCELLED' && (
                  <button className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg text-sm">
                    Annuler la commande
                  </button>
                )}

                <button className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg text-sm">
                  Contacter le support
                </button>
              </div>

              {/* Auto-refresh Toggle */}
              <label className="flex items-center gap-2 mt-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-gray-400 text-sm">Mise à jour auto</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
