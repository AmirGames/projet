'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Clock, MapPin, ChevronRight } from 'lucide-react';

import { euro } from '@/lib/format';
import { useDonneesModifiees } from '@/lib/temps-reel';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
interface Order {
  id: string;
  status: string;
  totalAmount: number;
  deliveryAddress: string;
  createdAt: string;
  storeName?: string;
  /** Avis jamais donné, ou vieux de plus de quinze jours. */
  avisARedemander?: boolean;
}

const statusColors: Record<string, string> = {
  PENDING: 'yellow',
  CONFIRMED: 'blue',
  PREPARING: 'orange',
  READY: 'green',
  PICKED_UP: 'purple',
  DELIVERED: 'green',
  CANCELLED: 'red'
};

// Status keys for translation - values will be translated using useTranslations
const statusTranslationKeys: Record<string, string> = {
  PENDING: 'statusPending',
  CONFIRMED: 'statusConfirmed',
  PREPARING: 'statusPreparing',
  READY: 'statusReady',
  PICKED_UP: 'statusPickedUp',
  DELIVERED: 'statusDelivered',
  CANCELLED: 'statusCancelled'
};

export default function OrdersPage() {
  const t = useTranslations('clientOrders');
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');

  // silencieux : une relecture en direct ne vide pas la liste le temps de la
  // réponse.
  const loadOrders = useCallback(async (silencieux = false) => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      router.push('/login');
      return;
    }

    try {
      if (!silencieux) setLoading(true);
      const response = await fetch(`${API_URL}/api/client/me/orders`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setOrders(data.data || []);
      }
    } catch (err) {
      console.error('Error loading orders:', err);
    } finally {
      setLoading(false);
    }
  }, [router]);

  // Acceptée, en route, livrée : chaque étape apparaît sans recharger.
  useDonneesModifiees('orders', () => loadOrders(true));

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const filteredOrders = orders.filter(order => {
    if (filter === 'active') {
      return !['DELIVERED', 'CANCELLED'].includes(order.status);
    }
    if (filter === 'completed') {
      return ['DELIVERED', 'CANCELLED'].includes(order.status);
    }
    return true;
  });

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
        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6">
          {(
            [
              { value: 'all', key: 'all' },
              { value: 'active', key: 'active' },
              { value: 'completed', key: 'completed' }
            ] as const
          ).map(tab => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`px-4 py-2 rounded-lg font-semibold transition ${
                filter === tab.value
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {t(tab.key)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-20">
            <p className="text-white text-lg">{t('loading')}</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-20 bg-gray-800 rounded-lg">
            <p className="text-white text-xl mb-4">{t('noOrders')}</p>
            <Link href="/client" className="text-orange-500 hover:text-orange-400">
              {t('startSearching')}
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredOrders.map(order => {
              const statusKey = statusTranslationKeys[order.status];
              const statusLabel = statusKey ? t(statusKey) : order.status;
              const statusColor = statusColors[order.status] || 'gray';

              return (
                <Link
                  key={order.id}
                  href={`/client/orders/${order.id}`}
                  className="block"
                >
                  <div className="bg-gray-800 rounded-lg p-4 hover:bg-gray-750 hover:shadow-lg transition cursor-pointer">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <p className="text-white font-bold text-lg">
                          Commande #{order.id.slice(0, 8)}
                        </p>
                        <p className="text-gray-400 text-sm flex items-center gap-2 mt-1">
                          <Clock size={14} />
                          {new Date(order.createdAt).toLocaleString('fr-FR')}
                        </p>
                      </div>
                      <ChevronRight size={24} className="text-gray-600" />
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div>
                        <p className="text-gray-400 text-sm mb-1">{t('address')}</p>
                        <p className="text-white flex items-center gap-2">
                          <MapPin size={14} />
                          <span className="line-clamp-1">{order.deliveryAddress}</span>
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-gray-400 text-sm mb-1">{t('amount')}</p>
                        <p className="text-orange-400 font-bold text-lg">
                          {euro(order.totalAmount)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-semibold bg-${statusColor}-900 text-${statusColor}-400 border border-${statusColor}-700`}
                      >
                        {statusLabel}
                      </span>
                      {order.avisARedemander && (
                        <span className="px-3 py-1 rounded-full text-sm font-semibold bg-orange-900 text-orange-300 border border-orange-700">
                          {t('reviewWanted')}
                        </span>
                      )}
                      <span className="text-gray-500 text-xs">
                        {order.storeName && `${order.storeName}`}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
