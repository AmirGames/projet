'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MapPin, Navigation, Timer } from 'lucide-react';
import { connexionTempsReel } from '@/lib/temps-reel';
import { useRouter } from 'next/navigation';

import { euro } from '@/lib/format';
import { AlerteSignal, useSignalGps } from '@/components/AlerteSignal';
import { notifierSiCache } from '@/components/ActiverNotifications';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import { useLocale, useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/** Cadence d'envoi de la position. Assez fréquente pour un suivi utile, assez
 *  espacée pour ne pas vider la batterie. */
const INTERVALLE_POSITION_MS = 15000;

/** Filet de sécurité si la connexion temps réel tombe. */
const INTERVALLE_RELEVE_MS = 10000;

interface Proposition {
  id: string;
  deliveryId: string;
  /** Trajet de livraison payé, du commerce au client. */
  distanceKm: number | null;
  /** Distance du livreur jusqu'au commerce. */
  approcheKm?: number | null;
  payout: number;
  expiresAt: string;
  // Lieu de prise en charge
  pickupStore?: string | null;
  pickupAddress?: string | null;
  pickupCity?: string | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
  // Lieu de livraison
  deliveryAddress?: string | null;
  deliveryCity?: string | null;
  deliveryPostal?: string | null;
  /** Proposée pendant une course, sur le trajet (« +1 course »). */
  ajout?: boolean;
  /** Plus longue que ce que fait d'ordinaire son véhicule : il peut refuser. */
  horsLimite?: boolean;
  /** À enchaîner : elle ne démarre qu'une fois la livraison en cours terminée. */
  bientotLibre?: boolean;
  // Anciennes données (rétrocompatibilité)
  boutique?: { name?: string; address?: string; city?: string } | null;
  adresse?: string | null;
  ville?: string | null;
  codePostal?: string | null;
}

interface Props {
  /** Le livreur a choisi de se mettre en ligne (envoyer la position). */
  isOnline: boolean;
  /** Le livreur peut accepter une course (pas de course en cours). */
  isAvailable: boolean;
  /** Appelé après une acceptation, pour rafraîchir la page appelante. */
  surAcceptation?: () => void;
  /** Le serveur a mis le livreur hors ligne (plus de signal depuis longtemps). */
  surHorsLigne?: (raison: string) => void;
}

/**
 * Courses proposées au livreur, et envoi de sa position.
 *
 * Une proposition ne vit que quelques dizaines de secondes : elle arrive par
 * la connexion temps réel pour être vue tout de suite, et un relevé
 * périodique prend le relais si cette connexion tombe.
 *
 * La position est envoyée tant que le livreur est en ligne, course ou non :
 * c'est elle qui décide à qui la prochaine course sera proposée.
 */
export function PropositionsCourses({ isOnline, isAvailable, surAcceptation, surHorsLigne }: Props) {
  const t = useTranslations('propositionsCourses');
  const locale = useLocale();
  const [propositions, setPropositions] = useState<Proposition[]>([]);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');
  const [perduCoteServeur, setPerduCoteServeur] = useState(false);

  const jeton = useRef<string | null>(null);
  const router = useRouter();

  // L'envoi de position, appelable au retour du réseau sans attendre le
  // prochain tour du minuteur.
  const envoyerPosition = useRef<() => void>(() => {});
  const surRetourReseau = useCallback(() => envoyerPosition.current(), []);
  const { enLigne, gps, positionRecue, erreurPosition } = useSignalGps(surRetourReseau);

  useEffect(() => {
    jeton.current = localStorage.getItem('driverToken') || localStorage.getItem('accessToken');
  }, []);

  const relever = useCallback(async () => {
    if (!jeton.current) return;

    try {
      const reponse = await fetch(`${API_URL}/api/drivers/offers`, {
        headers: { Authorization: `Bearer ${jeton.current}` },
      });

      if (!reponse.ok) return;

      const donnees = await reponse.json();
      setPropositions(donnees.data || []);
    } catch {
      // Un relevé manqué n'est pas grave : le suivant arrive dans dix secondes.
    }
  }, []);

  // Relevé périodique des propositions, tant que le livreur est en ligne : en
  // pleine livraison, on peut encore lui proposer une course à enchaîner ou
  // sur son trajet. Hors ligne, rien n'est proposé.
  if (!isOnline && propositions.length > 0) setPropositions([]);

  useEffectChargement(() => {
    if (isOnline) relever();
  }, [isOnline, relever]);

  useEffect(() => {
    if (!isOnline) return;

    const minuteur = setInterval(relever, INTERVALLE_RELEVE_MS);
    return () => clearInterval(minuteur);
  }, [isOnline, relever]);

  // Temps réel : le serveur pousse « course-proposee » au livreur choisi. On
  // relève aussitôt plutôt que d'attendre le prochain relevé périodique, qui
  // pouvait laisser filer une bonne partie du délai d'acceptation.
  useEffect(() => {
    if (!isOnline || !jeton.current) return;

    const socket = connexionTempsReel();

    const surCourse = (donnees: { payout?: number; approcheKm?: number; pickupStore?: string }) => {
      relever();
      notifierSiCache(
        donnees?.payout != null ? t('nouvelleCourseMontant', { montant: euro(donnees.payout) }) : t('nouvelleCourse'),
        donnees?.approcheKm != null
          ? t('notificationCorpsDistance', {
              commerce: donnees?.pickupStore || t('commerce'),
              km: donnees.approcheKm.toFixed(1),
            })
          : t('notificationCorps', { commerce: donnees?.pickupStore || t('commerce') }),
        'course-proposee'
      );
    };
    // Le serveur voit ce que le téléphone ne voit pas : ses positions
    // n'arrivent plus.
    const surGpsPerdu = () => setPerduCoteServeur(true);
    const surGpsRetabli = () => setPerduCoteServeur(false);
    const surMisHorsLigne = (donnees: { raison?: string }) => {
      surHorsLigne?.(donnees?.raison || t('horsLigne'));
    };

    socket.on('course-proposee', surCourse);
    socket.on('gps-perdu', surGpsPerdu);
    socket.on('gps-retabli', surGpsRetabli);
    socket.on('mis-hors-ligne', surMisHorsLigne);

    // La connexion est partagée : on retire nos écouteurs, on ne la ferme pas.
    return () => {
      socket.off('course-proposee', surCourse);
      socket.off('gps-perdu', surGpsPerdu);
      socket.off('gps-retabli', surGpsRetabli);
      socket.off('mis-hors-ligne', surMisHorsLigne);
    };
  }, [isOnline, relever, surHorsLigne, t]);

  // Envoi de la position (tant que le livreur est en ligne, même en cours de livraison).
  useEffect(() => {
    if (!isOnline || typeof navigator === 'undefined' || !navigator.geolocation) return;

    const envoyer = () => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          positionRecue();

          try {
            await fetch(`${API_URL}/api/drivers/location`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${jeton.current}`,
              },
              body: JSON.stringify({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              }),
            });
          } catch {
            // Hors réseau : la position repartira au prochain envoi.
          }
        },
        erreurPosition,
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 }
      );
    };

    envoyerPosition.current = envoyer;
    envoyer();
    const minuteur = setInterval(envoyer, INTERVALLE_POSITION_MS);
    return () => {
      clearInterval(minuteur);
      envoyerPosition.current = () => {};
    };
  }, [isOnline, positionRecue, erreurPosition]);

  // Le compte à rebours a besoin d'un battement de seconde.
  useEffect(() => {
    if (propositions.length === 0) return;

    const minuteur = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(minuteur);
  }, [propositions.length]);

  const repondre = async (propositionId: string, reponse: 'accept' | 'decline') => {
    setEnCours(propositionId);
    setErreur('');
    setInfo('');

    try {
      const resultat = await fetch(`${API_URL}/api/drivers/offers/${propositionId}/${reponse}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jeton.current}` },
      });

      const donnees = await resultat.json();

      if (!resultat.ok) {
        setErreur(donnees.error || t('reponseNonEnregistree'));
        await relever();
        return;
      }

      setPropositions((liste) => liste.filter((p) => p.id !== propositionId));

      if (reponse === 'accept') {
        surAcceptation?.();
        if (donnees.data?.reservee) {
          setInfo(t('reservee'));
          setTimeout(() => setInfo(''), 20000);
        }
        // Direction la course : adresse de retrait, carte et itinéraire.
        // Course à enchaîner : elle ne démarre qu'une fois la livraison en
        // cours terminée, il n'y a pas encore de page de course.
        const deliveryId = donnees.data?.reservee ? null : donnees.data?.id;
        if (deliveryId) router.push(`/driver/deliveries/${deliveryId}`);
      }
    } catch {
      setErreur(t('injoignable'));
    } finally {
      setEnCours(null);
    }
  };

  if (!isOnline) return null;

  const alerte = <AlerteSignal enLigne={enLigne} gps={gps} perduCoteServeur={perduCoteServeur} />;

  const visibles = propositions.filter((p) => new Date(p.expiresAt).getTime() > maintenant);

  // En course ou en pause, sans proposition à enchaîner : l'état du signal
  // compte toujours, puisque le client suit la position.
  if (!isAvailable && visibles.length === 0 && !info) return alerte;

  return (
    <div className="space-y-3">
      {alerte}

      {erreur && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm">
          {erreur}
        </div>
      )}

      {info && (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg p-3 text-sm">
          {info}
        </div>
      )}

      {visibles.length === 0 && isAvailable && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-gray-500">
          <Navigation size={28} className="mx-auto mb-2 text-gray-400" />
          <p>{t('enAttente')}</p>
          <p className="text-xs text-gray-500 mt-1">
            {t('prevenu')}
          </p>
        </div>
      )}

      {visibles.map((proposition) => {
        const restant = Math.max(
          0,
          Math.ceil((new Date(proposition.expiresAt).getTime() - maintenant) / 1000)
        );

        const pickupName = proposition.pickupStore || proposition.boutique?.name || t('restaurant');
        const pickupAddr = proposition.pickupAddress || proposition.boutique?.address || '';
        const pickupCity = proposition.pickupCity || proposition.boutique?.city || '';
        const deliveryAddr = proposition.deliveryAddress || proposition.adresse || '';
        const deliveryCity = proposition.deliveryCity || proposition.ville || '';
        const deliveryPostal = proposition.deliveryPostal || proposition.codePostal || '';

        // Temps estimé : aller au commerce puis livrer (~30 km/h en ville).
        const tempsEstime = Math.max(
          5,
          Math.round(((proposition.approcheKm || 0) + (proposition.distanceKm || 0)) * 2)
        );
        const km = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 });

        return (
          <div
            key={proposition.id}
            className="bg-white border-2 border-green-600 rounded-xl p-6 space-y-4 shadow-lg overflow-hidden relative"
          >
            {/* Timer indicator */}
            <div className="absolute top-3 right-3">
              <span
                className={`flex items-center gap-1 px-3 py-1 rounded-full font-mono text-xs font-bold flex-shrink-0 ${
                  restant <= 10
                    ? 'bg-red-600 text-white animate-pulse'
                    : restant <= 20
                    ? 'bg-orange-600 text-white'
                    : 'bg-green-600 text-white'
                }`}
              >
                <Timer size={12} />
                {restant}s
              </span>
            </div>

            {proposition.bientotLibre && (
              <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-lg p-3 text-sm pr-20">
                <p className="font-semibold">{t('aEnchainer')}</p>
                <p className="text-xs mt-1">{t('aEnchainerAide')}</p>
              </div>
            )}
            {proposition.horsLimite && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 text-sm">
                {t('horsLimite')}
              </div>
            )}

            {/* Montant principal */}
            <div className="pt-2">
              <p className="text-gray-500 text-sm mb-1">{t('vousGagnerez')}</p>
              <p className="text-4xl font-bold text-gray-900">{euro(proposition.payout)}</p>
            </div>

            {/* Distance et temps */}
            <div className="bg-gray-50 rounded-lg p-3 flex gap-6">
              {/* Le trajet de livraison est ce qui est payé ; l'approche
                  aide seulement à décider. */}
              <div>
                <p className="text-gray-500 text-xs mb-1">{t('livraisonPayee')}</p>
                <div className="flex items-center gap-1 text-gray-900 font-semibold">
                  <MapPin size={16} className="text-orange-500" />
                  {proposition.distanceKm != null ? t('km', { n: km(proposition.distanceKm) }) : '?'}
                </div>
              </div>
              {proposition.approcheKm != null && (
                <>
                  <div className="border-l border-gray-200"></div>
                  <div>
                    <p className="text-gray-500 text-xs mb-1">{t('jusquAuCommerce')}</p>
                    <div className="flex items-center gap-1 text-gray-900 font-semibold">
                      <Navigation size={16} className="text-gray-500" />
                      {t('km', { n: km(proposition.approcheKm) })}
                    </div>
                  </div>
                </>
              )}
              <div className="border-l border-gray-200"></div>
              <div>
                <p className="text-gray-500 text-xs mb-1">{t('dureeEstimee')}</p>
                <div className="flex items-center gap-1 text-gray-900 font-semibold">
                  <Timer size={16} className="text-blue-500" />
                  {t('minutes', { n: tempsEstime })}
                </div>
              </div>
            </div>

            {/* Lieu de prise en charge */}
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wider mb-2 font-semibold">{t('aRecuperer')}</p>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                <p className="text-gray-900 font-semibold text-sm">{pickupName}</p>
                <p className="text-gray-700 text-xs mt-1">
                  {pickupAddr}
                  {pickupCity ? `, ${pickupCity}` : ''}
                </p>
              </div>
            </div>

            {/* Lieu de livraison */}
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wider mb-2 font-semibold">{t('aLivrer')}</p>
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-gray-900 font-semibold text-sm flex items-center gap-2">
                  <MapPin size={14} className="text-green-500" />
                  {t('adresseLivraison')}
                </p>
                <p className="text-gray-700 text-xs mt-1">
                  {deliveryAddr}
                  {deliveryPostal || deliveryCity
                    ? `, ${[deliveryPostal, deliveryCity].filter(Boolean).join(' ')}`
                    : ''}
                </p>
                <p className="text-gray-500 text-xs mt-2 italic">
                  {t('confidentialite')}
                </p>
              </div>
            </div>

            {/* Boutons d'action */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => repondre(proposition.id, 'accept')}
                disabled={enCours === proposition.id}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition transform hover:scale-105 active:scale-95"
              >
                {enCours === proposition.id ? '⏳ ...' : t('accepter')}
              </button>
              <button
                type="button"
                onClick={() => repondre(proposition.id, 'decline')}
                disabled={enCours === proposition.id}
                className="flex-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed text-gray-800 font-semibold py-3 rounded-lg transition"
              >
                {enCours === proposition.id ? '...' : t('refuser')}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
