import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Text, TouchableOpacity, View } from 'react-native';
import { formatEuros } from '../lib/api';
import { formatDistance, Offer } from '../lib/deliveries';
import type { Position } from '../lib/useDriverLocation';
import LiveMap, { RouteInfo } from './LiveMap';
import { COLORS, isDarkTheme, themedStyles } from './ui';

/** Hauteur du panneau : la carte cadre le trajet au-dessus. */
const SHEET_HEIGHT = 380;
/** Faute d'itinéraire calculé, une vitesse moyenne en ville. */
const CITY_SPEED_KMH = 20;

function formatMinutes(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * La course proposée, en plein écran : le trajet sur la carte, et tout ce qui
 * décide en un coup d'œil — ce qu'elle paie, combien de temps elle prend, d'où
 * elle part. Le bouton se vide à mesure que le temps de réponse file.
 */
export default function OfferSheet({
  offers,
  position,
  answeringOfferId,
  onAnswer,
}: {
  offers: Offer[];
  position: Position | null;
  answeringOfferId: string | null;
  onAnswer: (offer: Offer, answer: 'accept' | 'decline') => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [route, setRoute] = useState<RouteInfo | null>(null);
  // Le temps de réponse total, mesuré à la première apparition de l'offre.
  const firstSeen = useRef(new Map<string, number>());

  const live = offers.filter((o) => new Date(o.expiresAt).getTime() > now);
  const offer = live[0];

  useEffect(() => {
    if (!offer) return;
    if (!firstSeen.current.has(offer.id)) firstSeen.current.set(offer.id, Date.now());
    setRoute(null);
  }, [offer?.id]);

  useEffect(() => {
    if (!offer) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [offer?.id]);

  if (!offer) return null;

  const expires = new Date(offer.expiresAt).getTime();
  const start = firstSeen.current.get(offer.id) ?? now;
  const total = Math.max(1, expires - start);
  const remaining = Math.max(0, expires - now);
  const fraction = Math.min(1, remaining / total);
  const busy = answeringOfferId === offer.id;

  const pickup = offer.pickupLat != null && offer.pickupLng != null ? { lat: offer.pickupLat, lng: offer.pickupLng } : null;
  const dropoff =
    offer.deliveryLat != null && offer.deliveryLng != null ? { lat: offer.deliveryLat, lng: offer.deliveryLng } : null;
  const driver = position ? { lat: position.lat, lng: position.lng } : null;

  // Durée et distance de toute la course : jusqu'au commerce, puis jusqu'au client.
  const totalKm = (offer.approcheKm ?? 0) + (offer.distanceKm ?? 0);
  const durationS = route?.durationS ?? (totalKm / CITY_SPEED_KMH) * 3600;
  const distanceM = route?.distanceM ?? totalKm * 1000;

  const pickupLine = [offer.pickupAddress, offer.pickupCity].filter(Boolean).join(', ');
  const dropoffLine = [offer.deliveryAddress, [offer.deliveryPostal, offer.deliveryCity].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');

  return (
    <Modal visible animationType="slide" onRequestClose={() => onAnswer(offer, 'decline')}>
      <View style={styles.screen}>
        <LiveMap
          driver={driver}
          pickup={pickup}
          dropoff={dropoff}
          target="tour"
          follow="overview"
          dark={isDarkTheme()}
          bottomInset={SHEET_HEIGHT - 40}
          onRoute={setRoute}
        />

        <View style={styles.sheet}>
          <View style={styles.tags}>
            <View style={styles.tagMain}>
              <Text style={styles.tagMainText}>🛵 Nouvelle course</Text>
            </View>
            <View style={styles.tagSoft}>
              <Text style={styles.tagSoftText}>Rien que pour vous</Text>
            </View>
            {live.length > 1 && (
              <View style={styles.tagSoft}>
                <Text style={styles.tagSoftText}>+{live.length - 1}</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.close}
              onPress={() => onAnswer(offer, 'decline')}
              disabled={busy}
              hitSlop={10}
              accessibilityLabel="Refuser la course"
            >
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.amount}>+ {formatEuros(offer.payout)}</Text>
          <View style={styles.guaranteed}>
            <Text style={styles.guaranteedText}>Montant garanti</Text>
          </View>

          <View style={styles.divider} />
          <Text style={styles.line}>
            🕒 {formatMinutes(durationS)} ({formatDistance(distanceM)}) au total
          </Text>

          <View style={styles.divider} />
          <View style={styles.stops}>
            <View style={styles.rail}>
              <View style={styles.dot} />
              <View style={styles.railLine} />
              <View style={styles.square} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.stopName} numberOfLines={1}>
                {offer.pickupStore || 'Commerce'}
              </Text>
              {pickupLine ? (
                <Text style={styles.stopAddress} numberOfLines={1}>
                  {pickupLine}
                </Text>
              ) : null}
              <Text style={[styles.stopName, { marginTop: 8 }]} numberOfLines={1}>
                Livraison
              </Text>
              <Text style={styles.stopAddress} numberOfLines={1}>
                {dropoffLine || 'Adresse exacte à l’acceptation'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.accept}
            activeOpacity={0.85}
            onPress={() => onAnswer(offer, 'accept')}
            disabled={busy}
            accessibilityLabel={`Accepter la course, ${Math.ceil(remaining / 1000)} secondes restantes`}
          >
            {/* Le vert foncé se retire à mesure que le temps de réponse file. */}
            <View style={[styles.acceptFill, { width: `${fraction * 100}%` }]} />
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.acceptText}>Accepter</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  sheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 24,
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: COLORS.primary,
    padding: 18,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingRight: 52 },
  tagMain: { backgroundColor: COLORS.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  tagMainText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  tagSoft: { backgroundColor: COLORS.brandBg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  tagSoftText: { color: COLORS.brandOnBg, fontWeight: '700', fontSize: 14 },
  close: { position: 'absolute', top: 0, right: 0, width: 44, height: 44, borderRadius: 10, backgroundColor: COLORS.raised, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 20, color: COLORS.text, fontWeight: '600' },
  amount: { fontSize: 44, fontWeight: '800', color: COLORS.text, marginTop: 12, letterSpacing: -1 },
  guaranteed: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.raised,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 4,
  },
  guaranteedText: { color: COLORS.text, fontSize: 14 },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 12 },
  line: { fontSize: 17, color: COLORS.text },
  stops: { flexDirection: 'row', gap: 12 },
  rail: { alignItems: 'center', paddingTop: 6, width: 12 },
  dot: { width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: COLORS.text },
  railLine: { width: 2, flex: 1, backgroundColor: COLORS.text, marginVertical: 2, minHeight: 24 },
  square: { width: 9, height: 9, borderWidth: 2, borderColor: COLORS.text },
  stopName: { fontSize: 17, fontWeight: '600', color: COLORS.text },
  stopAddress: { fontSize: 14, color: COLORS.secondary, marginTop: 1 },
  accept: {
    marginTop: 16,
    height: 58,
    borderRadius: 12,
    backgroundColor: COLORS.acceptTrack,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  acceptFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: COLORS.acceptFill },
  acceptText: { color: '#fff', fontSize: 19, fontWeight: '700' },
}));
