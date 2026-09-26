import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { apiFetch } from '../../lib/api';
import { Delivery, distanceM, formatDistance, MAX_COURSES, openNavigation, shortId, Stop } from '../../lib/deliveries';
import { isNetworkError } from '../../lib/network';
import { readJson, writeJson } from '../../lib/offlineStore';
import { useRealtimeEvent } from '../../lib/realtime';
import type { Prefs } from '../../lib/session';
import type { Position, Tracking } from '../../lib/useDriverLocation';
import { Card, COLORS, ScreenHeader, themedStyles, ui } from '../ui';

/**
 * Plusieurs courses à la fois : les arrêts dans l'ordre, commerces et
 * clients mêlés, le prochain en tête. Le serveur calcule l'ordre depuis la
 * position du livreur ; un retrait vient toujours avant sa remise.
 *
 * Toucher un arrêt ouvre sa course : c'est là que se font la prise en charge
 * et la remise, comme pour une course seule.
 *
 * Sans réseau, la dernière tournée reçue s'affiche, ajustée à ce que le
 * téléphone sait déjà (une course livrée n'y figure plus).
 */
export default function TourneeScreen({
  token,
  deliveries,
  position,
  navigationApp,
  maxCourses = MAX_COURSES,
  onOpenDelivery,
  onTrackingChange,
}: {
  token: string;
  /** Les courses en cours, étapes faites sans réseau comprises. */
  deliveries: Delivery[];
  position: Position | null;
  navigationApp: Prefs['navigationApp'];
  /** Le réglage de la plateforme. */
  maxCourses?: number;
  onOpenDelivery: (deliveryId: string) => void;
  onTrackingChange: (tracking: Tracking) => void;
}) {
  const [stops, setStops] = useState<Stop[] | null>(null);
  // Les livraisons que le serveur garde pour plus tard.
  const [masked, setMasked] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: { arrets: Stop[]; remisesMasquees?: number } }>('/api/drivers/tournee', token);
      setStops(res.data.arrets);
      setMasked(res.data.remisesMasquees ?? 0);
      writeJson('tournee', res.data.arrets);
    } catch (e) {
      if (isNetworkError(e)) {
        const cached = await readJson<Stop[]>('tournee');
        if (cached) setStops((current) => current || cached);
      }
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  // Une course de plus ou de moins, une étape franchie : l'ordre se recalcule.
  const key = deliveries.map((d) => `${d.id}:${d.status}`).join(',');
  useEffect(() => {
    load();
  }, [load, key]);
  useRealtimeEvent('donnees-modifiees', (m: { ressource?: string }) => {
    if (m?.ressource === 'orders') load();
  });

  // Ce que le téléphone sait d'avance sur le serveur : une commande prise
  // sans réseau n'a plus de retrait, une course livrée plus d'arrêt.
  const statut = new Map(deliveries.map((d) => [d.id, d.status]));
  const enCours = (stops || fallbackStops(deliveries)).filter((s) => {
    const st = statut.get(s.deliveryId);
    if (!st) return false;
    return !(s.type === 'RETRAIT' && st === 'PICKED_UP');
  });
  // Les clients n'apparaissent qu'une fois toutes les commandes en main :
  // d'abord tous les retraits, puis les remises.
  // Puis un seul client à la fois : le suivant n'apparaît qu'une fois le
  // précédent livré (le serveur en décide, et refuse une remise hors tour).
  const retraitsRestants = enCours.filter((s) => s.type === 'RETRAIT').length;
  const visible =
    retraitsRestants > 0 ? enCours.filter((s) => s.type === 'RETRAIT') : enCours.filter((s) => s.type === 'REMISE').slice(0, 1);
  const remisesMasquees = retraitsRestants > 0 ? deliveries.length : Math.max(masked, deliveries.length - visible.length);
  const next = visible[0];

  // Le GPS s'affine à l'approche du prochain arrêt.
  const onTrackingRef = useRef(onTrackingChange);
  onTrackingRef.current = onTrackingChange;
  useEffect(() => {
    onTrackingRef.current({
      target: next?.lat != null && next?.lng != null ? { lat: next.lat, lng: next.lng } : null,
      navigating: false,
    });
  }, [next?.lat, next?.lng]);

  const navigate = (stop: Stop) => {
    if (navigationApp === 'zupone') {
      onOpenDelivery(stop.deliveryId);
      return;
    }
    openNavigation({ lat: stop.lat, lng: stop.lng, address: stop.adresse }, navigationApp);
  };

  const courses = deliveries.length;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.raised }}>
      <ScreenHeader
        title={`Tournée · ${courses} course${courses > 1 ? 's' : ''}`}
        subtitle={courses >= maxCourses ? 'Complète : plus de course ajoutée' : 'D’autres courses sur votre trajet peuvent s’ajouter'}
      />
      <ScrollView
        contentContainerStyle={ui.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        }
      >
        {next && (
          <View style={styles.next}>
            <Text style={styles.nextLabel}>Prochain arrêt</Text>
            <Text style={styles.nextName}>
              {next.type === 'RETRAIT' ? '🏪' : '📍'} {next.nom}
            </Text>
            <Text style={styles.nextAddress}>{next.adresse}</Text>
            {position && next.lat != null && next.lng != null && (
              <Text style={styles.nextDistance}>
                À {formatDistance(distanceM(position, { lat: next.lat, lng: next.lng }))}
              </Text>
            )}
            <View style={styles.nextActions}>
              <TouchableOpacity style={styles.primary} onPress={() => onOpenDelivery(next.deliveryId)}>
                <Text style={styles.primaryText}>{next.type === 'RETRAIT' ? 'Prendre la commande' : 'Remettre la commande'}</Text>
              </TouchableOpacity>
              {navigationApp !== 'zupone' && (
                <TouchableOpacity style={styles.secondary} onPress={() => navigate(next)}>
                  <Text style={styles.secondaryText}>🧭 GPS</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        <Card title={retraitsRestants > 0 ? 'Commandes à récupérer' : 'Livraison en cours'}>
          {visible.map((s, i) => {
            const d = deliveries.find((x) => x.id === s.deliveryId);
            return (
              <TouchableOpacity
                key={`${s.deliveryId}-${s.type}`}
                style={[styles.row, i === visible.length - 1 && { borderBottomWidth: 0 }]}
                onPress={() => onOpenDelivery(s.deliveryId)}
              >
                <View style={[styles.index, i === 0 && styles.indexNext]}>
                  <Text style={[styles.indexText, i === 0 && { color: '#fff' }]}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {s.type === 'RETRAIT' ? `🏪 Prendre · ${s.nom}` : `📍 Remettre · ${s.nom}`}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {shortId(d?.orderId || s.orderId)} · {s.adresse}
                  </Text>
                  {s.type === 'RETRAIT' && !s.commandePrete && d?.orderStatus !== 'READY' && (
                    <Text style={styles.rowWaiting}>En préparation</Text>
                  )}
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            );
          })}
          {(remisesMasquees > 0 || visible.length === 0) && (
            <Text style={styles.hidden}>
              {retraitsRestants > 0
                ? `🔒 ${remisesMasquees} livraison${remisesMasquees > 1 ? 's' : ''} : les adresses des clients s’afficheront une fois toutes les commandes récupérées.`
                : visible.length === 0
                  ? '🔒 Le prochain client s’affichera dès le retour du réseau.'
                  : `🔒 ${remisesMasquees} autre${remisesMasquees > 1 ? 's' : ''} livraison${remisesMasquees > 1 ? 's' : ''} : chaque client s’affiche une fois le précédent livré.`}
            </Text>
          )}
        </Card>
      </ScrollView>
    </View>
  );
}

/** Sans tournée du serveur (jamais reçue, pas de réseau) : les retraits, puis les remises. */
function fallbackStops(deliveries: Delivery[]): Stop[] {
  const stop = (d: Delivery, type: Stop['type']): Stop => ({
    deliveryId: d.id,
    orderId: d.orderId,
    type,
    statutCourse: d.status,
    commandePrete: d.orderStatus === 'READY',
    nom: type === 'RETRAIT' ? d.pickupStore || 'Commerce' : d.customerName || 'Client',
    adresse: type === 'RETRAIT' ? d.pickupAddress : d.deliveryAddress,
    lat: type === 'RETRAIT' ? (d.pickupLat ?? null) : (d.latitude ?? null),
    lng: type === 'RETRAIT' ? (d.pickupLng ?? null) : (d.longitude ?? null),
  });
  return [...deliveries.map((d) => stop(d, 'RETRAIT')), ...deliveries.map((d) => stop(d, 'REMISE'))];
}

const styles = themedStyles(() => ({
  next: { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 2, borderColor: COLORS.primary },
  nextLabel: { fontSize: 13, color: COLORS.secondary, fontWeight: '600' },
  nextName: { fontSize: 22, fontWeight: '700', color: COLORS.text, marginTop: 4 },
  nextAddress: { fontSize: 14, color: COLORS.secondary, marginTop: 2 },
  nextDistance: { fontSize: 15, color: COLORS.text, marginTop: 8, fontWeight: '600' },
  nextActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  primary: { flex: 1, backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondary: { backgroundColor: COLORS.raised, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center' },
  secondaryText: { color: COLORS.link, fontSize: 16, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  index: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexNext: { backgroundColor: COLORS.primary },
  indexText: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  rowTitle: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  rowMeta: { fontSize: 13, color: COLORS.secondary, marginTop: 2 },
  rowWaiting: { fontSize: 12, color: COLORS.warning, marginTop: 2, fontWeight: '600' },
  chevron: { fontSize: 22, color: COLORS.muted },
  hidden: { fontSize: 13, color: COLORS.secondary, marginTop: 10 },
}));
