'use client';

import { signalerErreur } from '@/lib/erreurs';
import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Clock, MapPin, ChevronRight, RotateCcw } from 'lucide-react';

import { euro } from '@/lib/format';
import { remettreAuPanier, type LigneCommandee } from '@/lib/recommander';
import { useDonneesModifiees } from '@/lib/temps-reel';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import { numeroCourt } from '@/lib/numero-commande';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
interface Order {
  id: string;
  status: string;
  totalAmount: number;
  deliveryAddress: string | null;
  createdAt: string;
  store?: { id: string; name: string; slug: string } | null;
  items?: LigneCommandee[];
  /** Avis jamais donné, ou vieux de plus de quinze jours. */
  avisARedemander?: boolean;
}

/**
 * Les états d'une commande (enum OrderStatus du serveur). La page attendait
 * DELIVERED et CANCELLED, qui n'existent pas : l'onglet « Terminées » restait
 * vide et les étiquettes affichaient le code brut.
 */
// Classes écrites en entier : Tailwind ne génère pas une classe composée
// à l'exécution (`bg-${couleur}-50`).
const statusColors: Record<string, string> = {
  PENDING: 'bg-yellow-50 text-yellow-800',
  ACCEPTED: 'bg-blue-50 text-blue-700',
  PREPARING: 'bg-orange-50 text-orange-700',
  READY: 'bg-green-50 text-green-700',
  COMPLETED: 'bg-green-50 text-green-700',
  REJECTED: 'bg-red-50 text-red-700'
};

const statusTranslationKeys: Record<string, string> = {
  PENDING: 'statusPending',
  ACCEPTED: 'statusConfirmed',
  PREPARING: 'statusPreparing',
  READY: 'statusReady',
  COMPLETED: 'statusCompleted',
  REJECTED: 'statusRejected'
};

const TERMINEES = ['COMPLETED', 'REJECTED'];

export default function OrdersPage() {
  const t = useTranslations('clientOrders');
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');
  // « Commander à nouveau » : la commande en cours de reprise, et ce qu'on en dit.
  const [reprise, setReprise] = useState<{ orderId: string; message?: string; slug?: string } | null>(null);

  const commanderANouveau = async (e: React.MouseEvent, order: Order) => {
    // Le bouton vit dans le lien de la carte : sans cela, il ouvrirait le détail.
    e.preventDefault();
    e.stopPropagation();
    if (!order.store || !order.items?.length) return;

    setReprise({ orderId: order.id });
    try {
      const { reprises, absents } = await remettreAuPanier(
        order.store.id,
        order.store.name,
        order.store.slug,
        order.items,
      );
      if (reprises === 0) {
        setReprise({ orderId: order.id, message: t('reorderNone') });
      } else if (absents.length > 0) {
        setReprise({
          orderId: order.id,
          slug: order.store.slug,
          message: t('reorderPartial', { n: absents.length, liste: absents.join(', ') }),
        });
      } else {
        router.push(`/store/${order.store.slug}?panier=1`);
      }
    } catch {
      setReprise({ orderId: order.id, message: t('reorderUnavailable') });
    }
  };

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
      signalerErreur('Error loading orders:', err);
    } finally {
      setLoading(false);
    }
  }, [router]);

  // Acceptée, en route, livrée : chaque étape apparaît sans recharger.
  useDonneesModifiees('orders', () => loadOrders(true));

  useEffectChargement(() => {
    loadOrders();
  }, [loadOrders]);

  const filteredOrders = orders.filter(order => {
    if (filter === 'active') {
      return !TERMINEES.includes(order.status);
    }
    if (filter === 'completed') {
      return TERMINEES.includes(order.status);
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="pt-4">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <Link href="/client" className="flex items-center gap-2 text-orange-500 hover:text-orange-600 mb-4">
            <ArrowLeft size={20} />
            {t('back')}
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">{t('title')}</h1>
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
                  : 'bg-white text-gray-500 hover:bg-gray-100'
              }`}
            >
              {t(tab.key)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-20">
            <p className="text-gray-900 text-lg">{t('loading')}</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-20 bg-white ring-1 ring-gray-200 rounded-lg">
            <p className="text-gray-900 text-xl mb-4">{t('noOrders')}</p>
            <Link href="/client" className="text-orange-500 hover:text-orange-600">
              {t('startSearching')}
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredOrders.map(order => {
              const statusKey = statusTranslationKeys[order.status];
              const statusLabel = statusKey ? t(statusKey) : order.status;
              const statusColor = statusColors[order.status] || 'bg-gray-100 text-gray-700';

              return (
                <Link
                  key={order.id}
                  href={`/client/orders/${order.id}`}
                  className="block"
                >
                  <div className="bg-white ring-1 ring-gray-200 rounded-lg p-4 hover:bg-gray-100 hover:shadow-lg transition cursor-pointer">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <p className="text-gray-900 font-bold text-lg">
                          {t('commandeNumero', { numero: numeroCourt(order.id) })}
                        </p>
                        <p className="text-gray-500 text-sm flex items-center gap-2 mt-1">
                          <Clock size={14} />
                          {new Date(order.createdAt).toLocaleString('fr-FR')}
                        </p>
                      </div>
                      <ChevronRight size={24} className="text-gray-400" />
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div>
                        <p className="text-gray-500 text-sm mb-1">{t('address')}</p>
                        <p className="text-gray-900 flex items-center gap-2">
                          <MapPin size={14} />
                          <span className="line-clamp-1">{order.deliveryAddress || t('pickup')}</span>
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-gray-500 text-sm mb-1">{t('amount')}</p>
                        <p className="text-orange-600 font-bold text-lg">
                          {euro(order.totalAmount)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-semibold ${statusColor}`}
                      >
                        {statusLabel}
                      </span>
                      {order.avisARedemander && (
                        <span className="px-3 py-1 rounded-full text-sm font-semibold bg-orange-50 text-orange-700 border border-orange-200">
                          {t('reviewWanted')}
                        </span>
                      )}
                      <span className="text-gray-500 text-xs">
                        {order.store?.name}
                      </span>
                    </div>

                    {TERMINEES.includes(order.status) && order.store && (order.items?.length ?? 0) > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={(e) => commanderANouveau(e, order)}
                          disabled={reprise?.orderId === order.id && !reprise.message}
                          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-sm font-semibold transition"
                        >
                          <RotateCcw size={16} />
                          {reprise?.orderId === order.id && !reprise.message ? t('reordering') : t('reorder')}
                        </button>
                        {reprise?.orderId === order.id && reprise.message && (
                          <p role="status" className="text-sm text-amber-700 flex-1 min-w-[12rem]">
                            {reprise.message}{' '}
                            {reprise.slug && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  router.push(`/store/${reprise.slug}?panier=1`);
                                }}
                                className="underline text-orange-600 hover:text-orange-700"
                              >
                                {t('reorderSeeCart')}
                              </button>
                            )}
                          </p>
                        )}
                      </div>
                    )}
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
