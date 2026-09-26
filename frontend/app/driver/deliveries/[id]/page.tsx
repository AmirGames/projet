'use client';

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

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Leaflet touche `window` dès son chargement : pas de rendu côté serveur.
const CarteTrajet = dynamic(() => import('@/components/CarteTrajet'), {
  ssr: false,
  loading: () => (
    <div className="h-[320px] w-full rounded-lg border border-gray-700 bg-gray-900 flex items-center justify-center text-sm text-gray-500">
      Chargement de la carte…
    </div>
  ),
});

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

/**
 * Réduit la photo avant l'envoi : celle d'un téléphone pèse plusieurs
 * mégaoctets, et le livreur l'envoie sur le réseau mobile, devant la porte.
 */
async function reduirePhoto(fichier: File): Promise<Blob> {
  try {
    const image = await createImageBitmap(fichier);
    const echelle = Math.min(1, 1600 / Math.max(image.width, image.height));
    const toile = document.createElement('canvas');
    toile.width = Math.round(image.width * echelle);
    toile.height = Math.round(image.height * echelle);
    toile.getContext('2d')?.drawImage(image, 0, 0, toile.width, toile.height);
    return await new Promise<Blob>((resoudre) =>
      toile.toBlob((blob) => resoudre(blob || fichier), 'image/jpeg', 0.8)
    );
  } catch {
    return fichier;
  }
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
  totalAmount?: number;
  latitude?: number;
  longitude?: number;
  items?: any[];
  /** Un code est attendu à la remise. Sa valeur, elle, reste chez le client. */
  codeAttendu?: boolean;
  essaisRestants?: number;
  preuve?: string | null;
}

