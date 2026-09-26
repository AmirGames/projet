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
import { API_URL, apiFetch, formatEuros } from '../../lib/api';
import {
  callPhone,
  Delivery,
  deliveryStatus,
  distanceM,
  formatDistance,
  formatKm,
  itemName,
  openNavigation,
  shortId,
} from '../../lib/deliveries';
import { useRealtimeEvent } from '../../lib/realtime';
import type { Prefs } from '../../lib/session';
import type { Position, Tracking } from '../../lib/useDriverLocation';
import SlideToConfirm from '../SlideToConfirm';
import LiveMap, { RouteInfo } from '../LiveMap';
import { Card, COLORS, ErrorBox, isDarkTheme, Loading, Row, ScreenHeader, themedStyles, ui } from '../ui';

/** En deçà, le livreur est au commerce : la prise en charge se déverrouille. */
const PICKUP_RADIUS_M = 150;
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
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(false);
  const [refusal, setRefusal] = useState('');
  // Le GPS ne le situe pas au commerce alors qu'il y est : il le dit lui-même.
  const [arrivalDeclared, setArrivalDeclared] = useState(false);
  // La preuve de la remise : le code du client, ou la photo du dépôt.
  const [code, setCode] = useState('');
  const [photoMode, setPhotoMode] = useState(false);
  const [photoUri, setPhotoUri] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [uploading, setUploading] = useState(false);
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
        // Code bloqué ou absent : la photo devient la seule preuve possible.
        if (res.data.status === 'PICKED_UP' && res.data.codeAttendu === false) setPhotoMode(true);
      } catch (e: any) {
        if (!silent) setError(e.message || 'Course introuvable');
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
      setRefusal(e.message || "La prise en charge n'a pas pu être enregistrée");
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
      await sendStatus('DELIVERED', proof);
      Vibration.vibrate(150);
      await load(true);
      onChanged();
    } catch (e: any) {
      setRefusal(e.message || "La remise n'a pas pu être confirmée");
      // Le champ se vide pour la saisie suivante.
      if (proof.code) setCode('');
      if (/bloqué/i.test(e.message || '')) setPhotoMode(true);
      await load(true);
    } finally {
      setUpdating(false);
    }
  };

  // Quatre chiffres saisis : le code se vérifie sans autre geste.
  useEffect(() => {
    if (code.length === 4 && !photoMode && step === 2 && !updating) confirmHandover({ code });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  /** L'appareil photo s'ouvre ; la photo part aussitôt prise. */
  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Appareil photo', "Autorisez l'appareil photo dans les réglages du téléphone.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setPhotoUri(asset.uri);
    setPhotoUrl('');
    setUploading(true);
    setRefusal('');
    try {
      const form = new FormData();
      form.append('photo', { uri: asset.uri, name: 'depot.jpg', type: asset.mimeType || 'image/jpeg' } as any);
      const response = await fetch(`${API_URL}/api/drivers/deliveries/${deliveryId}/photo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await response.json().catch(() => null);
      if (response.ok && data?.data?.photoUrl) setPhotoUrl(data.data.photoUrl);
      else setRefusal(data?.error || "La photo n'a pas pu être envoyée, reprenez-la");
    } catch {
      setRefusal("La photo n'a pas pu être envoyée, reprenez-la");
    } finally {
      setUploading(false);
    }
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
      Alert.alert('Annulation impossible', e.message || 'Réessayez');
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
            const done = i < step;
            const current = i === step && !finished;
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

        {delivery.status === 'DELIVERED' && (
          <View style={[styles.banner, { backgroundColor: COLORS.successBg, borderLeftColor: COLORS.success }]}>
            <Text style={styles.bannerTitle}>✅ Course terminée</Text>
            <Text style={styles.bannerText}>Merci ! Vous êtes de nouveau disponible pour la course suivante.</Text>
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

        {refusal ? <Text style={styles.refusal}>{refusal}</Text> : null}

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
              <View style={styles.waiting}>
                <ActivityIndicator color={COLORS.link} />
                <Text style={styles.waitingText}>En préparation…</Text>
              </View>
            )}
          </Card>
        )}

        {step === 2 && (
          <Card title="🤝 Remettez la commande">
            {toCustomer != null && toCustomer <= CUSTOMER_NEAR_M && (
              <Text style={styles.near}>🔔 Le client est prévenu de votre arrivée : il peut descendre.</Text>
            )}
            {!photoMode ? (
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
                <TouchableOpacity style={styles.linkButton} onPress={() => setPhotoMode(true)}>
                  <Text style={styles.linkButtonText}>Le client est absent : photographier le dépôt</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.help}>Photographiez la commande déposée : le client la verra sur son suivi.</Text>
                {photoUri ? <Image source={{ uri: photoUri }} style={styles.photo} /> : null}
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
                  placeholder="Où l’avez-vous déposée ? (facultatif)"
                  placeholderTextColor={COLORS.muted}
                  maxLength={200}
                />
                <TouchableOpacity
                  style={[styles.primaryButton, (!photoUrl || updating) && { opacity: 0.5 }]}
                  disabled={!photoUrl || updating}
                  onPress={() => confirmHandover({ photoUrl, ...(note.trim() ? { note: note.trim() } : {}) })}
                >
                  {updating ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Confirmer le dépôt</Text>}
                </TouchableOpacity>
                {delivery.codeAttendu && (
                  <TouchableOpacity style={styles.linkButton} onPress={() => setPhotoMode(false)}>
                    <Text style={styles.linkButtonText}>Le client est là : saisir son code</Text>
                  </TouchableOpacity>
                )}
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
    backgroundColor: COLORS.raised,
    borderRadius: 10,
    paddingVertical: 14,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 16,
    textAlign: 'center',
    color: COLORS.text,
  },
  attempts: { fontSize: 13, color: COLORS.warning, fontWeight: '600', marginTop: 6 },
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
