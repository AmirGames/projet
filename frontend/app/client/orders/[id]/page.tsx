'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MapPin, Clock, AlertCircle, Wifi, WifiOff } from 'lucide-react';
import { SuiviLivraison, type Course } from '@/components/SuiviLivraison';
import { useOrderTracking } from '@/lib/use-order-tracking';
import { useDonneesModifiees } from '@/lib/temps-reel';

import { euro } from '@/lib/format';
import { intituleDeLaLigne } from '@/lib/ligne-commande';
import { MOTIFS_POUR_LE_CLIENT, heure } from '@/lib/reponse-commande';

import { useTranslations } from 'next-intl';
import { useEffectChargement } from '@/lib/use-effect-chargement';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Order {
  id: string;
  status: string;
  totalAmount: number;
  /** Les frais de service de la plateforme, compris dans le total. */
  serviceFeeAmount?: number | string;
  /** La taxe figée à la commande, et le taux qui valait ce jour-là. */
  taxAmount?: number | string;
  taxRate?: number | string;
  deliveryAddress: string;
  createdAt: string;
  items?: any[];
  deliveryType?: 'PICKUP' | 'DELIVERY';
  pickupTime?: string | null;
  /** L'heure à laquelle la commande sera prête, annoncée à l'acceptation. */
  estimatedReadyAt?: string | null;
  rejectionReason?: string | null;
  rejectionNote?: string | null;
  paymentStatus?: string;
}

// Le suivi distingue trois points : d'où part la commande, où elle va, et où
// se trouve le livreur. Le champ « latitude » d'avant mélangeait les deux
// derniers.
type OrderDelivery = Course;

