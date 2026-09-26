import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { apiFetch, formatEuros } from '../../lib/api';
import { isNetworkError, useOnline } from '../../lib/network';
import { readJson, removeJson, writeJson } from '../../lib/offlineStore';
import { dismissRejected, enqueueStep, stepLabel, useOutbox, withPendingSteps } from '../../lib/outbox';
import {
  callPhone,
  Delivery,
  sendSms,
  deliveryStatus,
  distanceM,
  formatDistance,
  formatKm,
  itemName,
  openNavigation,
  shortId,
} from '../../lib/deliveries';
import { reducePhoto } from '../../lib/photo';
import { uploadFile } from '../../lib/upload';
import { useRealtimeEvent } from '../../lib/realtime';
import type { Prefs } from '../../lib/session';
import type { Position, Tracking } from '../../lib/useDriverLocation';
import SlideToConfirm from '../SlideToConfirm';
import LiveMap, { RouteInfo } from '../LiveMap';
import { Card, COLORS, ErrorBox, isDarkTheme, Loading, Row, ScreenHeader, themedStyles, ui } from '../ui';

/** En deçà, le livreur est au commerce : la prise en charge se déverrouille. */
const PICKUP_RADIUS_M = 150;
/** En deçà, le livreur est chez le client : la remise s'ouvre. */
const CUSTOMER_ARRIVAL_M = 150;
/** En deçà, le serveur prévient le client de descendre. */
const CUSTOMER_NEAR_M = 300;
/** Au-delà, la position est trop floue pour décider de l'arrivée. */
const GOOD_ACCURACY_M = 100;

const STEPS = ['Aller au commerce', 'Prendre en charge', 'Aller au client', 'Remettre la commande'];
const CANCEL_REASONS = ['Adresse introuvable', 'Route bloquée / embouteillage', 'Problème véhicule', 'Urgence personnelle', 'Autre'];

