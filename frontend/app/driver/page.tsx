'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MapPin, Package, Clock, DollarSign } from 'lucide-react';

import { euro } from '@/lib/format';
import { PropositionsCourses } from '@/components/PropositionsCourses';
import { DossierLivreur } from '@/components/DossierLivreur';
import { NotesRecues } from '@/components/NotesRecues';
import { PauseLivreur } from '@/components/PauseLivreur';

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
  /** PENDING tant que la plateforme n'a pas validé le dossier. */
  status?: string;
  /** Nulle tant que personne ne l'a noté. */
  rating: number | null;
  avis?: number;
  totalEarnings: number;
  completedDeliveries: number;
  isOnline: boolean;
  isAvailable: boolean;
  currentLocation?: { latitude: number; longitude: number };
}

export default function DriverDashboard() {
  const t = useTranslations('driverDashboard');
  const router = useRouter();
  const [driver, setDriver] = useState<Driver | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDelivery, setActiveDelivery] = useState<Delivery | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const [refus, setRefus] = useState('');
  const [pausedUntil, setPausedUntil] = useState<string | null>(null);
  const [pauseReason, setPauseReason] = useState<string | null>(null);
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
        setEarnings(Number(driverData.data.totalEarnings || 0));
        // isOnline: ce que le livreur a choisi (envoyer la position)
        // isAvailable: disponibilité actuelle (pas de course en cours)
        setIsOnline(driverData.data.isOnline === true);
        setIsAvailable(driverData.data.isAvailable === true);
        setPausedUntil(driverData.data.pausedUntil || null);
        setPauseReason(driverData.data.pauseReason || null);
      } else {
        throw new Error('Failed to load driver info');
      }

      // La course en cours (acceptée ou récupérée). Sans ce relevé, une course
      // acceptée depuis une proposition disparaissait du tableau de bord.
      const activeResponse = await fetch(
        `${API_URL}/api/drivers/deliveries?status=ACTIVE`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (activeResponse.ok) {
        const activeData = await activeResponse.json();
        setActiveDelivery(activeData.data?.[0] || null);
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

  const basculerDisponibilite = async () => {
    const token = localStorage.getItem('driverToken');
    if (!token) return;

    const nouvelEtat = !isOnline;
    setIsOnline(nouvelEtat); // retour visuel immédiat

    try {
      const reponse = await fetch(`${API_URL}/api/drivers/availability`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isOnline: nouvelEtat }),
      });

      if (!reponse.ok) {
        setIsOnline(!nouvelEtat); // le serveur a refusé : on revient en arrière

        // Le bouton revenait en arrière sans un mot : le livreur cliquait,
        // rien ne bougeait, et il ne savait pas que son dossier était en cause.
        const lu = await reponse.json().catch(() => null);
        setRefus(lu?.error || t('loadingError'));
        return;
      }

      // isAvailable est recalculé par le serveur à chaque bascule. Sans le
      // reprendre ici, un livreur qui repassait en ligne restait « indisponible »
      // côté écran : les propositions n'étaient jamais relevées et il ne
      // recevait aucune course avant d'avoir rechargé la page.
      const etat = await reponse.json().catch(() => null);
      if (etat) {
        setIsOnline(etat.isOnline === true);
        setIsAvailable(etat.isAvailable === true);
        setPausedUntil(etat.pausedUntil || null);
      }

      setRefus('');
    } catch {
      setIsOnline(!nouvelEtat);
      setRefus(t('connectionError'));
    }
  };

  const surChangementPause = useCallback(
    (etat: { isAvailable: boolean; pausedUntil: string | null; pauseReason?: string | null }) => {
      setIsAvailable(etat.isAvailable);
      setPausedUntil(etat.pausedUntil);
      setPauseReason(etat.pauseReason ?? null);
    },
    []
  );

  // Le serveur met hors ligne un livreur dont aucune position n'arrive plus.
  const surHorsLigne = useCallback((raison: string) => {
    setIsOnline(false);
    setIsAvailable(false);
    setPausedUntil(null);
    setRefus(raison);
  }, []);

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


  // Vérifier le token avant de rien afficher
  useEffect(() => {
    const token = localStorage.getItem('driverToken');
    if (!token) {
      router.push('/driver/login');
    }
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-white text-lg">{t('loading')}</p>
          <div className="w-12 h-12 border-4 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto mt-4"></div>
        </div>
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-white text-lg mb-4">{t('loadingError')}</p>
          <button
            onClick={() => router.push('/driver/login')}
            className="bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2 px-4 rounded-lg"
          >
            {t('signIn')}
          </button>
        </div>
      </div>
    );
  }

  const isAccountActive = driver.status === 'ACTIVE';

  return (
    <div className="bg-gray-900 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Le dossier passe avant tout le reste : sans validation, aucune
            course n'arrivera, et un écran normal ne le dirait pas. */}
        <div className="mb-8">
          <DossierLivreur surChangement={loadDriverData} />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">{t('rating')}</p>
                {/* « 5 » s'affichait dès l'inscription : c'était la valeur par
                    défaut de la colonne, pas une note gagnée. */}
                {driver.rating == null ? (
                  <p className="text-gray-500 text-lg font-semibold mt-1">{t('notRatedYet')}</p>
                ) : (
                  <>
                    <p className="text-white text-3xl font-bold">
                      {driver.rating.toFixed(1).replace('.', ',')}
                    </p>
                    <p className="text-gray-500 text-xs">
                      {driver.avis} {t('reviews')}
                    </p>
                  </>
                )}
              </div>
              <div className="text-4xl">⭐</div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">{t('dailyEarnings')}</p>
                <p className="text-white text-3xl font-bold">{euro(earnings)}</p>
              </div>
              <DollarSign size={32} className="text-green-500" />
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">{t('completedDeliveries')}</p>
                <p className="text-white text-3xl font-bold">{driver.completedDeliveries}</p>
              </div>
              <Package size={32} className="text-blue-500" />
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">{t('status')}</p>
                <div className="flex items-center gap-2 mt-2">
                  <div className={`w-3 h-3 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-500'}`}></div>
                  <p className="text-white font-semibold">{isOnline ? t('online') : t('offline')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Courses proposées : elles n'ont que quelques dizaines de secondes de
            vie, elles passent donc avant tout le reste. */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-3">{t('proposedDeliveries')}</h2>
          <PropositionsCourses
            isOnline={isOnline}
            isAvailable={isAvailable}
            surAcceptation={loadDriverData}
            surHorsLigne={surHorsLigne}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Active Delivery */}
          {activeDelivery ? (
            <div className="lg:col-span-2">
              <div className="bg-gray-800 rounded-lg p-6">
                <h2 className="text-xl font-bold text-white mb-6">{t('activeDelivery')}</h2>

                <div className="space-y-6">
                  {/* Pickup Location */}
                  <div>
                    <p className="text-orange-500 font-semibold mb-2">{t('toPickup')}</p>
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
                    <p className="text-green-500 font-semibold mb-2">{t('deliverTo')}</p>
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
                      <p className="text-gray-400 text-sm mb-2">{t('distance')}</p>
                      <p className="text-white text-2xl font-bold">{activeDelivery.distance || 0} km</p>
                    </div>
                    <div className="bg-gray-700 rounded-lg p-4">
                      <p className="text-gray-400 text-sm mb-2">{t('amount')}</p>
                      <p className="text-white text-2xl font-bold">{euro((activeDelivery.totalAmount || 0))}</p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-3 pt-4 border-t border-gray-600">
                    <Link href={`/driver/deliveries/${activeDelivery.id}`} className="block">
                      <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition flex items-center justify-center gap-2">
                        <MapPin size={20} />
                        {t('startDelivery')}
                      </button>
                    </Link>

                    <button className="w-full bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 rounded-lg transition">
                      {t('callCustomer')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="lg:col-span-2">
              <div className="bg-gray-800 rounded-lg p-6">
                <h2 className="text-xl font-bold text-white mb-6">{t('availableDeliveries')}</h2>

                {deliveries.length === 0 ? (
                  <div className="text-center py-12">
                    <Package size={48} className="mx-auto text-gray-600 mb-4" />
                    <p className="text-white text-lg">{t('noDeliveries')}</p>
                    <p className="text-gray-400">{t('newDeliveriesHere')}</p>
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
                            <p className="text-white font-semibold">{t('orderNumber', { id: delivery.orderId.slice(0, 8) })}</p>
                            <p className="text-gray-400 text-sm">{delivery.customerName}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-orange-400 font-bold">{euro((delivery.totalAmount || 0))}</p>
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
                          {t('acceptDelivery')}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Driver Info Sidebar */}
          <div className="lg:col-span-1 space-y-8">
            <div className="bg-gray-800 rounded-lg p-6 space-y-6">
              <div>
                <p className="text-gray-400 text-sm mb-2">{t('profile')}</p>
                <div className="w-16 h-16 bg-gradient-to-r from-orange-500 to-red-500 rounded-full flex items-center justify-center text-white text-2xl font-bold">
                  {driver.name.charAt(0)}
                </div>
                <p className="text-white font-semibold mt-3">{driver.name}</p>
                <p className="text-gray-400 text-sm">{driver.phone}</p>
              </div>

              <div className="pt-6 border-t border-gray-700 space-y-4">
                <button
                  onClick={basculerDisponibilite}
                  disabled={!isAccountActive}
                  className={`w-full font-semibold py-2 rounded-lg transition ${
                    isOnline
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-white'
                  } ${!isAccountActive ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {/* Le bouton reflète le choix du livreur (en ligne), pas la
                      disponibilité : en pause ou en course, il reste en ligne. */}
                  {isOnline ? t('onlineStatus') : t('offlineStatus')}
                </button>

                {refus && (
                  <p role="status" className="text-sm text-red-400">
                    {refus}
                  </p>
                )}

                <PauseLivreur
                  isOnline={isOnline}
                  enCourse={Boolean(activeDelivery)}
                  pausedUntil={pausedUntil}
                  pauseReason={pauseReason}
                  surChangement={surChangementPause}
                />

                <Link href="/driver/profile" className="block">
                  <button className="w-full bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 rounded-lg transition">
                    {t('myProfile')}
                  </button>
                </Link>

                <Link href="/driver/deliveries" className="block">
                  <button className="w-full bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 rounded-lg transition">
                    {t('myDeliveries')}
                  </button>
                </Link>

                {isAccountActive ? (
                  <Link href="/driver/earnings" className="block">
                    <button className="w-full bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 rounded-lg transition">
                      {t('seeEarnings')}
                    </button>
                  </Link>
                ) : (
                  <button disabled className="w-full bg-gray-600 text-gray-400 font-semibold py-2 rounded-lg opacity-50 cursor-not-allowed">
                    {t('earningsAccountValidation')}
                  </button>
                )}
              </div>
            </div>

            {/* La moyenne seule ne dit pas quoi corriger : les remarques, si. */}
            <NotesRecues />
          </div>
        </div>
      </div>
    </div>
  );
}
