'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MapPin, Clock, DollarSign, Package, CheckCircle, AlertCircle } from 'lucide-react';
import { euro } from '@/lib/format';

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
  createdAt?: string;
}

export default function DriverDeliveriesPage() {
  const router = useRouter();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'accepted' | 'completed'>('all');

  useEffect(() => {
    loadDeliveries();
  }, [filter]);

  const loadDeliveries = async () => {
    const token = localStorage.getItem('driverToken');
    if (!token) {
      router.push('/driver/login');
      return;
    }

    try {
      setLoading(true);
      let query = '';

      if (filter === 'accepted') {
        query = '?status=ACCEPTED,PICKED_UP';
      } else if (filter === 'completed') {
        query = '?status=DELIVERED';
      }

      const response = await fetch(`${API_URL}/api/drivers/deliveries${query}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setDeliveries(data.data || []);
      } else if (response.status === 401) {
        router.push('/driver/login');
      }
    } catch (err) {
      console.error('Error loading deliveries:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { bg: string; text: string; icon: any }> = {
      PENDING: { bg: 'bg-yellow-900', text: 'text-yellow-400', icon: Clock },
      ACCEPTED: { bg: 'bg-blue-900', text: 'text-blue-400', icon: Package },
      PICKED_UP: { bg: 'bg-purple-900', text: 'text-purple-400', icon: MapPin },
      DELIVERED: { bg: 'bg-green-900', text: 'text-green-400', icon: CheckCircle },
      FAILED: { bg: 'bg-red-900', text: 'text-red-400', icon: AlertCircle },
    };

    const config = statusMap[status] || statusMap.PENDING;
    const Icon = config.icon;

    return (
      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${config.bg} ${config.text}`}>
        <Icon size={16} />
        <span className="text-sm font-semibold">
          {status === 'PENDING' && 'En attente'}
          {status === 'ACCEPTED' && 'Acceptée'}
          {status === 'PICKED_UP' && 'En cours'}
          {status === 'DELIVERED' && 'Livrée'}
          {status === 'FAILED' && 'Échouée'}
        </span>
      </div>
    );
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/driver">
              <button className="p-2 hover:bg-gray-700 rounded-lg transition">
                <ArrowLeft size={20} className="text-gray-400" />
              </button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-white">Mes livraisons</h1>
              <p className="text-gray-400 text-sm">Historique de vos courses</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Filter Tabs */}
        <div className="flex gap-3 mb-8">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg font-semibold transition ${
              filter === 'all'
                ? 'bg-orange-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Toutes ({deliveries.length})
          </button>
          <button
            onClick={() => setFilter('accepted')}
            className={`px-4 py-2 rounded-lg font-semibold transition ${
              filter === 'accepted'
                ? 'bg-orange-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            En cours
          </button>
          <button
            onClick={() => setFilter('completed')}
            className={`px-4 py-2 rounded-lg font-semibold transition ${
              filter === 'completed'
                ? 'bg-orange-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Complétées
          </button>
        </div>

        {/* Deliveries List */}
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-400">Chargement...</p>
            </div>
          </div>
        ) : deliveries.length === 0 ? (
          <div className="bg-gray-800 rounded-lg p-12 text-center">
            <Package size={48} className="mx-auto text-gray-600 mb-4" />
            <p className="text-white text-lg mb-2">Aucune livraison</p>
            <p className="text-gray-400">
              {filter === 'all' && 'Vous n\'avez pas de livraison pour le moment'}
              {filter === 'accepted' && 'Vous n\'avez pas de livraison en cours'}
              {filter === 'completed' && 'Vous n\'avez pas encore complété de livraison'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {deliveries.map((delivery) => (
              <Link key={delivery.id} href={`/driver/deliveries/${delivery.id}`}>
                <div className="bg-gray-800 rounded-lg p-6 hover:bg-gray-750 transition cursor-pointer border border-gray-700 hover:border-orange-600">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
                    {/* Order Info */}
                    <div className="md:col-span-2">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="text-gray-400 text-sm">Commande</p>
                          <p className="text-white font-semibold text-lg">#{delivery.orderId.slice(0, 12)}</p>
                        </div>
                        {getStatusBadge(delivery.status)}
                      </div>

                      <div className="space-y-3 mt-4">
                        <div className="flex items-start gap-2">
                          <MapPin size={16} className="text-orange-500 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-gray-400 text-xs">À récupérer</p>
                            <p className="text-white text-sm">{delivery.pickupAddress}</p>
                          </div>
                        </div>

                        <div className="flex items-start gap-2">
                          <MapPin size={16} className="text-green-500 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-gray-400 text-xs">Livrer à</p>
                            <p className="text-white text-sm">{delivery.deliveryAddress}</p>
                          </div>
                        </div>

                        <div className="text-gray-400 text-sm">
                          <p>{delivery.customerName} • {delivery.customerPhone}</p>
                        </div>
                      </div>
                    </div>

                    {/* Details */}
                    <div className="space-y-3">
                      {delivery.distance && (
                        <div className="bg-gray-700 rounded-lg p-3">
                          <p className="text-gray-400 text-xs mb-1">Distance</p>
                          <p className="text-white font-semibold">{delivery.distance} km</p>
                        </div>
                      )}

                      {delivery.estimatedTime && (
                        <div className="bg-gray-700 rounded-lg p-3">
                          <p className="text-gray-400 text-xs mb-1">Temps estimé</p>
                          <p className="text-white font-semibold">{delivery.estimatedTime} min</p>
                        </div>
                      )}

                      {delivery.createdAt && (
                        <div className="bg-gray-700 rounded-lg p-3">
                          <p className="text-gray-400 text-xs mb-1">Créée le</p>
                          <p className="text-white font-semibold text-sm">{formatDate(delivery.createdAt)}</p>
                        </div>
                      )}
                    </div>

                    {/* Amount */}
                    <div className="bg-gradient-to-br from-orange-900 to-orange-800 rounded-lg p-4 text-center">
                      <p className="text-orange-300 text-xs mb-1">Montant</p>
                      <p className="text-white text-2xl font-bold">{euro(delivery.totalAmount || 0)}</p>
                      {delivery.status === 'DELIVERED' && (
                        <p className="text-green-400 text-xs mt-2">✓ Complétée</p>
                      )}
                    </div>
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