export default function DeliveryScreen({
  deliveryId,
  token,
  position,
  navigationApp,
  onBack,
  onChanged,
  onTrackingChange,
}: {
  deliveryId: string;
  token: string;
  position: Position | null;
  navigationApp: Prefs['navigationApp'];
  onBack: () => void;
  onChanged: () => void;
  /** La prochaine étape et la carte en plein écran décident de la précision du GPS. */
  onTrackingChange: (tracking: Tracking) => void;
}) {
  const [serverDelivery, setDelivery] = useState<Delivery | null>(null);
  // Affichée depuis le téléphone, faute de réseau : peut dater un peu.
  const [fromCache, setFromCache] = useState(false);
  const online = useOnline();
  const outbox = useOutbox();
  // Les étapes faites sans réseau font avancer la course à l'écran.
  const delivery = serverDelivery && withPendingSteps(serverDelivery, outbox.pending);
  const pendingHere = outbox.pending.filter((p) => p.deliveryId === deliveryId);
  const rejectedHere = outbox.rejected.filter((r) => r.deliveryId === deliveryId);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(false);
  const [refusal, setRefusal] = useState('');
  // Le GPS ne le situe pas au commerce alors qu'il y est : il le dit lui-même.
  const [arrivalDeclared, setArrivalDeclared] = useState(false);
  // Même chose chez le client : la remise s'ouvre à l'arrivée.
  const [customerArrivalDeclared, setCustomerArrivalDeclared] = useState(false);
  // L'attente du client injoignable : fin à l'heure du serveur, et l'écart
  // entre l'horloge du serveur et celle du téléphone.
  const [waitEnd, setWaitEnd] = useState<number | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [startingWait, setStartingWait] = useState(false);
  const [tick, setTick] = useState(() => Date.now());
  // La preuve de la remise : le code du client, ou la photo du dépôt.
  const [code, setCode] = useState('');
  const [photoMode, setPhotoMode] = useState(false);
  const [photoUri, setPhotoUri] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [photoFile, setPhotoFile] = useState<{ uri: string; type: string; name: string } | null>(null);
  const [photoError, setPhotoError] = useState('');
  // La photo n'a pas pu partir faute de réseau : elle partira avec le dépôt.
  const [photoOffline, setPhotoOffline] = useState(false);
  const [note, setNote] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelOther, setCancelOther] = useState('');
  // La carte de la course en plein écran, et l'itinéraire qu'elle a calculé.
  const [mapOpen, setMapOpen] = useState(false);
  const [route, setRoute] = useState<RouteInfo | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setError('');
      try {
        const res = await apiFetch<{ data: Delivery }>(`/api/drivers/deliveries/${deliveryId}`, token);
        setDelivery(res.data);
        setFromCache(false);
        if (res.data.maintenant) setClockOffset(new Date(res.data.maintenant).getTime() - Date.now());
        setWaitEnd(res.data.attenteFinLe ? new Date(res.data.attenteFinLe).getTime() : null);
        // Gardée sur le téléphone tant qu'elle est en cours : sans réseau, elle
        // s'affiche quand même. Terminée, l'adresse et le téléphone du client
        // n'ont plus à y rester.
        if (res.data.status === 'DELIVERED' || res.data.status === 'FAILED') removeJson(`course-${deliveryId}`);
        else writeJson(`course-${deliveryId}`, res.data);
      } catch (e: any) {
        const cached = isNetworkError(e) ? await readJson<Delivery>(`course-${deliveryId}`) : null;
        if (cached) {
          setDelivery((current) => current || cached);
          setFromCache(true);
          if (cached.attenteFinLe) setWaitEnd(new Date(cached.attenteFinLe).getTime());
        } else if (!silent) {
          setError(isNetworkError(e) ? 'Pas de réseau, et cette course n’est pas enregistrée sur le téléphone.' : e.message || 'Course introuvable');
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [deliveryId, token]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Commande déclarée prête, annulée, course reprise : on relit.
  useRealtimeEvent('donnees-modifiees', (m: { ressource?: string }) => {
    if (m?.ressource === 'orders') load(true);
  });
  useRealtimeEvent('reconnecte', () => load(true));

  // Le réseau revient, ou les étapes en attente sont parties : on relit.
  const pendingCount = pendingHere.length;
  const previousPending = useRef(pendingCount);
  useEffect(() => {
    if (pendingCount < previousPending.current) {
      load(true);
      onChanged();
    }
    previousPending.current = pendingCount;
  }, [pendingCount]);
  const wasOnline = useRef(online);
  useEffect(() => {
    if (online && !wasOnline.current) load(true);
    wasOnline.current = online;
  }, [online]);

  const pickup =
    delivery?.pickupLat != null && delivery?.pickupLng != null ? { lat: delivery.pickupLat, lng: delivery.pickupLng } : null;
  const dropoff =
    delivery?.latitude != null && delivery?.longitude != null ? { lat: delivery.latitude, lng: delivery.longitude } : null;
  const driverPoint = position ? { lat: position.lat, lng: position.lng } : null;
  const toPickup = position && pickup ? distanceM(position, pickup) : null;
  const toCustomer = position && dropoff ? distanceM(position, dropoff) : null;

  /**
   * Arrivé au commerce : le GPS le situe à moins de 150 m, ou il le déclare
   * lui-même. Un commerce jamais situé ne peut pas se détecter : la prise en
   * charge reste alors ouverte.
   */
  const atStore = arrivalDeclared || !pickup || (toPickup != null && toPickup <= PICKUP_RADIUS_M);
  const gpsUncertain = !position || (position.accuracy != null && position.accuracy > GOOD_ACCURACY_M);
  const orderReady = !delivery?.orderStatus || delivery.orderStatus === 'READY';
  const finished = delivery?.status === 'DELIVERED' || delivery?.status === 'FAILED';

  const step = !delivery
    ? 0
    : delivery.status === 'DELIVERED'
      ? 4
      : delivery.status === 'PICKED_UP'
        ? 2
        : atStore
          ? 1
          : 0;

  /**
   * Arrivé chez le client : à moins de 150 m, ou déclaré quand le GPS ne sait
   * pas le situer. La saisie du code ne sert à rien en route, elle s'ouvre là.
   */
  const atCustomer =
    customerArrivalDeclared ||
    waitEnd != null ||
    !dropoff ||
    (toCustomer != null && toCustomer <= CUSTOMER_ARRIVAL_M);

  // Secondes d'attente restantes, à l'heure du serveur ; nul tant qu'elle n'a
  // pas commencé.
  const waitLeft = waitEnd == null ? null : Math.max(0, Math.ceil((waitEnd - (tick + clockOffset)) / 1000));
  const waiting = waitLeft != null && waitLeft > 0;

  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [waiting]);

  // Fin de l'attente : le téléphone vibre, le dépôt s'ouvre.
  const wasWaiting = useRef(false);
  useEffect(() => {
    if (wasWaiting.current && !waiting && waitLeft === 0) Vibration.vibrate([0, 300, 150, 300]);
    wasWaiting.current = waiting;
  }, [waiting, waitLeft]);

  const canConfirmDrop = Boolean(photoUrl || (photoOffline && photoFile)) && note.trim().length >= 3;

  /** Le client ne répond pas : l'attente de 6 minutes commence, et il est prévenu. */
  const startWait = async () => {
    setStartingWait(true);
    setRefusal('');
    try {
      const res = await apiFetch<{ data: { attenteFinLe: string; maintenant: string } }>(
        `/api/drivers/deliveries/${deliveryId}/attente`,
        token,
        { method: 'POST' }
      );
      setClockOffset(new Date(res.data.maintenant).getTime() - Date.now());
      setTick(Date.now());
      setWaitEnd(new Date(res.data.attenteFinLe).getTime());
    } catch (e: any) {
      setRefusal(
        isNetworkError(e)
          ? 'Pas de réseau : l’attente doit être lancée en ligne, pour que le client soit prévenu. Rapprochez-vous d’une fenêtre ou sortez du bâtiment, puis réessayez.'
          : e.message || "L'attente n'a pas pu commencer"
      );
    } finally {
      setStartingWait(false);
    }
  };

  // Arrivé au commerce : le téléphone vibre.
  const previousStep = useRef(step);
  useEffect(() => {
    if (step === 1 && previousStep.current === 0) Vibration.vibrate(200);
    previousStep.current = step;
  }, [step]);

  // Le GPS s'affine à l'approche de l'étape et quand la carte est en plein
  // écran ; ailleurs, il économise la batterie.
  const trackingTarget = finished ? null : delivery?.status === 'PICKED_UP' ? dropoff : pickup;
  const onTrackingRef = useRef(onTrackingChange);
  onTrackingRef.current = onTrackingChange;
  useEffect(() => {
    onTrackingRef.current({ target: trackingTarget, navigating: mapOpen && !finished });
  }, [trackingTarget?.lat, trackingTarget?.lng, mapOpen, finished]);
  useEffect(() => () => onTrackingRef.current({ target: null, navigating: false }), []);

  const sendStatus = (status: 'PICKED_UP' | 'DELIVERED', proof?: Record<string, string>) =>
    apiFetch(`/api/drivers/deliveries/${deliveryId}`, token, { method: 'PATCH', body: { status, ...(proof || {}) } });

  /**
   * L'itinéraire vers la prochaine étape : la carte de l'application, qui
   * suit le livreur en direct, ou l'application de navigation qu'il a choisie.
   */
  const navigate = (towardCustomer: boolean) => {
    if (!delivery) return;
    if (navigationApp === 'zupone') {
      setMapOpen(true);
      return;
    }
    openNavigation(
      towardCustomer
        ? { lat: delivery.latitude, lng: delivery.longitude, address: delivery.deliveryAddress }
        : { lat: delivery.pickupLat, lng: delivery.pickupLng, address: delivery.pickupAddress },
      navigationApp
    );
  };

  /** La commande quitte le commerce : l'itinéraire part aussitôt vers le client. */
  const takeOrder = async () => {
    if (!delivery || updating) return;
    setUpdating(true);
    setRefusal('');
    try {
      await sendStatus('PICKED_UP');
      await load(true);
      onChanged();
      navigate(true);
    } catch (e: any) {
      if (isNetworkError(e)) {
        // Sans réseau, la prise en charge est gardée et partira seule.
        await enqueueStep({ kind: 'pickup', deliveryId });
        navigate(true);
      } else {
        setRefusal(e.message || "La prise en charge n'a pas pu être enregistrée");
      }
    } finally {
      setUpdating(false);
    }
  };

  /** Clôt la course sur sa preuve : le code du client, ou la photo du dépôt. */
  const confirmHandover = async (proof: Record<string, string>) => {
    if (!delivery || updating) return;
    setUpdating(true);
    setRefusal('');
    try {
      // Photo restée sur le téléphone : le dépôt entier attend le réseau.
      if (!proof.code && !proof.photoUrl) throw new TypeError('Pas de réseau');
      await sendStatus('DELIVERED', proof);
      Vibration.vibrate(150);
      await load(true);
      onChanged();
    } catch (e: any) {
      if (isNetworkError(e)) {
        // Sans réseau, la remise est gardée et partira seule. Le code, lui,
        // ne se vérifie qu'au serveur : le livreur est prévenu s'il est refusé.
        if (proof.code) await enqueueStep({ kind: 'handover', deliveryId, code: proof.code });
        else await enqueueStep({ kind: 'drop', deliveryId, note: proof.note, photoUri: photoFile?.uri || photoUri, photoUrl: proof.photoUrl || undefined });
        Vibration.vibrate(150);
        return;
      }
      setRefusal(e.message || "La remise n'a pas pu être confirmée");
      // Le champ se vide pour la saisie suivante.
      if (proof.code) setCode('');
      await load(true);
    } finally {
      setUpdating(false);
    }
  };

  // Quatre chiffres saisis : le code se vérifie sans autre geste.
  useEffect(() => {
    if (code.length === 4 && !photoMode && step === 2 && atCustomer && !updating) confirmHandover({ code });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  /** L'appareil photo s'ouvre ; la photo part aussitôt prise. */
  /** Envoie la photo déjà réduite ; rappelée telle quelle par « Renvoyer ». */
  const uploadPhoto = async (file: { uri: string; type: string; name: string }) => {
    setPhotoUrl('');
    setUploading(true);
    setPhotoError('');
    setPhotoOffline(false);
    try {
      const res = await uploadFile(`/api/drivers/deliveries/${deliveryId}/photo`, token, file, 'photo');
      if (res.ok && res.data?.data?.photoUrl) setPhotoUrl(res.data.data.photoUrl);
      else setPhotoError(res.data?.error || `La photo n'a pas pu être envoyée (erreur ${res.status})`);
    } catch (e: any) {
      // Pas de réseau : la photo reste sur le téléphone et partira avec le
      // dépôt. Le livreur n'a pas à attendre devant la porte.
      setPhotoOffline(true);
    } finally {
      setUploading(false);
    }
  };

  /** L'appareil photo s'ouvre ; la photo, réduite, part aussitôt prise. */
  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Appareil photo', "Autorisez l'appareil photo dans les réglages du téléphone.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setPhotoUri(asset.uri);
    setUploading(true);
    const file = await reducePhoto(asset);
    setPhotoFile(file);
    await uploadPhoto(file);
  };

  const cancelDelivery = async () => {
    const reason = cancelReason === 'Autre' ? cancelOther.trim() : cancelReason;
    if (!reason) {
      Alert.alert('Annuler la course', 'Indiquez la raison.');
      return;
    }
    setUpdating(true);
    try {
      await apiFetch(`/api/drivers/deliveries/${deliveryId}/cancel`, token, { method: 'PATCH', body: { reason } });
      onChanged();
      Alert.alert('Course annulée', 'Un autre livreur sera proposé au commerce.');
      onBack();
    } catch (e: any) {
      Alert.alert(
        'Annulation impossible',
        isNetworkError(e)
          ? 'Pas de réseau : l’annulation doit partir tout de suite pour qu’un autre livreur soit trouvé. Réessayez dès que vous captez, ou appelez le support.'
          : e.message || 'Réessayez'
      );
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.raised }}>
        <ScreenHeader title="Course" onBack={onBack} />
        <Loading />
      </View>
    );
  }
  if (error || !delivery) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.raised }}>
        <ScreenHeader title="Course" onBack={onBack} />
        <ErrorBox message={error || 'Course introuvable'} onRetry={() => load()} />
      </View>
    );
  }

  const status = deliveryStatus(delivery.status);
  const towardCustomer = step >= 2;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.raised }}>
      <ScreenHeader
        title={`Course ${shortId(delivery.orderId)}`}
        subtitle={`${status.label}${position ? ' · GPS actif' : ''}`}
        onBack={onBack}
      />
      <ScrollView
        contentContainerStyle={ui.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />}
      >
        <Card title="Étapes">
          {STEPS.map((label, i) => {
            // Chez le client, c'est la remise qui est en cours.
            const shown = step === 2 && atCustomer ? 3 : step;
            const done = i < shown;
            const current = i === shown && !finished;
            return (
              <View key={label} style={styles.stepRow}>
                <View style={[styles.stepCircle, done && styles.stepDone, current && styles.stepCurrent]}>
                  <Text style={[styles.stepNumber, (done || current) && { color: '#fff' }]}>{done ? '✓' : i + 1}</Text>
                </View>
                <Text style={[styles.stepLabel, !(done || current) && { color: COLORS.muted }]}>{label}</Text>
              </View>
            );
          })}
        </Card>

        {rejectedHere.map((r) => (
          <View key={r.id} style={[styles.banner, { backgroundColor: COLORS.dangerBg, borderLeftColor: COLORS.danger }]}>
            <Text style={styles.bannerTitle}>⚠️ {stepLabel(r.kind)} n’a pas été acceptée</Text>
            <Text style={styles.bannerText}>{r.message}</Text>
            <TouchableOpacity onPress={() => dismissRejected(r.id)}>
              <Text style={styles.photoRetry}>J’ai compris</Text>
            </TouchableOpacity>
          </View>
        ))}
        {pendingHere.length > 0 ? (
          <View style={[styles.banner, { backgroundColor: COLORS.card, borderLeftColor: COLORS.warning }]}>
            <Text style={styles.bannerTitle}>
              {outbox.sending && online ? '⏳ Envoi en cours…' : '📴 Enregistré sur le téléphone'}
            </Text>
            <Text style={styles.bannerText}>
              {pendingHere.map((p) => stepLabel(p.kind)).join(', ')} partira dès le retour du réseau, avec l’heure
              exacte. Continuez votre course.
              {pendingHere.some((p) => p.kind === 'handover')
                ? ' Le code du client sera vérifié à ce moment-là : s’il est refusé, vous serez prévenu.'
                : ''}
            </Text>
          </View>
        ) : !online || fromCache ? (
          <View style={[styles.banner, { backgroundColor: COLORS.card, borderLeftColor: COLORS.warning }]}>
            <Text style={styles.bannerTitle}>📴 Pas de réseau</Text>
            <Text style={styles.bannerText}>
              La course reste utilisable : prise en charge et remise seront envoyées au retour du réseau.
            </Text>
          </View>
        ) : null}

        {delivery.status === 'DELIVERED' && (
          <View style={[styles.banner, { backgroundColor: COLORS.successBg, borderLeftColor: COLORS.success }]}>
            <Text style={styles.bannerTitle}>✅ Course terminée</Text>
            <Text style={styles.bannerText}>
              {pendingHere.length > 0
                ? 'Merci ! La remise part dès le retour du réseau ; vous serez de nouveau disponible à ce moment-là.'
                : 'Merci ! Vous êtes de nouveau disponible pour la course suivante.'}
            </Text>
            <TouchableOpacity style={styles.primaryButton} onPress={onBack}>
              <Text style={styles.primaryButtonText}>Retour à l’accueil</Text>
            </TouchableOpacity>
          </View>
        )}
        {delivery.status === 'FAILED' && (
          <View style={[styles.banner, { backgroundColor: COLORS.dangerBg, borderLeftColor: COLORS.danger }]}>
            <Text style={styles.bannerTitle}>Course annulée</Text>
            <Text style={styles.bannerText}>Cette course n’est plus à vous.</Text>
          </View>
        )}

        {!finished && (
          <Card title={towardCustomer ? 'Vers le client' : 'Vers le commerce'}>
            <Text style={styles.place}>
              {towardCustomer ? `📍 ${delivery.deliveryAddress || 'Adresse du client'}` : `🏪 ${delivery.pickupStore || 'Commerce'}`}
            </Text>
            {!towardCustomer && <Text style={styles.address}>{delivery.pickupAddress}</Text>}
            {route ? (
              <Text style={styles.distance}>
                🕒 {formatDuration(route.durationS)} · {formatDistance(route.distanceM)} par la route
              </Text>
            ) : (towardCustomer ? toCustomer : toPickup) != null ? (
              <Text style={styles.distance}>À {formatDistance((towardCustomer ? toCustomer : toPickup)!)}</Text>
            ) : null}
            {!mapOpen && (
              <TouchableOpacity activeOpacity={0.9} onPress={() => setMapOpen(true)} style={styles.mapPreview}>
                <LiveMap
                  dark={isDarkTheme()}
                  driver={driverPoint}
                  pickup={pickup}
                  dropoff={dropoff}
                  target={towardCustomer ? 'dropoff' : 'pickup'}
                  height={220}
                  onRoute={setRoute}
                />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.navButton} onPress={() => navigate(towardCustomer)}>
              <Text style={styles.navButtonText}>
                {navigationApp === 'zupone' ? '🗺️ Itinéraire en plein écran' : '🧭 Lancer le GPS'}{' '}
                {towardCustomer ? 'vers le client' : 'vers le commerce'}
              </Text>
            </TouchableOpacity>
          </Card>
        )}

        {refusal && step !== 2 ? <Text style={styles.refusal}>{refusal}</Text> : null}

        {step === 0 && (
          <Card title="📍 Allez au commerce">
            <Text style={styles.help}>
              {toPickup != null
                ? `Encore ${formatDistance(toPickup)} : la prise en charge s’ouvrira à votre arrivée.`
                : 'Recherche de votre position… La prise en charge s’ouvrira à votre arrivée.'}
            </Text>
            <SlideToConfirm label="Arrivez au commerce pour déverrouiller" onConfirm={() => undefined} disabled />
            {gpsUncertain && (
              <TouchableOpacity style={styles.linkButton} onPress={() => setArrivalDeclared(true)}>
                <Text style={styles.linkButtonText}>Le GPS ne me situe pas : je suis bien au commerce</Text>
              </TouchableOpacity>
            )}
          </Card>
        )}

        {step === 1 && (
          <Card title="📦 Prenez en charge la commande">
            <Text style={styles.help}>
              {orderReady
                ? 'Vérifiez la commande, puis glissez pour la prendre en charge. Le GPS partira aussitôt vers le client.'
                : 'La commande est encore en préparation. Vous pourrez la prendre dès que le commerçant la déclarera prête.'}
            </Text>
            {orderReady ? (
              <SlideToConfirm label="Glisser pour prendre en charge" onConfirm={takeOrder} loading={updating} />
            ) : (
              <>
                <View style={styles.waiting}>
                  <ActivityIndicator color={COLORS.link} />
                  <Text style={styles.waitingText}>En préparation…</Text>
                </View>
                {/* Sans réseau, « prête » ne peut pas arriver jusqu'ici : le
                    commerçant qui tend la commande fait foi. Le serveur
                    tranchera au retour du réseau. */}
                {!online && (
                  <TouchableOpacity style={styles.linkButton} onPress={takeOrder} disabled={updating}>
                    <Text style={styles.linkButtonText}>Pas de réseau : le commerçant me remet la commande</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </Card>
        )}

        {step === 2 && !atCustomer && (
          <Card title="🚗 Allez chez le client">
            {toCustomer != null && toCustomer <= CUSTOMER_NEAR_M && (
              <Text style={styles.near}>🔔 Le client est prévenu de votre arrivée : il peut descendre.</Text>
            )}
            <Text style={styles.help}>
              {toCustomer != null
                ? `Encore ${formatDistance(toCustomer)} : la remise s’ouvrira à votre arrivée.`
                : 'Recherche de votre position… La remise s’ouvrira à votre arrivée.'}
            </Text>
            {gpsUncertain && (
              <TouchableOpacity style={styles.linkButton} onPress={() => setCustomerArrivalDeclared(true)}>
                <Text style={styles.linkButtonText}>Le GPS ne me situe pas : je suis chez le client</Text>
              </TouchableOpacity>
            )}
          </Card>
        )}

        {step === 2 && atCustomer && (
          <Card title="🤝 Remettez la commande">
            {refusal ? <Text style={styles.refusal}>{refusal}</Text> : null}

            {!photoMode && delivery.codeAttendu && (
              <>
                <Text style={styles.help}>Demandez au client son code à quatre chiffres.</Text>
                <View style={styles.codeRow}>
                  <TextInput
                    style={styles.codeInput}
                    value={code}
                    onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 4))}
                    keyboardType="number-pad"
                    maxLength={4}
                    placeholder="0000"
                    placeholderTextColor={COLORS.muted}
                    editable={!updating}
                    textContentType="oneTimeCode"
                  />
                  {updating && <ActivityIndicator color={COLORS.link} style={{ marginLeft: 12 }} />}
                </View>
                <Text style={styles.muted}>Le code se vérifie tout seul dès le quatrième chiffre.</Text>
                {delivery.essaisRestants != null && delivery.essaisRestants < 5 && (
                  <Text style={styles.attempts}>
                    {delivery.essaisRestants} essai{delivery.essaisRestants > 1 ? 's' : ''} restant
                    {delivery.essaisRestants > 1 ? 's' : ''}
                  </Text>
                )}
              </>
            )}

            {!photoMode && (
              <View style={styles.absent}>
                <Text style={styles.absentTitle}>Le client ne répond pas ?</Text>
                <View style={styles.contactRow}>
                  <TouchableOpacity
                    style={styles.contactButton}
                    disabled={!delivery.customerPhone}
                    onPress={() => callPhone(delivery.customerPhone)}
                  >
                    <Text style={styles.contactText}>📞 Appeler</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.contactButton}
                    disabled={!delivery.customerPhone}
                    onPress={() => sendSms(delivery.customerPhone)}
                  >
                    <Text style={styles.contactText}>💬 SMS</Text>
                  </TouchableOpacity>
                </View>
                {waitLeft == null ? (
                  <>
                    <Text style={styles.muted}>
                      Sans réponse, lancez l’attente : le client est prévenu et voit le compte à rebours. Au bout de 6
                      minutes, vous pourrez déposer la commande en lieu sûr.
                    </Text>
                    <TouchableOpacity style={styles.waitButton} onPress={startWait} disabled={startingWait}>
                      {startingWait ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.waitButtonText}>⏱ Lancer l’attente (6 min)</Text>
                      )}
                    </TouchableOpacity>
                  </>
                ) : waitLeft > 0 ? (
                  <View style={styles.waitBox}>
                    <Text style={styles.waitLabel}>Le client est prévenu. Attendez encore</Text>
                    <Text style={styles.waitTimer}>
                      {Math.floor(waitLeft / 60)}:{String(waitLeft % 60).padStart(2, '0')}
                    </Text>
                    <Text style={styles.muted}>Recontactez-le entre-temps. S’il arrive, saisissez son code.</Text>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.waitButton} onPress={() => setPhotoMode(true)}>
                    <Text style={styles.waitButtonText}>📦 Déposer la commande en lieu sûr</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {photoMode && (
              <>
                <Text style={styles.help}>
                  Déposez la commande en lieu sûr, photographiez-la et dites où elle est : le client reçoit la photo et
                  l’endroit.
                </Text>
                {photoUri ? <Image source={{ uri: photoUri }} style={styles.photo} /> : null}
                {uploading ? (
                  <Text style={styles.photoStatus}>Envoi de la photo…</Text>
                ) : photoUrl ? (
                  <Text style={[styles.photoStatus, { color: COLORS.successText }]}>✓ Photo envoyée</Text>
                ) : photoOffline ? (
                  <Text style={[styles.photoStatus, { color: COLORS.warning }]}>
                    📴 Pas de réseau : la photo est gardée et partira avec le dépôt.
                  </Text>
                ) : photoError ? (
                  <View style={styles.photoErrorBox}>
                    <Text style={styles.photoErrorText}>{photoError}</Text>
                    {photoFile && (
                      <TouchableOpacity onPress={() => uploadPhoto(photoFile)}>
                        <Text style={styles.photoRetry}>↻ Renvoyer la photo</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : null}
                <TouchableOpacity style={styles.secondaryButton} onPress={takePhoto} disabled={uploading || updating}>
                  {uploading ? (
                    <ActivityIndicator color={COLORS.link} />
                  ) : (
                    <Text style={styles.secondaryButtonText}>📷 {photoUri ? 'Reprendre la photo' : 'Prendre la photo'}</Text>
                  )}
                </TouchableOpacity>
                <TextInput
                  style={styles.noteInput}
                  value={note}
                  onChangeText={setNote}
                  placeholder="Où est-elle ? (porte, gardien, boîte…)"
                  placeholderTextColor={COLORS.muted}
                  maxLength={200}
                />
                <TouchableOpacity
                  style={[styles.primaryButton, (!canConfirmDrop || updating) && { opacity: 0.5 }]}
                  disabled={!canConfirmDrop || updating}
                  onPress={() => confirmHandover({ photoUrl, note: note.trim() })}
                >
                  {updating ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Confirmer le dépôt</Text>}
                </TouchableOpacity>
                {!canConfirmDrop && !uploading && !photoError && (
                  <Text style={styles.photoHint}>
                    {photoUrl || photoOffline
                      ? 'Indiquez où vous avez déposé la commande.'
                      : 'Prenez la photo du dépôt pour pouvoir confirmer.'}
                  </Text>
                )}
                <TouchableOpacity style={styles.linkButton} onPress={() => setPhotoMode(false)}>
                  <Text style={styles.linkButtonText}>Le client est finalement là : revenir au code</Text>
                </TouchableOpacity>
              </>
            )}
          </Card>
        )}

        <Card title="Client">
          <Row label="Nom" value={delivery.customerName || '—'} />
          <Row label="Adresse" value={delivery.deliveryAddress || '—'} />
          <Row
            label="Téléphone"
            last
            value={
              delivery.customerPhone && !finished ? (
                <TouchableOpacity onPress={() => callPhone(delivery.customerPhone)}>
                  <Text style={[ui.rowValue, { color: COLORS.link }]}>📞 {delivery.customerPhone}</Text>
                </TouchableOpacity>
              ) : (
                delivery.customerPhone || '—'
              )
            }
          />
        </Card>

        <Card title="Commande">
          {(delivery.items || []).map((item, i) => (
            <Row key={item.id || i} label={itemName(item)} value={`×${item.quantity}`} />
          ))}
          <Row label="Distance" value={formatKm(delivery.distance)} />
          <Row label="Montant de la commande" value={formatEuros(delivery.totalAmount)} last />
        </Card>

        {delivery.status === 'ACCEPTED' && (
          <Card title="Un imprévu ?">
            {!cancelOpen ? (
              <TouchableOpacity onPress={() => setCancelOpen(true)}>
                <Text style={styles.cancelLink}>Annuler cette course</Text>
              </TouchableOpacity>
            ) : (
              <>
                <View style={styles.chips}>
                  {CANCEL_REASONS.map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.chip, cancelReason === r && styles.chipActive]}
                      onPress={() => setCancelReason(r)}
                    >
                      <Text style={[styles.chipText, cancelReason === r && styles.chipTextActive]}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {cancelReason === 'Autre' && (
                  <TextInput
                    style={styles.noteInput}
                    value={cancelOther}
                    onChangeText={setCancelOther}
                    placeholder="Précisez la raison"
                    placeholderTextColor={COLORS.muted}
                    maxLength={200}
                  />
                )}
                <View style={styles.cancelActions}>
                  <TouchableOpacity style={styles.cancelKeep} onPress={() => setCancelOpen(false)}>
                    <Text style={styles.cancelKeepText}>Garder la course</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.cancelConfirm} onPress={cancelDelivery} disabled={updating}>
                    <Text style={styles.cancelConfirmText}>Annuler la course</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </Card>
        )}
      </ScrollView>
      <Modal visible={mapOpen && !finished} animationType="slide" onRequestClose={() => setMapOpen(false)}>
        <View style={styles.fullMap}>
          <View style={styles.fullMapHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fullMapTitle} numberOfLines={1}>
                {towardCustomer ? `📍 ${delivery.deliveryAddress || 'Client'}` : `🏪 ${delivery.pickupStore || 'Commerce'}`}
              </Text>
              <Text style={styles.fullMapInfo}>
                {route
                  ? `${formatDuration(route.durationS)} · ${formatDistance(route.distanceM)}`
                  : position
                    ? 'Calcul de l’itinéraire…'
                    : 'Recherche de votre position…'}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setMapOpen(false)} style={styles.fullMapClose} hitSlop={10}>
              <Text style={styles.fullMapCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
          <LiveMap
            dark={isDarkTheme()}
            driver={driverPoint}
            pickup={pickup}
            dropoff={dropoff}
            target={towardCustomer ? 'dropoff' : 'pickup'}
            onRoute={setRoute}
          />
          {step === 1 && (
            <TouchableOpacity style={styles.fullMapAction} onPress={() => setMapOpen(false)}>
              <Text style={styles.fullMapActionText}>📦 Vous êtes au commerce : prendre en charge</Text>
            </TouchableOpacity>
          )}
          {step === 2 && toCustomer != null && toCustomer <= CUSTOMER_NEAR_M && (
            <TouchableOpacity style={styles.fullMapAction} onPress={() => setMapOpen(false)}>
              <Text style={styles.fullMapActionText}>🏠 Vous êtes arrivé : remettre la commande</Text>
            </TouchableOpacity>
          )}
        </View>
      </Modal>
    </View>
  );
}

/** « 12 min », « 1 h 05 ». */
function formatDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}

const styles = themedStyles(() => ({
  mapPreview: { marginTop: 10 },
  fullMap: { flex: 1, backgroundColor: COLORS.raised },
  fullMapHeader: {
    backgroundColor: COLORS.header,
    paddingHorizontal: 16,
    paddingTop: 44,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  fullMapTitle: { color: COLORS.onHeader, fontSize: 17, fontWeight: '700' },
  fullMapInfo: { color: COLORS.onHeader, opacity: 0.9, fontSize: 14, marginTop: 2 },
  fullMapClose: { marginLeft: 12, padding: 4 },
  fullMapCloseText: { color: COLORS.onHeader, fontSize: 22, fontWeight: '700' },
  fullMapAction: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 28,
    backgroundColor: COLORS.success,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    elevation: 6,
  },
  fullMapActionText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  stepRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  stepCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.raised,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stepDone: { backgroundColor: COLORS.success },
  stepCurrent: { backgroundColor: COLORS.primary },
  stepNumber: { fontWeight: '700', color: COLORS.muted },
  stepLabel: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  banner: { borderRadius: 10, padding: 14, marginBottom: 12, borderLeftWidth: 4 },
  bannerTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  bannerText: { fontSize: 13, color: COLORS.secondary, marginTop: 4 },
  place: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  address: { fontSize: 14, color: COLORS.secondary, marginTop: 2 },
  distance: { fontSize: 13, color: COLORS.link, fontWeight: '600', marginTop: 6 },
  navButton: { backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  navButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  help: { fontSize: 14, color: COLORS.secondary, marginBottom: 12, lineHeight: 20 },
  muted: { fontSize: 12, color: COLORS.muted, marginTop: 6 },
  refusal: {
    backgroundColor: COLORS.dangerBg,
    color: COLORS.danger,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    fontSize: 14,
    fontWeight: '600',
  },
  linkButton: { paddingVertical: 12, alignItems: 'center' },
  linkButtonText: { color: COLORS.link, fontWeight: '600', fontSize: 14, textAlign: 'center' },
  waiting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, gap: 10 },
  waitingText: { fontSize: 15, color: COLORS.secondary, fontWeight: '600' },
  near: { backgroundColor: COLORS.successBg, color: COLORS.successOnBg, borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 13 },
  codeRow: { flexDirection: 'row', alignItems: 'center' },
  codeInput: {
    flex: 1,
    minWidth: 0,
    backgroundColor: COLORS.raised,
    borderRadius: 10,
    paddingVertical: 14,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 12,
    textAlign: 'center',
    color: COLORS.text,
  },
  attempts: { fontSize: 13, color: COLORS.warning, fontWeight: '600', marginTop: 6 },
  absent: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: COLORS.border },
  absentTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 10 },
  contactRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  contactButton: { flex: 1, backgroundColor: COLORS.raised, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  contactText: { color: COLORS.link, fontWeight: '700', fontSize: 15 },
  waitButton: { backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 10 },
  waitButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  waitBox: { backgroundColor: COLORS.warningBg, borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 4 },
  waitLabel: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  waitTimer: { color: COLORS.warning, fontSize: 40, fontWeight: '800', marginVertical: 4, fontVariant: ['tabular-nums'] },
  photoStatus: { fontSize: 13, fontWeight: '600', color: COLORS.secondary, marginBottom: 10, textAlign: 'center' },
  photoErrorBox: { backgroundColor: COLORS.dangerBg, borderRadius: 10, padding: 12, marginBottom: 10 },
  photoErrorText: { color: COLORS.danger, fontSize: 14, fontWeight: '600' },
  photoRetry: { color: COLORS.link, fontSize: 15, fontWeight: '700', marginTop: 8 },
  photoHint: { fontSize: 12, color: COLORS.muted, textAlign: 'center', marginTop: 8 },
  photo: { width: '100%', height: 220, borderRadius: 10, marginBottom: 10, backgroundColor: COLORS.raised },
  secondaryButton: {
    borderWidth: 1,
    borderColor: COLORS.link,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  secondaryButtonText: { color: COLORS.link, fontWeight: '700', fontSize: 15 },
  noteInput: {
    backgroundColor: COLORS.raised,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.text,
    marginBottom: 10,
  },
  primaryButton: { backgroundColor: COLORS.success, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  cancelLink: { color: COLORS.danger, fontWeight: '600', fontSize: 15, paddingVertical: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.raised,
  },
  chipActive: { backgroundColor: '#C62828', borderColor: '#C62828' },
  chipText: { fontSize: 13, color: COLORS.text },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  cancelActions: { flexDirection: 'row', gap: 10 },
  cancelKeep: { flex: 1, backgroundColor: COLORS.raised, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  cancelKeepText: { color: COLORS.text, fontWeight: '600' },
  cancelConfirm: { flex: 1, backgroundColor: '#C62828', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  cancelConfirmText: { color: '#fff', fontWeight: '700' },
}));
