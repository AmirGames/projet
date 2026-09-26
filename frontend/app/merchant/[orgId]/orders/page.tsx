'use client';

import { signalerErreur } from '@/lib/erreurs';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Clock, CheckCircle, AlertCircle, Package, Eye, Truck } from 'lucide-react';
import Link from 'next/link';

import { useCurrentStore } from '@/lib/current-store';
import { ReponseCommande } from '@/components/ReponseCommande';
import { EVENEMENT_COMMANDES_CHANGEES } from '@/lib/reponse-commande';
import { useDonneesModifiees } from '@/lib/temps-reel';

import { euro } from '@/lib/format';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import { useParametreAdresse } from '@/lib/navigateur';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  price: number;
  product: {
    name: string;
    sku: string;
  };
}

interface Order {
  id: string;
  customerName: string;
  customerEmail: string;
  totalAmount: number;
  status: string;
  paymentStatus: string;
  deliveryType: string;
  /** Qui livre, figé à la commande : OWN (le commerçant) ou PLATFORM. */
  deliveryMode?: 'OWN' | 'PLATFORM' | null;
  items: OrderItem[];
  createdAt: string;
  customerPhone?: string | null;
  pickupTime?: string | null;
  /** L'heure limite pour répondre, tant que la commande est en attente. */
  echeance?: string | null;
  estimatedReadyAt?: string | null;
  preparationMinutes?: number | null;
  rejectionReason?: string | null;
  rejectionNote?: string | null;
  /** La course, créée dès que la commande passe « En préparation ». */
  delivery?: {
    status: string;
    driverId?: string | null;
    driver?: { name?: string | null; phone?: string | null } | null;
  } | null;
}

type OrderStatus = 'PENDING' | 'ACCEPTED' | 'PREPARING' | 'REJECTED' | 'READY' | 'COMPLETED';

const statusColors: Record<string, string> = {
  PENDING: 'bg-yellow-600/20 text-yellow-400 border-yellow-600/50',
  ACCEPTED: 'bg-blue-600/20 text-blue-400 border-blue-600/50',
  PREPARING: 'bg-orange-600/20 text-orange-400 border-orange-600/50',
  READY: 'bg-green-600/20 text-green-400 border-green-600/50',
  COMPLETED: 'bg-purple-600/20 text-purple-400 border-purple-600/50',
  REJECTED: 'bg-red-600/20 text-red-400 border-red-600/50',
};

const statusIcons: Record<string, any> = {
  PENDING: Clock,
  ACCEPTED: CheckCircle,
  PREPARING: Clock,
  READY: Package,
  COMPLETED: CheckCircle,
  REJECTED: AlertCircle,
};

/** Explique au commerçant pourquoi aucun livreur n'est listé. */
function expliquerAbsence(
  d: { total: number; actifs: number; enLigne: number; libres: number; localises: number; plusProcheKm: number | null } | undefined,
  rayon?: number
): string | null {
  if (!d) return null;
  if (d.total === 0) return "Aucun livreur n'est inscrit sur la plateforme.";
  if (d.actifs === 0) return `${d.total} livreur(s) inscrit(s), mais aucun dossier validé (statut ACTIVE) par la plateforme.`;
  if (d.enLigne === 0) return `Aucun livreur n'est en ligne. Le livreur doit activer « En ligne » dans son espace.`;
  if (d.libres === 0) return `${d.enLigne} livreur(s) en ligne, mais tous sont déjà en course.`;
  if (d.localises === 0) return `${d.libres} livreur(s) en ligne, mais aucun n'envoie sa position (localisation refusée ou signal GPS perdu). Le livreur doit garder l'application ouverte avec la localisation autorisée.`;
  if (d.plusProcheKm != null) return `Le livreur le plus proche est à ${d.plusProcheKm.toFixed(1)} km, au-delà du rayon de ${rayon ?? '?'} km.`;
  return null;
}

