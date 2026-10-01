'use client';

import DetailDuTotal from '@/components/DetailDuTotal';
import { PourboireApresLivraison } from '@/components/PourboireApresLivraison';
import { signalerErreur } from '@/lib/erreurs';
import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Search, Clock, CheckCircle, AlertCircle, Package, Truck, MapPin } from 'lucide-react';

import { euro } from '@/lib/format';
import { AttenteLivreur } from '@/components/AttenteLivreur';
import { intituleDeLaLigne } from '@/lib/ligne-commande';
import { MOTIFS_POUR_LE_CLIENT, heure } from '@/lib/reponse-commande';
import { useParametreAdresse } from '@/lib/navigateur';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import { cheminCommande, jetonDeSuivi, memoriserJetonDeSuivi } from '@/lib/suivi-commande';
import { EnTeteClient } from '@/components/EnTeteClient';

// Leaflet touche `window` dès l'import : la carte ne se charge que côté navigateur.
const SuiviLivraisonClient = dynamic(
  () => import('@/components/SuiviLivraisonClient').then((m) => m.SuiviLivraisonClient),
  { ssr: false }
);

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface OrderItem {
  id: string;
  quantity: number;
  price: number;
  /** Le nom vit sur le plat, pas sur la ligne. */
  product?: { name: string; category?: { name: string } | null } | null;
  variant?: { label: string } | null;
}

interface Order {
  id: string;
  status: 'PENDING' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'COMPLETED' | 'REJECTED';
  /** Absents de la vue réduite du suivi sans compte. */
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  totalAmount: number;
  /** La taxe figée à la commande, et le taux qui valait ce jour-là. */
  taxAmount?: number | string;
  taxRate?: number | string;
  feesAmount?: number | string;
  /** Les frais de service de la plateforme, figés à la commande. */
  serviceFeeAmount?: number | string;
  discountAmount?: number | string;
  promoCode?: string | null;
  deliveryType: 'PICKUP' | 'DELIVERY';
  deliveryAddress?: string;
  deliveryCity?: string;
  pickupTime?: string;
  createdAt: string;
  items?: OrderItem[];
  notes?: string;
  /** Le code à donner au livreur à la porte. Nul une fois la course remise. */
  codeRemise?: string | null;
  preuveDeLivraison?: string | null;
  photoDepot?: string | null;
  noteDepot?: string | null;
  livreurProche?: boolean;
  /** Le livreur attend à la porte : passé cette heure, dépôt en lieu sûr. */
  attenteFinLe?: string | null;
  maintenant?: string | null;
  /** L'heure à laquelle la commande sera prête, annoncée à l'acceptation. */
  estimatedReadyAt?: string | null;
  rejectionReason?: string | null;
  rejectionNote?: string | null;
  paymentStatus?: string;
}

interface Delivery {
  orderId: string;
  status: string;
  pickupLat: number | null;
  pickupLng: number | null;
  // Coordonnées approximatives pour un visiteur ; null si inconnues.
  deliveryLat: number | null;
  deliveryLng: number | null;
  // Seulement quand le livreur est en route vers le client.
  driverLat: number | null;
  driverLng: number | null;
}

/**
 * Lire la commande avec ce qui l'ouvre : le jeton de suivi gardé pour elle, et
 * la session du client s'il est connecté. Sans l'un ni l'autre, l'API répond
 * 404 — le numéro de commande seul ne suffit plus.
 */
function lireSuivi(orderId: string, suite = '') {
  let session: string | null = null;
  try {
    session = localStorage.getItem('accessToken');
  } catch {}

  return fetch(`${API_URL}${cheminCommande(orderId, jetonDeSuivi(orderId), suite)}`, {
    headers: session ? { Authorization: `Bearer ${session}` } : undefined,
  });
}

const statusSteps = [
  { status: 'PENDING', label: 'En Attente', icon: Clock, color: 'text-yellow-600' },
  { status: 'ACCEPTED', label: 'Acceptée', icon: CheckCircle, color: 'text-blue-600' },
  { status: 'PREPARING', label: 'En préparation', icon: Clock, color: 'text-orange-600' },
  { status: 'READY', label: 'Prête', icon: Package, color: 'text-green-600' },
  { status: 'COMPLETED', label: 'Livrée', icon: Truck, color: 'text-purple-600' },
];

