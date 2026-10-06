'use client';

import { signalerErreur } from '@/lib/erreurs';
import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MapPin, Phone, CheckCircle, AlertCircle, Loader, X, Navigation, Camera, BellRing } from 'lucide-react';

import { euro } from '@/lib/format';
import { AnnulerCourse } from '@/components/AnnulerCourse';
import { AlerteSignal, useSignalGps } from '@/components/AlerteSignal';
import { GlisserPourValider } from '@/components/GlisserPourValider';
import { useDonneesModifiees } from '@/lib/temps-reel';
import { reduireImage } from '@/lib/reduire-image';
import { AttenteDepotLivreur } from '@/components/AttenteDepotLivreur';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import { numeroCourt } from '@/lib/numero-commande';
import { useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Leaflet touche `window` dès son chargement : pas de rendu côté serveur.
const CarteTrajet = dynamic(() => import('@/components/CarteTrajet'), {
  ssr: false,
  loading: () => <ChargementCarte />,
});

function ChargementCarte() {
  const t = useTranslations('suiviLivraison');

  return (
    <div className="h-[320px] w-full rounded-lg border border-gray-200 bg-white flex items-center justify-center text-sm text-gray-500">
      {t('chargementCarte')}
    </div>
  );
}

/** En deçà, le livreur est au commerce : la prise en charge se déverrouille. */
const RAYON_ARRIVEE_COMMERCE_M = 150;
/** En deçà, le client a été prévenu de descendre (le serveur fait de même). */
const RAYON_APPROCHE_CLIENT_M = 300;
/** Au-delà, la position est trop floue pour décider de l'arrivée. */
const PRECISION_SUFFISANTE_M = 100;

/** Distance à vol d'oiseau, en mètres. */
function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Itinéraire GPS dans l'application de navigation du téléphone. */
function lienItineraire(lat?: number | null, lng?: number | null, adresse?: string) {
  const destination =
    lat != null && lng != null ? `${lat},${lng}` : encodeURIComponent(adresse || '');
  if (!destination) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
}

interface Delivery {
  id: string;
  orderId: string;
  status: string;
  /** L'état de la commande côté commerce : elle ne se prend qu'une fois prête. */
  orderStatus?: string;
  pickupAddress: string;
  pickupStore?: string;
  pickupLat?: number | null;
  pickupLng?: number | null;
  deliveryAddress: string;
  customerName: string;
  customerPhone: string;
  distance?: number;
  /** Ce que la course rapporte au livreur. */
  payout?: number;
  /** La part du gain laissée en pourboire par le client (déjà comprise). */
  pourboire?: number;
  /** Laissé après la livraison, en plus du gain de la course. */
  pourboireApres?: number;
  latitude?: number;
  longitude?: number;
  items?: any[];
  /** Un code est attendu à la remise. Sa valeur, elle, reste chez le client. */
  codeAttendu?: boolean;
  essaisRestants?: number;
  preuve?: string | null;
  /** Le client ne répond pas : passé cette heure (du serveur), le dépôt est permis. */
  attenteFinLe?: string | null;
  maintenant?: string | null;
}

export default function DeliveryTrackingPage() {
  const t = useTranslations('livraisonLivreur');
  const params = useParams();
  const router = useRouter();
  const deliveryId = params.id as string;

  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [precision, setPrecision] = useState<number | null>(null);
  // Le GPS ne le situe pas au commerce alors qu'il y est : il le dit lui-même.
  const [arriveeDeclaree, setArriveeDeclaree] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  // La preuve de la remise : le code du client, ou la photo du dépôt quand il
  // est absent. Sans l'une des deux, la course ne se clôt pas.
  const [code, setCode] = useState('');
  const [modePhoto, setModePhoto] = useState(false);
  const [photoUrl, setPhotoUrl] = useState('');
  // L'aperçu : une adresse signée, la photo n'étant plus servie sans contrôle.
  const [apercuPhoto, setApercuPhoto] = useState('');
  const [envoiPhoto, setEnvoiPhoto] = useState(false);
  const [note, setNote] = useState('');
  const [refus, setRefus] = useState('');
  const appareil = useRef<HTMLInputElement>(null);
  const priseEnChargeRef = useRef<HTMLDivElement>(null);

  const steps = [t('etape1'), t('etape2'), t('etape3'), t('etape4')];

  useEffect(() => {
    // Vérifier l'authentification avant de charger les données
    const token = localStorage.getItem('driverToken');
    if (!token) {
      router.push('/driver/login');
    }
  }, [router]);

  // Dernière position connue, renvoyée dès le retour du réseau : sans cela le
  // client gardait une pastille figée jusqu'au prochain mouvement.
  const dernierePosition = useRef<{ latitude: number; longitude: number; precision: number | null; le: number } | null>(null);
  // Où était le téléphone quand la photo du dépôt a été prise : jointe au dépôt.
  const positionPhoto = useRef<{ latitude: number; longitude: number; precision: number | null; releveeLe: string } | null>(null);

  const envoyerPosition = useCallback(
    (latitude: number, longitude: number) => {
      const token = localStorage.getItem('driverToken');
      if (!token || !deliveryId) return;

      fetch(`${API_URL}/api/drivers/deliveries/${deliveryId}/location`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ latitude, longitude }),
      }).catch((err) => signalerErreur('Failed to update location:', err));
    },
    [deliveryId]
  );

  const surRetourReseau = useCallback(() => {
    if (dernierePosition.current) {
      envoyerPosition(dernierePosition.current.latitude, dernierePosition.current.longitude);
    }
  }, [envoyerPosition]);

  const { enLigne, gps, positionRecue, erreurPosition } = useSignalGps(surRetourReseau);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    const suivi = navigator.geolocation.watchPosition(
      (position) => {
        positionRecue();
        const { latitude, longitude, accuracy } = position.coords;
        dernierePosition.current = { latitude, longitude, precision: accuracy ?? null, le: position.timestamp };
        setLocation({ lat: latitude, lng: longitude });
        setPrecision(accuracy ?? null);
        envoyerPosition(latitude, longitude);
      },
      erreurPosition,
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );

    // Le suivi s'arrêtait jamais : chaque visite de la page en ajoutait un.
    return () => navigator.geolocation.clearWatch(suivi);
  }, [envoyerPosition, positionRecue, erreurPosition]);

  // silencieux : une relecture en direct qui échoue garde la course affichée.
  const loadDeliveryData = useCallback(async (silencieux = false) => {
    const token = localStorage.getItem('driverToken');
    if (!token) {
      router.push('/driver/login');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/drivers/deliveries/${deliveryId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setDelivery(data.data);
      } else {
        setError(t('introuvable'));
      }

      setLoading(false);
    } catch (err) {
      signalerErreur('Error loading delivery:', err);
      if (silencieux) return;
      setError(t('erreurChargement'));
      setLoading(false);
    }
  }, [deliveryId, router, t]);

  // La commande est annulée, le commerçant la déclare prête : la course suit.
  // Le livreur ne reçoit que les annonces de ses propres courses.
  useDonneesModifiees('orders', () => loadDeliveryData(true));

  useEffectChargement(() => {
    loadDeliveryData();
  }, [deliveryId, loadDeliveryData]);

  // Où en est le livreur du commerce, et du client.
  const retraitConnu =
    delivery?.pickupLat != null && delivery?.pickupLng != null
      ? { lat: delivery.pickupLat, lng: delivery.pickupLng }
      : null;
  const clientConnu =
    delivery?.latitude != null && delivery?.longitude != null
      ? { lat: delivery.latitude, lng: delivery.longitude }
      : null;
  const distanceCommerce = location && retraitConnu ? distanceM(location, retraitConnu) : null;
  const distanceClient = location && clientConnu ? distanceM(location, clientConnu) : null;

  /**
   * Arrivé au commerce : le GPS le situe à moins de 150 m, ou il le déclare
   * lui-même quand le GPS ne sait pas le situer. Un commerce jamais situé ne
   * peut pas se détecter : la prise en charge reste alors ouverte.
   */
  const auCommerce =
    arriveeDeclaree ||
    !retraitConnu ||
    (distanceCommerce != null && distanceCommerce <= RAYON_ARRIVEE_COMMERCE_M);

  // Le GPS ne le trouve pas, ou trop mal pour trancher : il peut se déclarer
  // arrivé plutôt que de rester bloqué devant la porte.
  const gpsIncertain = !location || (precision != null && precision > PRECISION_SUFFISANTE_M);

  // Sans l'information (ancien serveur), on ne bloque pas le livreur.
  const commandePrete = !delivery?.orderStatus || delivery.orderStatus === 'READY';

  const currentStep = !delivery
    ? 0
    : delivery.status === 'DELIVERED'
      ? 3
      : delivery.status === 'PICKED_UP'
        ? 2
        : auCommerce
          ? 1
          : 0;

  const envoyerStatut = async (status: 'PICKED_UP' | 'DELIVERED', preuve?: Record<string, unknown>) => {
    const token = localStorage.getItem('driverToken');
    if (!token) return null;

    return fetch(`${API_URL}/api/drivers/deliveries/${deliveryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status, ...(preuve || {}) }),
    });
  };

  /**
   * La commande quitte le commerce : le GPS part aussitôt vers le client.
   *
   * La fenêtre s'ouvre dans le geste même du livreur — un navigateur refuse
   * une fenêtre ouverte après une attente réseau — puis reçoit l'itinéraire
   * une fois la prise en charge enregistrée.
   */
  const prendreEnCharge = async () => {
    if (!delivery || updating) return;

    const lien = lienItineraire(delivery.latitude, delivery.longitude, delivery.deliveryAddress);
    const gps = lien ? window.open('', '_blank') : null;

    setUpdating(true);
    setError('');
    try {
      const reponse = await envoyerStatut('PICKED_UP');
      if (reponse?.ok) {
        if (gps && lien) gps.location.href = lien;
        await loadDeliveryData();
      } else {
        gps?.close();
        const lu = await reponse?.json().catch(() => null);
        setRefus(lu?.error || t('priseEnChargeEchec'));
      }
    } catch (err) {
      gps?.close();
      setRefus(t('priseEnChargeEchec'));
      signalerErreur('Error updating delivery:', err);
    } finally {
      setUpdating(false);
    }
  };

  /** Clôt la course sur sa preuve : le code du client, ou la photo du dépôt. */
  const confirmerRemise = async (preuve: Record<string, string>) => {
    if (!delivery || updating) return;

    setUpdating(true);
    setRefus('');
    try {
      const reponse = await envoyerStatut(
        'DELIVERED',
        preuve.photoUrl && positionPhoto.current ? { ...preuve, positionDepot: positionPhoto.current } : preuve
      );

      if (reponse?.ok) {
        // Relire la course plutôt que de croire la réponse du PATCH : celle-ci
        // rend l'enregistrement brut, sans le type de preuve mis en forme.
        await loadDeliveryData();
        setTimeout(() => router.push('/driver'), 2000);
        return;
      }

      // Un code refusé se disait « Erreur lors de la mise à jour » : le
      // livreur ne savait pas s'il s'était trompé de chiffre.
      const lu = await reponse?.json().catch(() => null);
      setRefus(lu?.error || t('remiseEchec'));
      // Le champ se vide pour la saisie suivante, qui se vérifiera d'elle-même.
      if (preuve.code) setCode('');
      // Code bloqué : la photo devient la seule issue, autant y basculer.
      await loadDeliveryData();
    } catch (err) {
      setRefus(t('remiseErreur'));
      signalerErreur('Error updating delivery:', err);
    } finally {
      setUpdating(false);
    }
  };

  // Arrivé au commerce : le téléphone vibre et la page descend jusqu'au
  // curseur, qui sinon reste sous la carte.
  useEffect(() => {
    if (currentStep !== 1) return;
    try {
      navigator.vibrate?.(200);
    } catch {
      // Sans vibreur, le défilement suffit.
    }
    priseEnChargeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentStep]);

  // Quatre chiffres saisis : le code se vérifie sans autre geste.
  const saisirCode = (valeur: string) => {
    const chiffres = valeur.replace(/\D/g, '').slice(0, 4);
    if (chiffres === code) return;
    setCode(chiffres);
    if (chiffres.length === 4 && !modePhoto && currentStep === 2 && !updating) {
      confirmerRemise({ code: chiffres });
    }
  };

  /** L'appareil photo du téléphone s'ouvre ; la photo part aussitôt prise. */
  const photographier = async (fichier: File | undefined) => {
    if (!fichier) return;

    const ici = dernierePosition.current;
    positionPhoto.current = ici
      ? { latitude: ici.latitude, longitude: ici.longitude, precision: ici.precision, releveeLe: new Date(ici.le).toISOString() }
      : null;

    const token = localStorage.getItem('driverToken');
    if (!token) return;

    setEnvoiPhoto(true);
    setRefus('');
    try {
      const photo = await reduireImage(fichier);
      const formulaire = new FormData();
      formulaire.append('photo', photo, 'depot.jpg');

      const reponse = await fetch(`${API_URL}/api/drivers/deliveries/${deliveryId}/photo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formulaire,
      });
      const lu = await reponse.json().catch(() => null);

      if (reponse.ok && lu?.data?.photoUrl) {
        setPhotoUrl(lu.data.photoUrl);
        setApercuPhoto(lu.data.apercuUrl || lu.data.photoUrl);
      } else {
        setRefus(lu?.error || t('photoEchec'));
      }
    } catch {
      setRefus(t('photoEchec'));
    } finally {
      setEnvoiPhoto(false);
      // Le même fichier doit pouvoir être repris.
      if (appareil.current) appareil.current.value = '';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader size={48} className="text-orange-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-900">{t('chargement')}</p>
        </div>
      </div>
    );
  }

  if (error || !delivery) {
    return (
      <div className="min-h-screen">
        <header className="pt-4">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <Link href="/driver" className="flex items-center gap-2 text-orange-500 hover:text-orange-600">
              <ArrowLeft size={20} />
              {t('retour')}
            </Link>
          </div>
        </header>
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 flex items-center gap-3">
            <AlertCircle size={24} />
            <p>{error || t('erreurChargement')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="pt-4">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <Link href="/driver" className="flex items-center gap-2 text-orange-500 hover:text-orange-600 mb-4">
            <ArrowLeft size={20} />
            {t('retourTableau')}
          </Link>
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{t('livraisonNumero', { numero: numeroCourt(delivery.orderId) })}</h1>
              <p className="text-gray-500">{delivery.customerName}</p>
            </div>
            {location && (
              <div className="text-right">
                <p className="text-gray-500 text-sm">{t('localisationActive')}</p>
                <p className="text-green-600 font-semibold text-sm">{t('gpsActive')}</p>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {delivery.status !== 'DELIVERED' && (
          <div className="mb-6">
            <AlerteSignal enLigne={enLigne} gps={gps} />
          </div>
        )}

        {/* Progress */}
        <div className="bg-white ring-1 ring-gray-200 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-6">{t('etapes')}</h2>

          <div className="space-y-4">
            {steps.map((step, index) => {
              const isCompleted = index < currentStep;
              const isCurrent = index === currentStep;

              return (
                <div key={step} className="flex items-center gap-4">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold flex-shrink-0 ${
                      isCompleted
                        ? 'bg-green-600 text-white'
                        : isCurrent
                        ? 'bg-orange-600 text-white'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {isCompleted ? '✓' : index + 1}
                  </div>
                  <div className="flex-1">
                    <p className={`font-semibold ${isCompleted || isCurrent ? 'text-gray-900' : 'text-gray-500'}`}>
                      {step}
                    </p>
                  </div>
                  {isCurrent && <Loader size={20} className="text-orange-600 animate-spin" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Carte du trajet et itinéraire GPS : vers le commerce tant que la
            commande n'est pas récupérée, puis vers le client. */}
        {(() => {
          const versClient = currentStep >= 2;
          const lien = versClient
            ? lienItineraire(delivery.latitude, delivery.longitude, delivery.deliveryAddress)
            : lienItineraire(delivery.pickupLat, delivery.pickupLng, delivery.pickupAddress);
          const retrait =
            delivery.pickupLat != null && delivery.pickupLng != null
              ? { latitude: delivery.pickupLat, longitude: delivery.pickupLng }
              : null;
          const destination =
            delivery.latitude != null && delivery.longitude != null
              ? { latitude: delivery.latitude, longitude: delivery.longitude }
              : null;

          return (
            <div className="bg-white ring-1 ring-gray-200 rounded-lg p-6 mb-8 space-y-4">
              <h2 className="text-xl font-bold text-gray-900">
                {versClient ? t('itineraireClient') : t('itineraireCommerce')}
              </h2>
              {(retrait || destination) && (
                <CarteTrajet
                  retrait={retrait}
                  destination={destination}
                  livreur={location ? { latitude: location.lat, longitude: location.lng } : null}
                  hauteur={320}
                />
              )}
              {lien && (
                <a
                  href={lien}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full bg-gray-900 hover:bg-black text-white font-semibold py-3 rounded-lg transition flex items-center justify-center gap-2"
                >
                  <Navigation size={20} />
                  {versClient ? t('gpsClient') : t('gpsCommerce')}
                </a>
              )}
            </div>
          );
        })()}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Current Step Details */}
            <div className="bg-white ring-1 ring-gray-200 rounded-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">
                {t(`titreEtape.${currentStep}`)}
              </h2>

              {currentStep === 0 && (
                <div className="space-y-4">
                  <p className="text-gray-700 mb-4">{t('rendezVous')}</p>
                  <div className="bg-gray-100 rounded-lg p-4 flex gap-3">
                    <MapPin size={24} className="text-orange-500 flex-shrink-0" />
                    <div>
                      <p className="text-gray-900 font-semibold">{delivery.pickupStore || t('commerce')}</p>
                      <p className="text-gray-500">{delivery.pickupAddress}</p>
                    </div>
                  </div>

                  {/* La prise en charge se déverrouille à l'arrivée : elle ne
                      se valide pas depuis chez soi. */}
                  <p className="text-sm text-gray-500">
                    {distanceCommerce != null
                      ? t('encore', {
                          distance:
                            distanceCommerce >= 1000
                              ? `${(distanceCommerce / 1000).toFixed(1)} km`
                              : `${Math.round(distanceCommerce)} m`,
                        })
                      : t('recherchePosition')}
                  </p>

                  <GlisserPourValider libelle={t('deverrouiller')} onValide={() => {}} desactive />

                  {gpsIncertain && (
                    <button
                      type="button"
                      onClick={() => setArriveeDeclaree(true)}
                      className="block text-sm text-orange-600 hover:underline"
                    >
                      {t('gpsIncertain')}
                    </button>
                  )}
                </div>
              )}

              {currentStep === 1 && (
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="text-green-800 font-semibold">
                      {t('arriveChez', { commerce: delivery.pickupStore || t('leCommerce') })}
                    </p>
                    <p className="text-green-700/80 text-sm">
                      {commandePrete
                        ? t('commandePrete')
                        : t('commandeEnPreparation')}
                    </p>
                  </div>

                  {refus && (
                    <p role="status" className="text-sm text-red-600">
                      {refus}
                    </p>
                  )}

                  {delivery.items && delivery.items.length > 0 && (
                    <div className="bg-gray-100 rounded-lg p-4 space-y-2">
                      <p className="text-gray-900 font-semibold mb-3">{t('articles')}</p>
                      {delivery.items.map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between text-gray-700 text-sm">
                          <span>{item.product?.name || item.name} x{item.quantity}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div ref={priseEnChargeRef} />
                  {commandePrete ? (
                    <GlisserPourValider
                      libelle={t('glisserPrendre')}
                      onValide={prendreEnCharge}
                      enCours={updating}
                    />
                  ) : (
                    <div className="flex items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
                      <Loader size={18} className="animate-spin" />
                      <span className="text-sm font-medium">{t('enAttentePreparation')}</span>
                    </div>
                  )}
                </div>
              )}

              {currentStep === 2 && (
                <div className="space-y-4">
                  <p className="text-gray-700 mb-4">{t('livrez')}</p>
                  <div className="bg-gray-100 rounded-lg p-4 flex gap-3">
                    <MapPin size={24} className="text-green-500 flex-shrink-0" />
                    <div>
                      <p className="text-gray-900 font-semibold">{t('client')}</p>
                      <p className="text-gray-500">{delivery.deliveryAddress}</p>
                    </div>
                  </div>

                  {/* À 300 m, le serveur prévient le client de descendre. */}
                  {distanceClient != null && distanceClient <= RAYON_APPROCHE_CLIENT_M && (
                    <p className="flex items-center gap-2 text-sm text-green-700">
                      <BellRing size={16} />
                      {t('clientPrevenu')}
                    </p>
                  )}

                  {/* La preuve de la remise. Une course se clôturait sur un
                      simple clic : rien ne distinguait un repas remis en main
                      propre d'un repas jamais sorti du sac. */}
                  <div className="border-t border-gray-200 pt-4 space-y-3">
                    <h3 className="text-gray-900 font-semibold">{t('preuveRemise')}</h3>

                    {refus && (
                      <p role="status" className="text-sm text-red-600">
                        {refus}
                      </p>
                    )}

                    {!modePhoto ? (
                      <>
                        <label htmlFor="code-remise" className="block text-sm text-gray-500">
                          {t('codeQuatre')}
                        </label>
                        <div className="flex items-center gap-3">
                          <input
                            id="code-remise"
                            value={code}
                            onChange={(e) => saisirCode(e.target.value)}
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            placeholder="0000"
                            disabled={updating}
                            className="w-32 bg-gray-100 border border-gray-300 rounded px-3 py-2 text-gray-900 text-2xl tracking-[0.3em] text-center disabled:opacity-60"
                          />
                          {updating && (
                            <span className="flex items-center gap-2 text-sm text-gray-500">
                              <Loader size={16} className="animate-spin" /> {t('verification')}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">
                          {t('codeAuto')}
                        </p>
                        {delivery.essaisRestants != null && delivery.essaisRestants < 5 && (
                          <p className="text-xs text-amber-700">
                            {t('essaisRestants', { n: delivery.essaisRestants })}
                          </p>
                        )}
                        <AttenteDepotLivreur
                          deliveryId={delivery.id}
                          finLe={delivery.attenteFinLe}
                          maintenant={delivery.maintenant}
                          surDepot={() => setModePhoto(true)}
                        />
                      </>
                    ) : (
                      <>
                        {/* L'appareil photo du téléphone s'ouvre directement :
                            coller un lien vers une photo hébergée ailleurs, personne
                            ne le faisait. La photo reste chez nous, et le client la
                            voit sur son suivi. */}
                        <input
                          ref={appareil}
                          id="photo-depot"
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={(e) => photographier(e.target.files?.[0])}
                        />

                        {photoUrl ? (
                          <div className="space-y-2">
                            <img
                              src={apercuPhoto || photoUrl}
                              alt={t('photoDepot')}
                              className="w-full max-h-72 object-cover rounded-lg border border-gray-300"
                            />
                            <button
                              type="button"
                              onClick={() => appareil.current?.click()}
                              disabled={envoiPhoto}
                              className="text-sm text-orange-600 hover:underline"
                            >
                              {t('reprendrePhoto')}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => appareil.current?.click()}
                            disabled={envoiPhoto}
                            className="w-full bg-gray-100 hover:bg-gray-200 border border-dashed border-gray-400 text-gray-900 font-semibold py-6 rounded-lg flex flex-col items-center justify-center gap-2 disabled:opacity-60"
                          >
                            {envoiPhoto ? (
                              <>
                                <Loader size={28} className="animate-spin" />
                                {t('envoiPhoto')}
                              </>
                            ) : (
                              <>
                                <Camera size={28} />
                                {t('photographier')}
                              </>
                            )}
                          </button>
                        )}

                        <label htmlFor="note-depot" className="block text-sm text-gray-500">
                          {t('ouDepose')}
                        </label>
                        <input
                          id="note-depot"
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder={t('ouDeposeExemple')}
                          className="w-full bg-gray-100 border border-gray-300 rounded px-3 py-2 text-gray-900"
                        />

                        <button
                          type="button"
                          onClick={() => confirmerRemise({ photoUrl, note })}
                          disabled={!photoUrl || updating || envoiPhoto}
                          className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2"
                        >
                          {updating ? <Loader size={18} className="animate-spin" /> : <CheckCircle size={18} />}
                          {t('confirmerDepot')}
                        </button>

                        {delivery.codeAttendu && (
                          <button
                            type="button"
                            onClick={() => setModePhoto(false)}
                            className="block text-sm text-orange-600 hover:underline"
                          >
                            {t('revenirCode')}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {currentStep === 3 && (
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex gap-3">
                    <CheckCircle size={24} className="text-green-600 flex-shrink-0" />
                    <div>
                      <p className="text-green-800 font-semibold">{t('livraisonCompletee')}</p>
                      <p className="text-green-700 text-sm">
                        {delivery.preuve === 'PHOTO'
                          ? t('preuvePhoto')
                          : t('preuveCode')}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Customer Info */}
            <div className="bg-white ring-1 ring-gray-200 rounded-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">{t('infoClient')}</h2>

              <div className="space-y-4">
                <div className="bg-gray-100 rounded-lg p-4">
                  <p className="text-gray-500 text-sm mb-1">{t('nom')}</p>
                  <p className="text-gray-900 font-semibold">{delivery.customerName}</p>
                </div>

                {/* Un bouton sans lien n'appelait personne. */}
                {delivery.customerPhone && (
                  <a
                    href={`tel:${delivery.customerPhone.replace(/\s+/g, '')}`}
                    className="w-full bg-gray-900 hover:bg-black text-white font-semibold py-2 rounded-lg transition flex items-center justify-center gap-2"
                  >
                    <Phone size={18} />
                    {t('appeler', { telephone: delivery.customerPhone })}
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white ring-1 ring-gray-200 rounded-lg p-6 sticky top-20 space-y-6">
              {/* Stats */}
              <div>
                <p className="text-gray-500 text-sm mb-2">{t('distance')}</p>
                <p className="text-gray-900 text-2xl font-bold">{t('km', { n: delivery.distance || 0 })}</p>
              </div>

              <div>
                <p className="text-gray-500 text-sm mb-2">{t('votreGain')}</p>
                <p className="text-green-600 text-2xl font-bold">{euro(delivery.payout || 0)}</p>
                {(delivery.pourboire ?? 0) > 0 && (
                  <p className="text-green-700 text-sm mt-1">{t('dontPourboire', { montant: euro(delivery.pourboire!) })}</p>
                )}
                {(delivery.pourboireApres ?? 0) > 0 && (
                  <p className="text-green-700 text-sm mt-1">
                    {t('pourboireApres', { montant: euro(delivery.pourboireApres!) })}
                  </p>
                )}
              </div>

              {/* Chaque étape se valide à sa place : la prise en charge au
                  commerce, la remise par le code ou la photo. */}
              {currentStep < 2 && (
                <button
                  onClick={() => setShowCancelModal(true)}
                  className="w-full bg-red-50 hover:bg-red-100 text-red-600 font-semibold py-2 rounded-lg transition flex items-center justify-center gap-2 border border-red-200"
                >
                  <X size={18} />
                  {t('annuler')}
                </button>
              )}

              {currentStep === 3 && (
                <div className="text-center py-4">
                  <p className="text-green-600 font-semibold mb-4">{t('completee')}</p>
                  <p className="text-gray-500 text-sm">{t('retourDans')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Cancel Delivery Modal */}
      {showCancelModal && delivery && (
        <AnnulerCourse
          deliveryId={delivery.id}
          onSuccess={() => {
            setShowCancelModal(false);
            router.push('/driver');
          }}
          onCancel={() => setShowCancelModal(false)}
        />
      )}
    </div>
  );
}