export default function DeliveryTrackingPage() {
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
  const [envoiPhoto, setEnvoiPhoto] = useState(false);
  const [note, setNote] = useState('');
  const [refus, setRefus] = useState('');
  const appareil = useRef<HTMLInputElement>(null);
  const priseEnChargeRef = useRef<HTMLDivElement>(null);

  const steps = ['Aller au commerce', 'Prendre en charge la commande', 'Aller au client', 'Remettre la commande'];

  useEffect(() => {
    // Vérifier l'authentification avant de charger les données
    const token = localStorage.getItem('driverToken');
    if (!token) {
      router.push('/driver/login');
    }
  }, [router]);

  // Dernière position connue, renvoyée dès le retour du réseau : sans cela le
  // client gardait une pastille figée jusqu'au prochain mouvement.
  const dernierePosition = useRef<{ latitude: number; longitude: number } | null>(null);

  const envoyerPosition = useCallback(
    (latitude: number, longitude: number) => {
      const token = localStorage.getItem('driverToken');
      if (!token || !deliveryId) return;

      fetch(`${API_URL}/api/drivers/deliveries/${deliveryId}/location`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ latitude, longitude }),
      }).catch((err) => console.error('Failed to update location:', err));
    },
    [deliveryId]
  );

  const surRetourReseau = useCallback(() => {
    if (dernierePosition.current) {
      envoyerPosition(dernierePosition.current.latitude, dernierePosition.current.longitude);
    }
  }, [envoyerPosition]);

  const { enLigne, gps, positionRecue, erreurPosition } = useSignalGps(surRetourReseau);

  // La commande est annulée, le commerçant la déclare prête : la course suit.
  // Le livreur ne reçoit que les annonces de ses propres courses.
  useDonneesModifiees('orders', () => loadDeliveryData(true));

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    const suivi = navigator.geolocation.watchPosition(
      (position) => {
        positionRecue();
        const { latitude, longitude, accuracy } = position.coords;
        dernierePosition.current = { latitude, longitude };
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
        setError('Livraison non trouvée');
      }

      setLoading(false);
    } catch (err) {
      console.error('Error loading delivery:', err);
      if (silencieux) return;
      setError('Erreur lors du chargement de la livraison');
      setLoading(false);
    }
  }, [deliveryId, router]);

  useEffect(() => {
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

  const envoyerStatut = async (status: 'PICKED_UP' | 'DELIVERED', preuve?: Record<string, string>) => {
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
        setRefus(lu?.error || "La prise en charge n'a pas pu être enregistrée");
      }
    } catch (err) {
      gps?.close();
      setRefus("La prise en charge n'a pas pu être enregistrée");
      console.error('Error updating delivery:', err);
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
      const reponse = await envoyerStatut('DELIVERED', preuve);

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
      setRefus(lu?.error || "La remise n'a pas pu être confirmée");
      // Le champ se vide pour la saisie suivante, qui se vérifiera d'elle-même.
      if (preuve.code) setCode('');
      // Code bloqué : la photo devient la seule issue, autant y basculer.
      if (lu?.code === 'CODE_LOCKED' || /bloqué/.test(lu?.error || '')) setModePhoto(true);
      await loadDeliveryData();
    } catch (err) {
      setRefus('Erreur lors de la confirmation de la remise');
      console.error('Error updating delivery:', err);
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
  useEffect(() => {
    if (code.length === 4 && !modePhoto && currentStep === 2 && !updating) {
      confirmerRemise({ code });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  /** L'appareil photo du téléphone s'ouvre ; la photo part aussitôt prise. */
  const photographier = async (fichier: File | undefined) => {
    if (!fichier) return;

    const token = localStorage.getItem('driverToken');
    if (!token) return;

    setEnvoiPhoto(true);
    setRefus('');
    try {
      const photo = await reduirePhoto(fichier);
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
      } else {
        setRefus(lu?.error || "La photo n'a pas pu être envoyée, reprenez-la");
      }
    } catch {
      setRefus("La photo n'a pas pu être envoyée, reprenez-la");
    } finally {
      setEnvoiPhoto(false);
      // Le même fichier doit pouvoir être repris.
      if (appareil.current) appareil.current.value = '';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Loader size={48} className="text-orange-600 animate-spin mx-auto mb-4" />
          <p className="text-white">Chargement de la livraison...</p>
        </div>
      </div>
    );
  }

  if (error || !delivery) {
    return (
      <div className="min-h-screen bg-gray-900">
        <header className="pt-4">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <Link href="/driver" className="flex items-center gap-2 text-orange-500 hover:text-orange-400">
              <ArrowLeft size={20} />
              Retour
            </Link>
          </div>
        </header>
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="bg-red-900 border border-red-700 rounded-lg p-4 text-red-200 flex items-center gap-3">
            <AlertCircle size={24} />
            <p>{error || 'Erreur lors du chargement de la livraison'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="pt-4">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <Link href="/driver" className="flex items-center gap-2 text-orange-500 hover:text-orange-400 mb-4">
            <ArrowLeft size={20} />
            Retour au tableau de bord
          </Link>
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-white">Livraison #{delivery.orderId.slice(0, 8)}</h1>
              <p className="text-gray-400">{delivery.customerName}</p>
            </div>
            {location && (
              <div className="text-right">
                <p className="text-gray-400 text-sm">Localisation active</p>
                <p className="text-green-400 font-semibold text-sm">✓ GPS activé</p>
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
        <div className="bg-gray-800 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-bold text-white mb-6">Étapes de la livraison</h2>

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
                        : 'bg-gray-700 text-gray-400'
                    }`}
                  >
                    {isCompleted ? '✓' : index + 1}
                  </div>
                  <div className="flex-1">
                    <p className={`font-semibold ${isCompleted || isCurrent ? 'text-white' : 'text-gray-500'}`}>
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
            <div className="bg-gray-800 rounded-lg p-6 mb-8 space-y-4">
              <h2 className="text-xl font-bold text-white">
                {versClient ? 'Itinéraire vers le client' : 'Itinéraire vers le commerce'}
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
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition flex items-center justify-center gap-2"
                >
                  <Navigation size={20} />
                  Lancer le GPS {versClient ? 'vers le client' : 'vers le commerce'}
                </a>
              )}
            </div>
          );
        })()}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Current Step Details */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-bold text-white mb-6">
                {currentStep === 0 && '📍 Allez au commerce'}
                {currentStep === 1 && '📦 Prenez en charge la commande'}
                {currentStep === 2 && '🚗 Allez chez le client'}
                {currentStep === 3 && '✓ Livraison terminée'}
              </h2>

              {currentStep === 0 && (
                <div className="space-y-4">
                  <p className="text-gray-300 mb-4">Rendez-vous au commerce pour récupérer la commande</p>
                  <div className="bg-gray-700 rounded-lg p-4 flex gap-3">
                    <MapPin size={24} className="text-orange-500 flex-shrink-0" />
                    <div>
                      <p className="text-white font-semibold">{delivery.pickupStore || 'Commerce'}</p>
                      <p className="text-gray-400">{delivery.pickupAddress}</p>
                    </div>
                  </div>

                  {/* La prise en charge se déverrouille à l'arrivée : elle ne
                      se valide pas depuis chez soi. */}
                  <p className="text-sm text-gray-400">
                    {distanceCommerce != null
                      ? `Encore ${
                          distanceCommerce >= 1000
                            ? `${(distanceCommerce / 1000).toFixed(1)} km`
                            : `${Math.round(distanceCommerce)} m`
                        } : la prise en charge s'ouvrira à votre arrivée.`
                      : 'Recherche de votre position… La prise en charge s\'ouvrira à votre arrivée.'}
                  </p>

                  <GlisserPourValider libelle="Arrivez au commerce pour déverrouiller" onValide={() => {}} desactive />

                  {gpsIncertain && (
                    <button
                      type="button"
                      onClick={() => setArriveeDeclaree(true)}
                      className="block text-sm text-orange-400 hover:underline"
                    >
                      Le GPS ne me situe pas : je suis bien au commerce
                    </button>
                  )}
                </div>
              )}

              {currentStep === 1 && (
                <div className="space-y-4">
                  <div className="bg-green-900/30 border border-green-700 rounded-lg p-4">
                    <p className="text-green-200 font-semibold">
                      Vous êtes arrivé chez {delivery.pickupStore || 'le commerce'}
                    </p>
                    <p className="text-green-300/80 text-sm">
                      {commandePrete
                        ? 'Vérifiez la commande, puis glissez pour la prendre en charge. Le GPS partira aussitôt vers le client.'
                        : 'La commande est encore en préparation. Vous pourrez la prendre en charge dès que le commerçant la déclarera prête.'}
                    </p>
                  </div>

                  {refus && (
                    <p role="status" className="text-sm text-red-400">
                      {refus}
                    </p>
                  )}

                  {delivery.items && delivery.items.length > 0 && (
                    <div className="bg-gray-700 rounded-lg p-4 space-y-2">
                      <p className="text-white font-semibold mb-3">Articles à récupérer:</p>
                      {delivery.items.map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between text-gray-300 text-sm">
                          <span>{item.product?.name || item.name} x{item.quantity}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div ref={priseEnChargeRef} />
                  {commandePrete ? (
                    <GlisserPourValider
                      libelle="Glisser pour prendre en charge"
                      onValide={prendreEnCharge}
                      enCours={updating}
                    />
                  ) : (
                    <div className="flex items-center justify-center gap-2 rounded-lg border border-amber-700 bg-amber-900/30 p-4 text-amber-200">
                      <Loader size={18} className="animate-spin" />
                      <span className="text-sm font-medium">En attente : commande en préparation…</span>
                    </div>
                  )}
                </div>
              )}

              {currentStep === 2 && (
                <div className="space-y-4">
                  <p className="text-gray-300 mb-4">Livrez la commande à l&apos;adresse du client</p>
                  <div className="bg-gray-700 rounded-lg p-4 flex gap-3">
                    <MapPin size={24} className="text-green-500 flex-shrink-0" />
                    <div>
                      <p className="text-white font-semibold">Client</p>
                      <p className="text-gray-400">{delivery.deliveryAddress}</p>
                    </div>
                  </div>

                  {/* À 300 m, le serveur prévient le client de descendre. */}
                  {distanceClient != null && distanceClient <= RAYON_APPROCHE_CLIENT_M && (
                    <p className="flex items-center gap-2 text-sm text-green-300">
                      <BellRing size={16} />
                      Le client est prévenu de votre arrivée : il peut descendre.
                    </p>
                  )}

                  {/* La preuve de la remise. Une course se clôturait sur un
                      simple clic : rien ne distinguait un repas remis en main
                      propre d'un repas jamais sorti du sac. */}
                  <div className="border-t border-gray-700 pt-4 space-y-3">
                    <h3 className="text-white font-semibold">Preuve de la remise</h3>

                    {refus && (
                      <p role="status" className="text-sm text-red-400">
                        {refus}
                      </p>
                    )}

                    {!modePhoto ? (
                      <>
                        <label htmlFor="code-remise" className="block text-sm text-gray-400">
                          Code à quatre chiffres, demandé au client
                        </label>
                        <div className="flex items-center gap-3">
                          <input
                            id="code-remise"
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            placeholder="0000"
                            disabled={updating}
                            className="w-32 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-2xl tracking-[0.3em] text-center disabled:opacity-60"
                          />
                          {updating && (
                            <span className="flex items-center gap-2 text-sm text-gray-400">
                              <Loader size={16} className="animate-spin" /> Vérification…
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">
                          Le code se vérifie tout seul dès le quatrième chiffre.
                        </p>
                        {delivery.essaisRestants != null && delivery.essaisRestants < 5 && (
                          <p className="text-xs text-amber-300">
                            {delivery.essaisRestants} essai
                            {delivery.essaisRestants > 1 ? 's' : ''} restant
                            {delivery.essaisRestants > 1 ? 's' : ''}
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => setModePhoto(true)}
                          className="block text-sm text-orange-400 hover:underline"
                        >
                          Le client est absent : photographier le dépôt
                        </button>
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
                              src={photoUrl}
                              alt="Photo du dépôt"
                              className="w-full max-h-72 object-cover rounded-lg border border-gray-600"
                            />
                            <button
                              type="button"
                              onClick={() => appareil.current?.click()}
                              disabled={envoiPhoto}
                              className="text-sm text-orange-400 hover:underline"
                            >
                              Reprendre la photo
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => appareil.current?.click()}
                            disabled={envoiPhoto}
                            className="w-full bg-gray-700 hover:bg-gray-600 border border-dashed border-gray-500 text-white font-semibold py-6 rounded-lg flex flex-col items-center justify-center gap-2 disabled:opacity-60"
                          >
                            {envoiPhoto ? (
                              <>
                                <Loader size={28} className="animate-spin" />
                                Envoi de la photo…
                              </>
                            ) : (
                              <>
                                <Camera size={28} />
                                Photographier le dépôt
                              </>
                            )}
                          </button>
                        )}

                        <label htmlFor="note-depot" className="block text-sm text-gray-400">
                          Où avez-vous déposé ?
                        </label>
                        <input
                          id="note-depot"
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Devant la porte, chez le gardien…"
                          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                        />

                        <button
                          type="button"
                          onClick={() => confirmerRemise({ photoUrl, note })}
                          disabled={!photoUrl || updating || envoiPhoto}
                          className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2"
                        >
                          {updating ? <Loader size={18} className="animate-spin" /> : <CheckCircle size={18} />}
                          Confirmer le dépôt
                        </button>

                        {delivery.codeAttendu && (
                          <button
                            type="button"
                            onClick={() => setModePhoto(false)}
                            className="block text-sm text-orange-400 hover:underline"
                          >
                            Revenir au code du client
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {currentStep === 3 && (
                <div className="space-y-4">
                  <div className="bg-green-900 border border-green-700 rounded-lg p-4 flex gap-3">
                    <CheckCircle size={24} className="text-green-400 flex-shrink-0" />
                    <div>
                      <p className="text-green-200 font-semibold">Livraison complétée !</p>
                      <p className="text-green-300 text-sm">
                        {delivery.preuve === 'PHOTO'
                          ? 'Dépôt prouvé par photo.'
                          : 'Remise confirmée par le code du client.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Customer Info */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-bold text-white mb-4">Information du client</h2>

              <div className="space-y-4">
                <div className="bg-gray-700 rounded-lg p-4">
                  <p className="text-gray-400 text-sm mb-1">Nom</p>
                  <p className="text-white font-semibold">{delivery.customerName}</p>
                </div>

                <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition flex items-center justify-center gap-2">
                  <Phone size={18} />
                  Appeler {delivery.customerPhone}
                </button>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-gray-800 rounded-lg p-6 sticky top-20 space-y-6">
              {/* Stats */}
              <div>
                <p className="text-gray-400 text-sm mb-2">Distance</p>
                <p className="text-white text-2xl font-bold">{delivery.distance || 0} km</p>
              </div>

              <div>
                <p className="text-gray-400 text-sm mb-2">Montant</p>
                <p className="text-green-400 text-2xl font-bold">{euro((delivery.totalAmount || 0))}</p>
              </div>

              {/* Chaque étape se valide à sa place : la prise en charge au
                  commerce, la remise par le code ou la photo. */}
              {currentStep < 2 && (
                <button
                  onClick={() => setShowCancelModal(true)}
                  className="w-full bg-red-600/20 hover:bg-red-600/30 text-red-400 font-semibold py-2 rounded-lg transition flex items-center justify-center gap-2 border border-red-600/50"
                >
                  <X size={18} />
                  Annuler la course
                </button>
              )}

              {currentStep === 3 && (
                <div className="text-center py-4">
                  <p className="text-green-400 font-semibold mb-4">✓ Livraison complétée !</p>
                  <p className="text-gray-400 text-sm">Retour au tableau de bord dans 2 secondes...</p>
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