const statusColors: { [key: string]: string } = {
  PENDING: 'bg-yellow-50 text-yellow-600 border-yellow-200',
  ACCEPTED: 'bg-blue-50 text-blue-600 border-blue-200',
  PREPARING: 'bg-orange-50 text-orange-600 border-orange-200',
  READY: 'bg-green-50 text-green-600 border-green-200',
  COMPLETED: 'bg-purple-50 text-purple-600 border-purple-200',
  REJECTED: 'bg-red-50 text-red-600 border-red-200',
};

export default function TrackOrderPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const rechercher = useCallback(async (valeur: string) => {
    setError('');
    setOrder(null);
    setDelivery(null);
    setHasSearched(true);
    setLoading(true);

    try {
      const query = valeur.trim();
      if (!query) {
        setError('Veuillez entrer votre numéro de commande');
        setLoading(false);
        return;
      }

      const response = await lireSuivi(query);

      if (!response.ok) {
        if (response.status === 404) {
          setError(
            'Commande introuvable. Ouvrez le lien de suivi reçu par e-mail ou SMS, ou connectez-vous au compte qui a passé la commande.'
          );
        } else {
          setError('Erreur lors de la recherche. Veuillez réessayer.');
        }
        setLoading(false);
        return;
      }

      const data = await response.json();
      const foundOrder = data || data.order;
      setOrder(foundOrder);

      // Charger les données de livraison si c'est une livraison
      if (foundOrder?.deliveryType === 'DELIVERY' && foundOrder?.id) {
        try {
          const deliveryResponse = await lireSuivi(foundOrder.id, '/delivery');
          if (deliveryResponse.ok) {
            const deliveryData = await deliveryResponse.json();
            // L'API répond `{ data: null }` tant qu'aucune course n'existe :
            // retomber sur l'enveloppe donnait un objet sans coordonnées, et la
            // carte plantait sur « Invalid LatLng (NaN, NaN) ».
            setDelivery(deliveryData && 'data' in deliveryData ? deliveryData.data : deliveryData);
          }
        } catch (err) {
          signalerErreur('Error loading delivery:', err);
          // Pas critique, on continue sans données de livraison
        }
      }
    } catch (err) {
      signalerErreur('Search error:', err);
      setError('Erreur de connexion. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    rechercher(searchQuery);
  };

  /**
   * Le lien de suivi remis après une commande passée sans compte.
   *
   * Un invité n'a pas d'historique : ce lien est son seul moyen de revenir sur
   * sa commande. La confirmation le lui donne, et la page le suit d'elle-même.
   *
   * La requête est lue sans `useSearchParams` (voir lib/navigateur.ts).
   */
  const demandee = useParametreAdresse('commande');
  // Le jeton de suivi du lien : gardé pour les relectures et les visites
  // suivantes, avant la première lecture.
  const jetonDuLien = useParametreAdresse('t');
  const [demandeeVue, setDemandeeVue] = useState<string | null>(null);
  if (demandee && demandee !== demandeeVue) {
    setDemandeeVue(demandee);
    setSearchQuery(demandee);
  }

  useEffectChargement(() => {
    if (!demandee) return;
    if (jetonDuLien) memoriserJetonDeSuivi(demandee, jetonDuLien);
    rechercher(demandee);
  }, [demandee, jetonDuLien, rechercher]);

  /**
   * Tant que la commande avance, la page se relit d'elle-même.
   *
   * Un client invité n'a pas de connexion en direct : sans cela, il ne voyait
   * « acceptée » ou « annulée » qu'en rechargeant la page.
   */
  useEffect(() => {
    if (!order?.id || ['COMPLETED', 'REJECTED'].includes(order.status)) return;

    const minuteur = setInterval(async () => {
      try {
        const reponse = await lireSuivi(order.id);
        if (reponse.ok) setOrder(await reponse.json());
      } catch {
        // Hors ligne : on réessaiera au prochain passage.
      }
    }, 20000);

    return () => clearInterval(minuteur);
  }, [order?.id, order?.status]);

  const getStatusIndex = (status: string) => {
    return statusSteps.findIndex(s => s.status === status);
  };

  const currentStatusIndex = order ? getStatusIndex(order.status) : -1;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <EnTeteClient />
      <div className="max-w-4xl mx-auto space-y-8 p-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">📍 Suivre ma commande</h1>
          <p className="text-gray-500">Ouvrez le lien reçu par e-mail ou SMS, ou entrez votre numéro de commande</p>
        </div>

        {/* Search Form */}
        <form onSubmit={handleSearch} className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 text-gray-500" size={20} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Numéro de commande..."
                className="w-full bg-gray-100 border border-gray-300 rounded-lg pl-10 pr-4 py-3 text-gray-900 focus:outline-none focus:border-orange-500 placeholder-gray-400"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-8 py-3 bg-orange-600 hover:bg-orange-700 rounded-full text-white font-semibold transition-colors disabled:opacity-50"
            >
              {loading ? 'Recherche...' : 'Rechercher'}
            </button>
          </div>
        </form>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
            <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {/* Order Details */}
        {order && (
          <div className="space-y-6">
            {/* Order Header */}
            <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-lg p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-500 text-sm mb-1">Numéro de Commande</p>
                  <p className="text-2xl font-bold text-orange-600">#{order.id.slice(-8).toUpperCase()}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    Créée le {new Date(order.createdAt).toLocaleString('fr-FR')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-gray-500 text-sm mb-1">Statut Actuel</p>
                  <span className={`inline-block px-4 py-2 rounded-full text-sm font-semibold border ${statusColors[order.status]}`}>
                    {order.status === 'PENDING' && '⏳ En attente de confirmation'}
                    {order.status === 'ACCEPTED' && '✅ Acceptée'}
                    {order.status === 'PREPARING' && '👨‍🍳 En préparation'}
                    {order.status === 'READY' && '📦 Prête'}
                    {order.status === 'COMPLETED' && '✓ Livrée'}
                    {order.status === 'REJECTED' && '❌ Annulée'}
                  </span>
                </div>
              </div>
            </div>

            {/* Status Timeline */}
            {order.status !== 'REJECTED' && (
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h2 className="text-lg font-bold mb-6">Progression de la Commande</h2>
                <div className="space-y-6">
                  {statusSteps.map((step, index) => {
                    const isCompleted = index <= currentStatusIndex;
                    const isCurrent = index === currentStatusIndex;
                    const Icon = step.icon;

                    return (
                      <div key={step.status} className="flex gap-4">
                        {/* Timeline Line */}
                        <div className="flex flex-col items-center">
                          <div
                            className={`w-12 h-12 rounded-full flex items-center justify-center font-bold transition-colors ${
                              isCompleted
                                ? 'bg-orange-600 text-white'
                                : 'bg-gray-100 text-gray-500'
                            } ${isCurrent ? 'ring-2 ring-orange-600 ring-offset-2 ring-offset-white' : ''}`}
                          >
                            <Icon size={24} />
                          </div>
                          {index < statusSteps.length - 1 && (
                            <div
                              className={`w-1 h-12 mt-2 ${
                                isCompleted ? 'bg-orange-600' : 'bg-gray-100'
                              }`}
                            />
                          )}
                        </div>

                        {/* Step Info */}
                        <div className="flex-1 pt-2 pb-6">
                          <p className={`font-semibold text-lg ${isCompleted ? 'text-gray-900' : 'text-gray-500'}`}>
                            {step.label}
                          </p>
                          <p className="text-sm text-gray-500 mt-1">
                            {step.status === 'PENDING' && 'Votre commande a été reçue et attend la confirmation du restaurant'}
                            {step.status === 'ACCEPTED' &&
                              (order.estimatedReadyAt
                                ? order.deliveryType === 'PICKUP' && order.pickupTime
                                  ? `La boutique a accepté votre commande : elle vous attendra à ${heure(order.pickupTime)}`
                                  : `La boutique a accepté votre commande : prête vers ${heure(order.estimatedReadyAt)}`
                                : 'La boutique a accepté votre commande')}
                            {step.status === 'PREPARING' && 'Votre commande est en cuisine'}
                            {step.status === 'READY' && 'Votre commande est prête à être livrée/retirée'}
                            {step.status === 'COMPLETED' && 'Commande livrée avec succès'}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Rejection Message */}
            {order.status === 'REJECTED' && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                <div className="flex gap-4">
                  <AlertCircle size={24} className="text-red-600 flex-shrink-0" />
                  <div>
                    <h3 className="text-lg font-bold text-red-600 mb-2">Commande annulée</h3>
                    <p className="text-red-700">
                      {MOTIFS_POUR_LE_CLIENT[order.rejectionReason || ''] ||
                        'Désolé, votre commande a été refusée par la boutique.'}
                    </p>
                    {order.rejectionNote && (
                      <p className="text-red-800 mt-2">« {order.rejectionNote} »</p>
                    )}
                    {order.paymentStatus === 'REFUNDED' && (
                      <p className="text-red-800 mt-2">
                        Vous avez payé en ligne : vous êtes remboursé, sous 5 à 10 jours sur votre compte.
                      </p>
                    )}
                    {order.paymentStatus === 'SUCCEEDED' && (
                      <p className="text-red-800 mt-2">
                        Vous avez payé en ligne : votre remboursement est en cours de traitement.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Real-Time Delivery Tracking */}
            {order.deliveryType === 'DELIVERY' &&
             ['READY', 'COMPLETED'].includes(order.status) &&
             delivery && (
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h2 className="text-lg font-bold mb-4">Suivi en Temps Réel</h2>
                <SuiviLivraisonClient
                  orderId={order.id}
                  delivery={delivery}
                />
              </div>
            )}

            {/* Delivery Information */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h2 className="text-lg font-bold mb-4">Informations de Livraison</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-500 text-sm mb-1">Mode</p>
                  <p className="font-semibold flex items-center gap-2">
                    {order.deliveryType === 'PICKUP' ? (
                      <>
                        <MapPin size={18} className="text-blue-600" />
                        Retrait en boutique
                      </>
                    ) : (
                      <>
                        <Truck size={18} className="text-green-600" />
                        Livraison à domicile
                      </>
                    )}
                  </p>
                </div>

                {order.deliveryType === 'PICKUP' && order.pickupTime && (
                  <div>
                    <p className="text-gray-500 text-sm mb-1">Heure de Retrait</p>
                    <p className="font-semibold">
                      {new Date(order.pickupTime).toLocaleString('fr-FR')}
                    </p>
                  </div>
                )}

                {order.deliveryType === 'DELIVERY' && order.deliveryAddress && (
                  <div>
                    <p className="text-gray-500 text-sm mb-1">Adresse de Livraison</p>
                    <p className="font-semibold">
                      {order.deliveryAddress}
                    </p>
                  </div>
                )}
              </div>

              {/* Le code de remise : c'est lui qui prouve que la commande a
                  changé de mains. Une commande suivie sans compte n'a pas
                  d'autre endroit pour le lire. */}
              {/* Prévenu à 300 m : le temps de descendre, le livreur est là. */}
              {order.codeRemise && order.attenteFinLe && (
                <div className="mt-4">
                  <AttenteLivreur key={order.attenteFinLe} finLe={order.attenteFinLe} maintenant={order.maintenant} />
                </div>
              )}

              {order.codeRemise && order.livreurProche && !order.attenteFinLe && (
                <div role="status" className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
                  <p className="font-semibold text-green-800">Votre livreur est bientôt là</p>
                  <p className="text-sm text-green-700/90">
                    Il arrive dans un instant : vous pouvez descendre devant la porte.
                  </p>
                </div>
              )}

              {order.codeRemise && (
                <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
                  <p className="text-sm text-orange-800">Votre code de remise</p>
                  <p className="text-3xl font-bold tracking-[0.3em] text-gray-900">
                    {order.codeRemise}
                  </p>
                  <p className="text-xs text-orange-800/80 mt-1">
                    Donnez-le au livreur à la remise, et à personne d&apos;autre.
                  </p>
                </div>
              )}

              {order.preuveDeLivraison && (
                <p className="mt-4 text-sm text-green-700">
                  {order.preuveDeLivraison === 'CODE'
                    ? 'Remise confirmée par votre code.'
                    : 'Dépôt confirmé par photo, en votre absence.'}
                </p>
              )}

              {order.photoDepot && (
                <div className="mt-3 space-y-1">
                  <img
                    src={order.photoDepot}
                    alt="Photo du dépôt de votre commande"
                    className="w-full max-h-80 object-cover rounded-lg border border-gray-200"
                  />
                  {order.noteDepot && (
                    <p className="text-sm text-gray-500">Déposée : {order.noteDepot}</p>
                  )}
                </div>
              )}
            </div>

            {/* Customer Information — lue seulement par le compte du client :
                le suivi par lien ne transporte ni e-mail ni téléphone. */}
            {(order.customerName || order.customerEmail || order.customerPhone) && (
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h2 className="text-lg font-bold mb-4">Vos Informations</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-gray-500 text-sm mb-1">Nom</p>
                    <p className="font-semibold">{order.customerName}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-sm mb-1">Email</p>
                    <p className="font-semibold text-sm">{order.customerEmail}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-sm mb-1">Téléphone</p>
                    <p className="font-semibold">{order.customerPhone}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Order Items */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h2 className="text-lg font-bold mb-4">Articles Commandés</h2>
              <div className="space-y-3">
                {order.items && order.items.map(item => (
                  <div key={item.id} className="flex justify-between items-center bg-gray-100 p-3 rounded">
                    <div>
                      {/* `item.name` n'existe pas sur une ligne de commande :
                          l'article s'affichait sans nom. */}
                      {intituleDeLaLigne(item).categorie && (
                        <p className="text-xs text-gray-500">{intituleDeLaLigne(item).categorie}</p>
                      )}
                      <p className="font-semibold">
                        {intituleDeLaLigne(item).plat}
                        {intituleDeLaLigne(item).declinaison && (
                          <span className="text-orange-600"> — {intituleDeLaLigne(item).declinaison}</span>
                        )}
                      </p>
                      {intituleDeLaLigne(item).supplements && (
                        <p className="text-xs text-gray-500">+ {intituleDeLaLigne(item).supplements}</p>
                      )}
                      <p className="text-sm text-gray-500">Quantité: {item.quantity}</p>
                    </div>
                    <p className="text-orange-600 font-semibold">
                      {euro(Number(item.price) * item.quantity)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Livrée par un livreur de la plateforme, sans pourboire : on le propose. */}
            <PourboireApresLivraison
              orderId={order.id}
              customerEmail={order.customerEmail}
              customerName={order.customerName}
              cle={delivery?.status}
            />

            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <DetailDuTotal commande={order} couleurTotal="text-orange-600" />
            </div>

            {/* Notes */}
            {order.notes && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-yellow-600 text-sm mb-2 font-semibold">Notes Spéciales:</p>
                <p className="text-yellow-700">{order.notes}</p>
              </div>
            )}

            {/* New Search */}
            <div className="text-center">
              <button
                onClick={() => {
                  setSearchQuery('');
                  setOrder(null);
                  setError('');
                  setHasSearched(false);
                }}
                className="px-6 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-semibold transition-colors"
              >
                Rechercher une autre commande
              </button>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!order && hasSearched && !loading && !error && (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">Aucune commande trouvée</p>
          </div>
        )}

        {/* Initial State */}
        {!order && !hasSearched && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
            <p className="text-blue-600">
              ℹ️ Entrez votre numéro de commande (les 8 derniers caractères visibles sur la confirmation) ou votre adresse email pour suivre votre commande.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