export default function OrderTrackingPage() {
  const t = useTranslations('clientOrderDetail');
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;

  const { orderStatus, deliveryLocation, eta, gpsPerdu, livreurProche, isConnected, notification } =
    useOrderTracking(orderId);

  const [order, setOrder] = useState<Order | null>(null);
  const [delivery, setDelivery] = useState<OrderDelivery | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // null : pas encore su. Une commande terminée invite à donner son avis, ou
  // à le revoir quand il a plus de quinze jours.
  const [avis, setAvis] = useState<{ aRedemander: boolean; dejaDonne: boolean } | null>(null);

  // Chargé à l'arrivée, et quand la commande passe « terminée » en direct.
  useEffect(() => {
    if (order?.status !== 'COMPLETED') return;
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    fetch(`${API_URL}/api/reviews/commande/${orderId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((reponse) => (reponse.ok ? reponse.json() : null))
      .then((corps) => {
        if (corps?.data) {
          setAvis({ aRedemander: corps.data.aRedemander, dejaDonne: Boolean(corps.data.restaurant) });
        }
      })
      .catch(() => {});
  }, [order?.status, orderId]);

  const loadOrderData = useCallback(async () => {
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
        // Cette route renvoie la commande directement, pas enveloppée dans
        // « data » : la page lisait une propriété inexistante et n'affichait
        // donc jamais la commande.
        const orderData = await orderResponse.json();
        setOrder(orderData.data ?? orderData);
      } else if (orderResponse.status === 404) {
        setError('Commande non trouvée');
      }

      const deliveryResponse = await fetch(`${API_URL}/api/client/deliveries/${orderId}`, {
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
  }, [orderId, router]);

  // Ce que le statut ne dit pas : un livreur attribué, une heure revue, un
  // remboursement. La commande est relue à chaque écriture qui la touche.
  useDonneesModifiees('orders', () => loadOrderData(), { id: orderId });

  useEffectChargement(() => {
    loadOrderData();
  }, [orderId, loadOrderData]);


  // Le statut change en direct : on relit la commande entière, pour l'heure
  // annoncée à l'acceptation ou le motif d'un refus.
  useEffect(() => {
    if (orderStatus) {
      setOrder(prev => prev ? { ...prev, status: orderStatus } : null);
      loadOrderData();
    }
  }, [orderStatus, loadOrderData]);

  const getStatusInfo = (status: string) => {
    const statuses: Record<string, { label: string; color: string; icon: string }> = {
      PENDING: { label: t('statusPending'), color: 'yellow', icon: '⏳' },
      ACCEPTED: { label: 'Acceptée', color: 'blue', icon: '✓' },
      PREPARING: { label: t('statusPreparing'), color: 'orange', icon: '👨‍🍳' },
      READY: { label: 'Prête', color: 'yellow-green', icon: '📦' },
      COMPLETED: { label: 'Complétée', color: 'green', icon: '✓✓' },
      REJECTED: { label: 'Refusée', color: 'red', icon: '✗' },
    };
    return statuses[status] || { label: status, color: 'gray', icon: '?' };
  };

  const getProgressPercentage = () => {
    if (!order) return 0;
    const statuses = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED'];
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
        <header className="pt-4">
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
      {/* Notification Toast */}
      {notification && (
        <div className="fixed top-0 left-0 right-0 z-50">
          <div className="max-w-7xl mx-auto px-4 pt-4">
            <div className="animate-in fade-in slide-in-from-top-2 duration-300 bg-green-900 border border-green-700 rounded-lg p-4 flex items-center gap-4 shadow-lg">
              <div className="text-2xl">✨</div>
              <div className="flex-1">
                <p className="font-bold text-green-200">{notification.title}</p>
                <p className="text-green-100 text-sm">{notification.message}</p>
              </div>
              <div className="text-green-400 text-sm">
                À l'instant
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="pt-4">
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
            {avis?.aRedemander && (
              <div className="bg-orange-900/40 border border-orange-700 rounded-lg p-6 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="text-4xl">⭐</div>
                <div className="flex-1">
                  <p className="text-white font-bold text-lg">{t('reviewPromptTitle')}</p>
                  <p className="text-orange-200 text-sm">
                    {avis.dejaDonne ? t('reviewPromptUpdateText') : t('reviewPromptText')}
                  </p>
                </div>
                <Link
                  href={`/client/orders/${orderId}/review`}
                  className="bg-orange-600 hover:bg-orange-700 text-white font-semibold px-5 py-3 rounded-lg text-center transition"
                >
                  {t('reviewPromptButton')}
                </Link>
              </div>
            )}

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
                {order.status === 'PENDING' && (
                  <p className="text-sm text-yellow-300">
                    Le restaurant doit confirmer votre commande. Vous serez prévenu dès qu&apos;il
                    l&apos;aura acceptée.
                  </p>
                )}
                {['ACCEPTED', 'PREPARING', 'READY'].includes(order.status) && order.estimatedReadyAt && (
                  <p className="text-sm text-gray-200">
                    {order.deliveryType === 'PICKUP' && order.pickupTime
                      ? `Retrait prévu à ${heure(order.pickupTime)}`
                      : `Prête vers ${heure(order.estimatedReadyAt)}`}
                  </p>
                )}
                {order.status === 'REJECTED' && (
                  <div className="text-sm text-red-300 space-y-1">
                    <p>
                      {MOTIFS_POUR_LE_CLIENT[order.rejectionReason || ''] ||
                        'Le restaurant a refusé votre commande.'}
                    </p>
                    {order.rejectionNote && <p>« {order.rejectionNote} »</p>}
                    {order.paymentStatus === 'REFUNDED' && (
                      <p>Vous avez payé en ligne : vous êtes remboursé, sous 5 à 10 jours sur votre compte.</p>
                    )}
                    {order.paymentStatus === 'SUCCEEDED' && (
                      <p>Vous avez payé en ligne : votre remboursement est en cours de traitement.</p>
                    )}
                  </div>
                )}
              </div>

              {/* Hors relance, l'avis reste modifiable à tout moment. */}
              {avis && !avis.aRedemander && (
                <Link
                  href={`/client/orders/${orderId}/review`}
                  className="inline-block mb-6 text-orange-400 hover:text-orange-300 text-sm font-semibold"
                >
                  ⭐ {avis.dejaDonne ? t('reviewEdit') : t('reviewPromptButton')}
                </Link>
              )}

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
                {['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED'].map((status, index) => {
                  const completed = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED'].indexOf(order.status) >= index;
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

            {/* Suivi : le bloc précédent affichait des coordonnées GPS brutes,
                et un bouton « Appeler » qui n'appelait rien. */}
            {delivery && (
              <SuiviLivraison
                course={{ ...delivery, livreurProche: delivery.livreurProche || livreurProche }}
                orderId={orderId}
                positionDirecte={deliveryLocation}
                gpsPerduDirect={gpsPerdu}
              />
            )}

            {/* Order Items */}
            {order.items && order.items.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-6">
                <h2 className="text-xl font-bold text-white mb-4">Articles commandés</h2>

                <div className="space-y-3">
                  {order.items.map((item: any) => (
                    <div key={item.id} className="flex justify-between items-center p-3 bg-gray-700 rounded">
                      <div>
                        {/* `item.name` n'existe pas sur une ligne de commande :
                            l'article s'affichait sans nom. */}
                        {intituleDeLaLigne(item).categorie && (
                          <p className="text-gray-500 text-xs">
                            {intituleDeLaLigne(item).categorie}
                          </p>
                        )}
                        <p className="text-white font-semibold">
                          {intituleDeLaLigne(item).plat}
                          {intituleDeLaLigne(item).declinaison && (
                            <span className="text-orange-400">
                              {' '}
                              — {intituleDeLaLigne(item).declinaison}
                            </span>
                          )}
                        </p>
                        <p className="text-gray-400 text-sm">x{item.quantity}</p>
                      </div>
                      <p className="text-orange-400 font-bold">
                        {euro((item.price * item.quantity))}
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

              {/* Le total, et la TVA qu'il contient : les prix sont TTC, la
                  taxe s'en extrait. Le client n'en voyait rien. */}
              <div className="pt-4 border-t border-gray-700">
                <p className="text-gray-400 text-sm mb-2">Total TTC</p>
                <p className="text-white text-2xl font-bold">
                  {euro(order.totalAmount)}
                </p>
                {Number(order.serviceFeeAmount) > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    dont {euro(order.serviceFeeAmount)} de frais de service
                  </p>
                )}
                {Number(order.taxAmount) > 0 && (
                  <div className="mt-2 space-y-1 text-sm text-gray-400">
                    <div className="flex justify-between">
                      <span>Total HT</span>
                      <span>{euro(Number(order.totalAmount) - Number(order.taxAmount))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>
                        dont TVA
                        {Number(order.taxRate) > 0 ? ` ${Number(order.taxRate)} %` : ''}
                      </span>
                      <span>{euro(order.taxAmount)}</span>
                    </div>
                  </div>
                )}
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