export default function OrdersPage() {
  const t = useTranslations('merchantOrders');
  const { storeId } = useCurrentStore();
  const params = useParams();
  const router = useRouter();
  const orgId = params?.orgId as string;

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  // Le bandeau des nouvelles commandes mène ici, filtré sur celles à accepter
  // (?filtre=PENDING) ; un filtre choisi dans la page l'emporte.
  const filtreAdresse = useParametreAdresse('filtre') === 'PENDING' ? 'PENDING' : 'ALL';
  const [filtreChoisi, setFilter] = useState<OrderStatus | 'ALL' | null>(null);
  const filter = filtreChoisi ?? filtreAdresse;
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<any>(null);
  const [useOwnDelivery, setUseOwnDelivery] = useState(false);
  const [showDeliveryModal, setShowDeliveryModal] = useState<string | null>(null);
  const [availableDeliveryMen, setAvailableDeliveryMen] = useState<any[]>([]);
  const [driversDiagnostic, setDriversDiagnostic] = useState<string | null>(null);
  const [dispatchMessage, setDispatchMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [loadingDeliveryMen, setLoadingDeliveryMen] = useState(false);

  const itemsPerPage = 20;

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
      if (!token) {
        router.push('/login');
        return;
      }

      const skip = page * itemsPerPage;
      const query = new URLSearchParams({
        skip: skip.toString(),
        take: itemsPerPage.toString(),
        ...(filter !== 'ALL' && { status: filter }),
      });

      const response = await fetch(`${API_URL}/order-management/${storeId}?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch orders');
      }

      const data = await response.json();
      setOrders(data.data || []);
      setTotal(data.total || 0);
    } catch (error) {
      signalerErreur('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  }, [filter, page, router, storeId]);

  const fetchStats = useCallback(async () => {
    try {
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');

      const response = await fetch(`${API_URL}/order-management/${storeId}/stats/overview`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch stats');
      }

      const data = await response.json();
      setStats(data);
    } catch (error) {
      signalerErreur('Error fetching stats:', error);
    }
  }, [storeId]);

  // Ailleurs aussi : un collègue, le livreur, le client, une annulation
  // automatique. La liste suit sans qu'on recharge.
  useDonneesModifiees(
    'orders',
    () => {
      fetchOrders();
      fetchStats();
    },
    { storeId, actif: Boolean(storeId) }
  );

  const fetchDeliverySettings = useCallback(async () => {
    try {
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
      if (!token) return;

      const response = await fetch(`${API_URL}/store-settings/${storeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) return;

      const data = await response.json();
      const settings = data.settings || {};
      const delivery = settings.delivery || {};
      setUseOwnDelivery(delivery.useOwnDelivery || false);
    } catch (error) {
      signalerErreur('Error fetching delivery settings:', error);
    }
  }, [storeId]);

  useEffectChargement(() => {
    if (storeId) {
      fetchOrders();
      fetchStats();
      fetchDeliverySettings();
    }
  }, [storeId, fetchOrders, fetchStats, fetchDeliverySettings]);

  // Une commande arrive, ou quelqu'un y répond : la liste se relit seule.
  useEffect(() => {
    if (!storeId) return;

    const relire = () => {
      fetchOrders();
      fetchStats();
    };

    window.addEventListener(EVENEMENT_COMMANDES_CHANGEES, relire);
    return () => window.removeEventListener(EVENEMENT_COMMANDES_CHANGEES, relire);
  }, [storeId, fetchOrders, fetchStats]);

  const handleCallDelivery = async (orderId: string) => {
    try {
      setLoadingDeliveryMen(true);
      setShowDeliveryModal(orderId);
      setDispatchMessage(null);
      setDriversDiagnostic(null);
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
      if (!token) return;

      // Récupérer la commande pour obtenir le storeId
      const orderResponse = await fetch(`${API_URL}/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!orderResponse.ok) {
        throw new Error('Failed to fetch order');
      }

      const orderData = await orderResponse.json();
      const storeId = orderData.data?.storeId || orderData.storeId;

      if (!storeId) {
        throw new Error('Store ID not found in order');
      }

      // Récupérer la liste des livreurs disponibles (rayon réglé par la plateforme)
      const response = await fetch(
        `${API_URL}/drivers/available?storeId=${storeId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || data?.message || `Erreur ${response.status}`);
      }

      setAvailableDeliveryMen(data.deliveryMen || []);
      if ((data.deliveryMen || []).length === 0) {
        setDriversDiagnostic(expliquerAbsence(data.diagnostic, data.radiusKm));
      }
    } catch (error) {
      signalerErreur('Error fetching available drivers:', error);
      setAvailableDeliveryMen([]);
      setDriversDiagnostic(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingDeliveryMen(false);
    }
  };

  const handleSelectDriver = async (driverId: string | null, orderId: string) => {
    try {
      setDispatchMessage(null);
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
      if (!token) return;

      // Proposer la course au livreur sélectionné (ou au plus proche si aucun
      // n'est désigné, ou s'il n'est plus éligible).
      const response = await fetch(`${API_URL}/orders/${orderId}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(driverId ? { driverId } : {}),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setDispatchMessage({ ok: false, text: data?.error || data?.message || "La course n'a pas pu être proposée." });
        return;
      }

      if (data?.data?.propose === false && !data?.data?.driverId) {
        // Personne n'a reçu la course : le dire au lieu de fermer la fenêtre
        // comme si tout s'était bien passé.
        setDispatchMessage({ ok: false, text: data.message });
        return;
      }

      setShowDeliveryModal(null);
      fetchOrders();
    } catch (error) {
      signalerErreur('Error selecting driver:', error);
      setDispatchMessage({ ok: false, text: 'Serveur injoignable.' });
    }
  };

  const totalPages = Math.ceil(total / itemsPerPage);

  if (loading && orders.length === 0) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
              <p className="text-gray-400">{t('loading')}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-bold">{t('title')}</h1>
            <Link
              href={`/merchant/${orgId}/dashboard`}
              className="text-gray-400 hover:text-gray-300 text-sm"
            >
              {t('backToDashboard')}
            </Link>
          </div>
          <p className="text-gray-400">{t('description')}</p>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-8">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <p className="text-gray-400 text-xs mb-1">{t('statsTotal')}</p>
              <p className="text-2xl font-bold">{stats.totalOrders}</p>
            </div>
            <div className="bg-yellow-600/20 border border-yellow-600/50 rounded-lg p-4">
              <p className="text-yellow-400 text-xs mb-1">{t('statsPending')}</p>
              <p className="text-2xl font-bold text-yellow-400">{stats.pending}</p>
            </div>
            <div className="bg-blue-600/20 border border-blue-600/50 rounded-lg p-4">
              <p className="text-blue-400 text-xs mb-1">{t('statsAccepted')}</p>
              <p className="text-2xl font-bold text-blue-400">{stats.accepted}</p>
            </div>
            <div className="bg-orange-600/20 border border-orange-600/50 rounded-lg p-4">
              <p className="text-orange-400 text-xs mb-1">En préparation</p>
              <p className="text-2xl font-bold text-orange-400">{stats.preparing || 0}</p>
            </div>
            <div className="bg-green-600/20 border border-green-600/50 rounded-lg p-4">
              <p className="text-green-400 text-xs mb-1">{t('statsReady')}</p>
              <p className="text-2xl font-bold text-green-400">{stats.ready}</p>
            </div>
            <div className="bg-purple-600/20 border border-purple-600/50 rounded-lg p-4">
              <p className="text-purple-400 text-xs mb-1">{t('statsCompleted')}</p>
              <p className="text-2xl font-bold text-purple-400">{stats.completed}</p>
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <p className="text-gray-400 text-xs mb-1">{t('statsRevenue')}</p>
              <p className="text-2xl font-bold">{euro(stats.totalRevenue, 0)}</p>
              {/* Ce que le commerçant a encaissé pour les livreurs de la
                  plateforme : hors de son chiffre, à reverser avec la commission. */}
              {stats.platformDeliveryFees > 0 && (
                <p className="text-xs text-amber-300 mt-1">
                  hors {euro(stats.platformDeliveryFees)} de livraison à reverser
                </p>
              )}
              {stats.platformServiceFees > 0 && (
                <p className="text-xs text-amber-300 mt-1">
                  hors {euro(stats.platformServiceFees)} de frais de service à reverser
                </p>
              )}
            </div>
          </div>
        )}

        {/* Filter Buttons */}
        <div className="flex flex-wrap gap-2 mb-6">
          {(['ALL', 'PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED', 'REJECTED'] as const).map(status => (
            <button
              key={status}
              onClick={() => {
                setFilter(status);
                setPage(0);
              }}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === status
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-300 border border-gray-700'
              }`}
            >
              {status === 'ALL' ? t('filterAll') : t(`statusLabel.${status}`)}
            </button>
          ))}
        </div>

        {/* Orders List */}
        <div className="space-y-4">
          {orders.length === 0 ? (
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center text-gray-400">
              {t('empty')}
            </div>
          ) : (
            orders.map((order) => {
              const StatusIcon = statusIcons[order.status];
              return (
                <div
                  key={order.id}
                  className={`bg-gray-800 border rounded-lg p-6 ${
                    order.status === 'PENDING' ? 'border-yellow-500/70' : 'border-gray-700'
                  }`}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Order Info */}
                    <div>
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <p className="text-sm text-gray-400 mb-1">{t('orderNumber', { id: order.id.slice(0, 8) })}</p>
                          <p className="text-lg font-bold">{order.customerName}</p>
                          <p className="text-sm text-gray-400">{order.customerEmail}</p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium border flex items-center gap-1 ${statusColors[order.status]}`}>
                          <StatusIcon size={14} />
                          {t(`statusLabel.${order.status}`)}
                        </span>
                      </div>

                      <div className="text-sm mb-4">
                        <p className="text-gray-400">
                          <span className="font-semibold text-gray-300">{order.items.length}</span> {order.items.length > 1 ? t('orderItems_plural') : t('orderItems_singular')}
                        </p>
                        <p className="text-gray-400">
                          {t('orderAmount')} <span className="text-green-400 font-bold">{euro(order.totalAmount)}</span>
                        </p>
                        <p className="text-gray-400 text-xs mt-2">
                          {new Date(order.createdAt).toLocaleDateString('fr-FR', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>

                      <div className="flex gap-2 flex-wrap">
                        <Link
                          href={`/merchant/${orgId}/orders/${order.id}`}
                          className="px-3 py-1 bg-blue-600/20 text-blue-400 rounded text-xs font-medium hover:bg-blue-600/30 transition-colors"
                        >
                          <Eye size={14} className="inline mr-1" />
                          {t('orderDetails')}
                        </Link>
                        {/* Le livreur de la plateforme est cherché dès « En préparation ».
                            Le bouton ne reste que pour choisir un livreur précis tant
                            que personne n'a accepté. */}
                        {order.deliveryType === 'DELIVERY' &&
                          (order.deliveryMode ? order.deliveryMode === 'PLATFORM' : !useOwnDelivery) &&
                          (order.status === 'PREPARING' || order.status === 'READY') && (
                          order.delivery?.driverId ? (
                            <span className="px-3 py-1 bg-green-600/20 text-green-400 rounded text-xs font-medium">
                              <Truck size={14} className="inline mr-1" />
                              {order.delivery.status === 'PICKED_UP'
                                ? `En route avec ${order.delivery.driver?.name?.split(' ')[0] || 'le livreur'}`
                                : `Livreur trouvé : ${order.delivery.driver?.name?.split(' ')[0] || 'en route'}`}
                            </span>
                          ) : (
                            <>
                              <span className="px-3 py-1 bg-amber-600/20 text-amber-400 rounded text-xs font-medium">
                                🔎 Recherche d&apos;un livreur…
                              </span>
                              <button
                                onClick={() => handleCallDelivery(order.id)}
                                className="px-3 py-1 bg-gray-700 text-gray-300 rounded text-xs font-medium hover:bg-gray-600 transition-colors"
                              >
                                Choisir un livreur
                              </button>
                            </>
                          )
                        )}
                      </div>
                    </div>

                    {/* Répondre à la commande, puis la faire avancer. */}
                    <div>
                      <p className="text-sm font-semibold text-gray-300 mb-3">
                        {order.status === 'PENDING' ? 'Nouvelle commande' : t('statusChange')}
                      </p>
                      {storeId && (
                        <ReponseCommande
                          storeId={storeId}
                          commande={order}
                          surChangement={() => {
                            fetchOrders();
                            fetchStats();
                          }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-8 px-6 py-4 bg-gray-800 border border-gray-700 rounded-lg">
            <p className="text-sm text-gray-400">
              {t('paginationPage', { page: page + 1, totalPages })}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-700/50 disabled:text-gray-600 rounded transition-colors"
              >
                {t('paginationPrev')}
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page === totalPages - 1}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-700/50 disabled:text-gray-600 rounded transition-colors"
              >
                {t('paginationNext')}
              </button>
            </div>
          </div>
        )}

        {/* Delivery Modal */}
        {showDeliveryModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 border border-gray-700 rounded-lg max-w-md w-full">
              <div className="p-6 border-b border-gray-700">
                <h2 className="text-xl font-bold text-gray-100">Livreurs disponibles</h2>
                <p className="text-sm text-gray-400 mt-1">Sélectionnez un livreur à proximité</p>
              </div>

              <div className="p-6">
                {loadingDeliveryMen ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mx-auto mb-2"></div>
                    <p className="text-gray-400 text-sm">Recherche de livreurs...</p>
                  </div>
                ) : availableDeliveryMen.length === 0 ? (
                  <div className="space-y-3">
                    <div className="bg-red-600/20 border border-red-600/50 rounded-lg p-4 text-center">
                      <p className="text-red-400 text-sm">Aucun livreur disponible à proximité</p>
                      {driversDiagnostic && (
                        <p className="text-gray-300 text-xs mt-2">{driversDiagnostic}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleSelectDriver(null, showDeliveryModal)}
                      className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors"
                    >
                      Relancer la recherche automatique
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {availableDeliveryMen.map((delivery) => (
                      <button
                        key={delivery.id}
                        onClick={() => handleSelectDriver(delivery.id, showDeliveryModal)}
                        className="w-full p-3 text-left bg-gray-700/50 hover:bg-gray-700 border border-gray-600 rounded-lg transition-colors"
                      >
                        <p className="font-medium text-gray-100">{delivery.name}</p>
                        <p className="text-xs text-gray-400">{delivery.phone}</p>
                        <p className="text-xs text-green-400 mt-1">Distance: {delivery.distance?.toFixed(1)} km</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {dispatchMessage && (
                <div className="px-6 pb-2">
                  <p className={`text-sm ${dispatchMessage.ok ? 'text-green-400' : 'text-amber-400'}`}>
                    {dispatchMessage.text}
                  </p>
                </div>
              )}

              <div className="p-6 border-t border-gray-700 flex gap-2 justify-end">
                <button
                  onClick={() => { setShowDeliveryModal(null); setDispatchMessage(null); }}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
