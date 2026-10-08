import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Linking, Modal, Text, TouchableOpacity, Vibration, View } from 'react-native';
import { apiFetch } from '../lib/api';
import { Delivery, distanceM, shortId } from '../lib/deliveries';
import type { Position } from '../lib/useDriverLocation';
import { COLORS, themedStyles } from './ui';

/** Immobile depuis ce temps en pleine course : on lui demande si tout va bien. */
const STILL_AFTER_MS = 3 * 60 * 1000;
/** En deçà de ce déplacement, il n'a pas bougé (le GPS dérive de quelques mètres). */
const MOVED_M = 40;
/** Même marge GPS que l'attente validée par le serveur au pied d'un immeuble. */
const STOP_RADIUS_M = 500;
const CHECK_EVERY_MS = 15_000;

/**
 * « Tout va bien ? » : un livreur qui ne bouge plus depuis trois minutes en
 * pleine course a peut-être chuté, crevé ou eu un accident. Il le dit d'un
 * geste, ou appelle les secours ; le support est alors prévenu.
 */
export default function SafetyCheck({
  token,
  deliveries,
  position,
}: {
  token: string;
  /** Les courses en cours (une tournée peut en compter trois). */
  deliveries: Delivery[];
  position: Position | null;
}) {
  const delivery = deliveries[0] ?? null;
  // Une clé stable : la surveillance ne repart pas à chaque rendu.
  const key = deliveries.map((d) => `${d.id}:${d.status}:${d.attenteFinLe ?? ''}`).join(',');
  const waitingForCustomer = deliveries.some((d) => d.status === 'PICKED_UP' && Boolean(d.attenteFinLe));
  const [open, setOpen] = useState(false);
  const anchor = useRef<{ lat: number; lng: number; since: number } | null>(null);
  const state = useRef({ deliveries, position, open });
  useLayoutEffect(() => {
    state.current = { deliveries, position, open };
  }, [deliveries, position, open]);
  const hasDelivery = Boolean(delivery);

  // Chaque déplacement réel relance le compteur.
  useEffect(() => {
    if (!position) return;
    const a = anchor.current;
    if (!a || distanceM(a, position) > MOVED_M) {
      anchor.current = { lat: position.lat, lng: position.lng, since: Date.now() };
    }
  }, [position]);

  // Plus de course : plus de surveillance.
  const sansSurveillance = !hasDelivery || waitingForCustomer;
  if (sansSurveillance && open) setOpen(false);
  useEffect(() => {
    if (sansSurveillance) anchor.current = null;
  }, [key, sansSurveillance]);

  useEffect(() => {
    if (!hasDelivery) return;
    const id = setInterval(() => {
      const { deliveries: list, position: p, open: shown } = state.current;
      const a = anchor.current;
      if (list.some((d) => d.status === 'PICKED_UP' && Boolean(d.attenteFinLe))) return;
      if (list.length === 0 || !p || !a || shown) return;
      if (Date.now() - a.since < STILL_AFTER_MS) return;

      // Arrêt normal : à un commerce avant la prise en charge, chez un client
      // après — n'importe lequel de la tournée.
      const stops = list.flatMap((d) => {
        const pts: { lat: number; lng: number }[] = [];
        if (d.pickupLat != null && d.pickupLng != null && d.status !== 'PICKED_UP') pts.push({ lat: d.pickupLat, lng: d.pickupLng });
        if (d.latitude != null && d.longitude != null && d.status === 'PICKED_UP') pts.push({ lat: d.latitude, lng: d.longitude });
        return pts;
      });
      if (stops.some((stop) => distanceM(p, stop) <= STOP_RADIUS_M)) {
        anchor.current = { lat: p.lat, lng: p.lng, since: Date.now() };
        return;
      }

      setOpen(true);
      Vibration.vibrate([0, 600, 300, 600, 300, 600]);
    }, CHECK_EVERY_MS);
    return () => clearInterval(id);
  }, [key, hasDelivery]);

  const allGood = () => {
    // Trois nouvelles minutes avant de redemander.
    anchor.current = position ? { lat: position.lat, lng: position.lng, since: Date.now() } : null;
    setOpen(false);
  };

  const callEmergency = () => {
    Linking.openURL('tel:112').catch(() => undefined);
    // Le support sait aussitôt qu'un livreur a appelé les secours, et où.
    const where = position ? ` Position : https://maps.google.com/?q=${position.lat},${position.lng}` : '';
    apiFetch('/api/drivers/support/messages', token, {
      method: 'POST',
      body: {
        body: `🚨 J'ai appelé le 112 pendant la course ${delivery ? shortId(delivery.orderId) : ''}.${where}`,
      },
    }).catch(() => undefined);
    anchor.current = position ? { lat: position.lat, lng: position.lng, since: Date.now() } : null;
    setOpen(false);
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={allGood}>
      <View style={styles.backdrop}>
        <View style={styles.box}>
          <Text style={styles.icon}>⚠️</Text>
          <Text style={styles.title}>Tout va bien ?</Text>
          <Text style={styles.text}>
            Vous n’avez pas bougé depuis plus de 3 minutes pendant votre course.
          </Text>
          <TouchableOpacity style={styles.ok} onPress={allGood}>
            <Text style={styles.okText}>👍 Tout va bien, je continue</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sos} onPress={callEmergency}>
            <Text style={styles.sosText}>🚨 Appeler le 112</Text>
          </TouchableOpacity>
          <Text style={styles.note}>Le support ZupEat sera prévenu de votre appel.</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 24 },
  box: { backgroundColor: COLORS.card, borderRadius: 16, padding: 22, alignItems: 'center' },
  icon: { fontSize: 44 },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.text, marginTop: 6 },
  text: { fontSize: 15, color: COLORS.secondary, textAlign: 'center', marginTop: 8, marginBottom: 18 },
  ok: { alignSelf: 'stretch', backgroundColor: COLORS.success, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  okText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  sos: { alignSelf: 'stretch', backgroundColor: '#C62828', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 10 },
  sosText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  note: { fontSize: 12, color: COLORS.muted, marginTop: 10, textAlign: 'center' },
}));
