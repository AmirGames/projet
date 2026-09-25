import React, { useCallback, useEffect, useState } from 'react';
import { Image, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiFetch, formatEuros, mediaUrl } from '../../lib/api';
import {
  callPhone,
  DELIVERY_STATUS,
  hhmm,
  itemName,
  OrderDetail,
  orderStatus,
  REJECTION_REASONS,
  shortId,
  Tracking,
  VEHICLE_LABELS,
} from '../../lib/orders';
import { useRealtimeEvent, useRoom } from '../../lib/realtime';
import LiveMap, { RouteInfo } from '../LiveMap';
import type { DeliveryUpdate, OrderUpdate } from '../../lib/useCustomerRealtime';
import { Card, COLORS, ErrorBox, Loading, Row, ScreenHeader, ui } from '../ui';

const STEPS = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED'];

const toPoint = (p?: { latitude: number; longitude: number } | null) =>
  p ? { lat: p.latitude, lng: p.longitude } : null;

/** Le suivi d'une commande, en direct : étapes, heure annoncée, livreur et code de remise. */
export default function OrderScreen({
  token,
  orderId,
  onBack,
  onReview,
}: {
  token: string;
  orderId: string;
  onBack: () => void;
  onReview: (orderId: string) => void;
}) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [tracking, setTracking] = useState<Tracking | null>(null);
  const [review, setReview] = useState<{ aRedemander: boolean; dejaDonne: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ title: string; message: string } | null>(null);
  const [route, setRoute] = useState<RouteInfo | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const [o, t] = await Promise.all([
        apiFetch<OrderDetail & { data?: OrderDetail }>(`/api/orders/${orderId}`, token),
        apiFetch<{ data: Tracking | null }>(`/api/client/deliveries/${orderId}`, token).catch(() => ({ data: null })),
      ]);
      // Cette route renvoie la commande directement, sans l'envelopper dans « data ».
      setOrder(o.data ?? o);
      setTracking(t.data);
    } catch (e: any) {
      setError(e.message || 'Commande introuvable');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderId, token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (order?.status !== 'COMPLETED') return;
    apiFetch<{ data: { aRedemander: boolean; restaurant: unknown } }>(`/api/reviews/commande/${orderId}`, token)
      .then((res) => setReview({ aRedemander: res.data.aRedemander, dejaDonne: Boolean(res.data.restaurant) }))
      .catch(() => undefined);
  }, [order?.status, orderId, token]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(id);
  }, [toast]);

  useRoom('order', orderId);
  useRealtimeEvent('order-update', (u: OrderUpdate) => {
    if (u.orderId !== orderId) return;
    setOrder((o) => (o ? { ...o, status: u.status } : o));
    if (u.title && u.message) setToast({ title: u.title, message: u.message });
    // L'heure annoncée, le motif d'un refus : la commande est relue entière.
    load();
  });
  useRealtimeEvent('delivery-update', (u: DeliveryUpdate) => {
    if (u.orderId !== orderId) return;
    setTracking((t) => {
      if (!t) return t;
      const next = { ...t };
      if (u.location) next.position = { ...u.location, misAJourLe: new Date().toISOString() };
      if (typeof u.gpsLost === 'boolean') next.gpsPerdu = u.gpsLost;
      if (u.livreurProche) next.livreurProche = true;
      if (u.status) next.status = u.status;
      return next;
    });
    if (u.livreurProche) setToast({ title: 'Votre livreur est bientôt là', message: 'Vous pouvez descendre devant la porte.' });
    if (u.status) load();
  });
  useRealtimeEvent('reconnecte', load);

  if (loading) {
    return (
      <View style={{ flex: 1 }}>
        <ScreenHeader title="Commande" onBack={onBack} />
        <Loading />
      </View>
    );
  }
  if (error || !order) {
    return (
      <View style={{ flex: 1 }}>
        <ScreenHeader title="Commande" onBack={onBack} />
        <ErrorBox message={error || 'Commande introuvable'} onRetry={load} />
      </View>
    );
  }

  const st = orderStatus(order.status);
  const rejected = order.status === 'REJECTED';
  const stepIndex = STEPS.indexOf(order.status);
  const delivery = order.deliveryType === 'DELIVERY';
  const code = tracking?.codeRemise ?? order.codeRemise;
  const awaitingPayment = !order.submittedAt && order.paymentStatus === 'PENDING' && !rejected;
  const photo = mediaUrl(tracking?.photoDepot);
  const driver = tracking?.driver;
  const subtotal = order.items.reduce((s, i) => s + Number(i.total), 0);

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title={`Commande ${shortId(order.id)}`} subtitle={new Date(order.createdAt).toLocaleString('fr-FR')} onBack={onBack} />
      <ScrollView
        contentContainerStyle={ui.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {toast && (
          <View style={styles.toast}>
            <Text style={styles.toastTitle}>🔔 {toast.title}</Text>
            <Text style={styles.toastText}>{toast.message}</Text>
          </View>
        )}

        <View style={[styles.status, { borderLeftColor: st.color }]}>
          <Text style={styles.statusIcon}>{st.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.statusLabel, { color: st.color }]}>{awaitingPayment ? 'Paiement non finalisé' : st.label}</Text>
            {order.estimatedReadyAt && !rejected && order.status !== 'COMPLETED' ? (
              <Text style={styles.statusHint}>
                {delivery ? 'Prête vers' : 'À retirer vers'} {hhmm(order.estimatedReadyAt)}
              </Text>
            ) : null}
            {!delivery && order.pickupTime && !order.estimatedReadyAt ? (
              <Text style={styles.statusHint}>Retrait prévu à {hhmm(order.pickupTime)}</Text>
            ) : null}
            {order.status === 'PENDING' && !awaitingPayment ? (
              <Text style={styles.statusHint}>Le commerce va confirmer votre commande.</Text>
            ) : null}
            {awaitingPayment ? (
              <Text style={styles.statusHint}>La commande n’est transmise au commerce qu’une fois payée.</Text>
            ) : null}
          </View>
        </View>

        {rejected ? (
          <Card title="Commande annulée">
            <Text style={styles.reason}>{REJECTION_REASONS[order.rejectionReason || ''] || REJECTION_REASONS.OTHER}</Text>
            {order.rejectionNote ? <Text style={styles.help}>« {order.rejectionNote} »</Text> : null}
            {order.paymentStatus === 'REFUNDED' || order.paymentStatus === 'SUCCEEDED' ? (
              <Text style={styles.help}>Un paiement en ligne est remboursé automatiquement.</Text>
            ) : null}
          </Card>
        ) : (
          <View style={styles.steps}>
            {STEPS.map((s, i) => (
              <View key={s} style={styles.step}>
                <View style={[styles.stepDot, i <= stepIndex && { backgroundColor: COLORS.primary }]} />
                <Text style={[styles.stepText, i <= stepIndex && styles.stepTextDone]} numberOfLines={2}>
                  {s === 'COMPLETED' ? (delivery ? 'Livrée' : 'Retirée') : orderStatus(s).label.replace(' du commerce', '')}
                </Text>
              </View>
            ))}
          </View>
        )}

        {delivery && tracking && !rejected && (
          <Card title="Livraison">
            {tracking.livreurProche && tracking.status === 'PICKED_UP' && (
              <View style={styles.near}>
                <Text style={styles.nearText}>🛵 Votre livreur est bientôt là : vous pouvez descendre.</Text>
              </View>
            )}
            <Row label="Étape" value={DELIVERY_STATUS[tracking.status] || tracking.status} />
            {tracking.distanceRestanteKm != null && tracking.status !== 'DELIVERED' && (
              <Row label="Distance restante" value={`${tracking.distanceRestanteKm.toFixed(1).replace('.', ',')} km`} />
            )}
            {tracking.gpsPerdu && tracking.status !== 'DELIVERED' && (
              <Text style={styles.help}>La position du livreur ne se met plus à jour pour le moment.</Text>
            )}
            {driver && (
              <View style={styles.driver}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{(driver.name || 'L')[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.driverName}>{driver.name?.split(' ')[0] || 'Votre livreur'}</Text>
                  <Text style={styles.help}>
                    {[
                      VEHICLE_LABELS[driver.vehicleType || ''],
                      driver.rating != null ? `★ ${driver.rating.toFixed(1).replace('.', ',')} (${driver.avis})` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                {driver.phone && tracking.status !== 'DELIVERED' ? (
                  <TouchableOpacity style={styles.smallButton} onPress={() => callPhone(driver.phone)}>
                    <Text style={styles.smallButtonText}>📞 Appeler</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
            {['ACCEPTED', 'PICKED_UP'].includes(tracking.status) && (tracking.position || tracking.destination) && (
              <View style={styles.map}>
                <LiveMap
                  driver={toPoint(tracking.position)}
                  pickup={toPoint(tracking.retrait)}
                  dropoff={toPoint(tracking.destination)}
                  target={tracking.status === 'PICKED_UP' ? 'dropoff' : 'pickup'}
                  follow="overview"
                  height={260}
                  onRoute={setRoute}
                />
                {route && tracking.status === 'PICKED_UP' && !tracking.gpsPerdu ? (
                  <Text style={styles.eta}>
                    🕒 Arrivée dans {Math.max(1, Math.round(route.durationS / 60))} min environ
                  </Text>
                ) : null}
              </View>
            )}
          </Card>
        )}

        {delivery && code && !rejected ? (
          <View style={styles.code}>
            <Text style={styles.codeLabel}>Code de remise</Text>
            <Text style={styles.codeValue}>{code.split('').join(' ')}</Text>
            <Text style={styles.codeHint}>Donnez ce code au livreur à la porte : il confirme que la commande vous a été remise.</Text>
          </View>
        ) : null}

        {photo ? (
          <Card title="Déposée devant chez vous">
            <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" />
            {tracking?.noteDepot ? <Text style={styles.help}>{tracking.noteDepot}</Text> : null}
          </Card>
        ) : null}

        {order.status === 'COMPLETED' && review && (review.aRedemander || !review.dejaDonne || (tracking?.driver && !tracking.maNote)) ? (
          <TouchableOpacity style={styles.reviewButton} onPress={() => onReview(order.id)}>
            <Text style={styles.reviewButtonText}>⭐ Donner mon avis</Text>
          </TouchableOpacity>
        ) : null}

        <Card title={delivery ? 'Livrée à' : 'Retrait'}>
          <Text style={styles.address}>
            {delivery ? [order.deliveryAddress, order.deliveryCity].filter(Boolean).join(', ') || '—' : tracking?.boutique || 'Au commerce'}
          </Text>
          {order.notes ? <Text style={styles.help}>📝 {order.notes}</Text> : null}
        </Card>

        <Card title="Détail">
          {order.items.map((i) => (
            <Row key={i.id} label={`${i.quantity}× ${itemName(i)}`} value={formatEuros(i.total)} />
          ))}
          <Row label="Sous-total" value={formatEuros(subtotal)} />
          {Number(order.feesAmount) > 0 && <Row label="Livraison" value={formatEuros(order.feesAmount)} />}
          {Number(order.serviceFeeAmount) > 0 && <Row label="Frais de service" value={formatEuros(order.serviceFeeAmount)} />}
          {Number(order.discountAmount) > 0 && (
            <Row label={`Remise${order.promoCode ? ` (${order.promoCode})` : ''}`} value={`− ${formatEuros(order.discountAmount)}`} />
          )}
          <Row label="Total" value={<Text style={styles.total}>{formatEuros(order.totalAmount)}</Text>} />
          <Row label="Paiement" value={order.paymentMethodName || '—'} last />
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: { backgroundColor: '#1B5E20', borderRadius: 10, padding: 12, marginBottom: 12 },
  toastTitle: { color: '#fff', fontWeight: '700', fontSize: 15 },
  toastText: { color: '#fff', opacity: 0.9, marginTop: 2 },
  status: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderLeftWidth: 5,
  },
  statusIcon: { fontSize: 30 },
  statusLabel: { fontSize: 18, fontWeight: '800' },
  statusHint: { fontSize: 14, color: '#555', marginTop: 3 },
  steps: { flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: 10, padding: 12, marginBottom: 12 },
  step: { flex: 1, alignItems: 'center' },
  stepDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: COLORS.border, marginBottom: 6 },
  stepText: { fontSize: 11, color: COLORS.muted, textAlign: 'center' },
  stepTextDone: { color: COLORS.text, fontWeight: '600' },
  reason: { fontSize: 14, color: COLORS.danger, fontWeight: '600' },
  help: { fontSize: 13, color: '#666', marginTop: 4 },
  near: { backgroundColor: '#E8F5E9', borderRadius: 8, padding: 10, marginBottom: 6 },
  nearText: { color: '#1B5E20', fontWeight: '700' },
  driver: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  driverName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  smallButton: { backgroundColor: COLORS.bg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  smallButtonText: { color: COLORS.primary, fontWeight: '600' },
  map: { marginTop: 12 },
  eta: { fontSize: 14, fontWeight: '700', color: COLORS.primary, marginTop: 8, textAlign: 'center' },
  code: { backgroundColor: COLORS.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 12 },
  codeLabel: { color: '#fff', opacity: 0.85, fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  codeValue: { color: '#fff', fontSize: 40, fontWeight: '800', letterSpacing: 4, marginVertical: 6 },
  codeHint: { color: '#fff', opacity: 0.85, fontSize: 13, textAlign: 'center' },
  photo: { width: '100%', height: 220, borderRadius: 8, backgroundColor: COLORS.bg },
  reviewButton: { backgroundColor: '#FFB300', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 12 },
  reviewButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  address: { fontSize: 14, color: COLORS.text },
  total: { fontSize: 16, fontWeight: '800', color: COLORS.text },
});
