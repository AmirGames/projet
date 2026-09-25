import React, { useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { CartLine } from '../lib/carts';

/**
 * Le délai de repentir, comme sur le site (`DelaiAnnulation`) : quelques
 * secondes pour relire la commande avant qu'elle parte. « Retour » ramène à
 * la boutique, le panier intact ; « Parfait » ou la fin du délai l'envoie.
 */
export const CANCEL_DELAY_SECONDS = 10;

interface Props {
  place: string;
  placeDetail?: string;
  timing: string;
  storeName: string;
  lines: CartLine[];
  onGo: () => void;
  onBack: () => void;
}

export function CancelDelay({ place, placeDetail, timing, storeName, lines, onGo, onBack }: Props) {
  const [left, setLeft] = useState(CANCEL_DELAY_SECONDS);
  // Une seule issue : « Parfait » pressé à l'expiration n'envoie pas deux fois.
  const settled = useRef(false);

  const settle = (action: () => void) => {
    if (settled.current) return;
    settled.current = true;
    action();
  };

  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => {
      const rest = Math.max(0, CANCEL_DELAY_SECONDS - Math.floor((Date.now() - start) / 1000));
      setLeft(rest);
      if (rest === 0) clearInterval(timer);
    }, 200);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (left === 0) settle(onGo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);

  const elapsed = ((CANCEL_DELAY_SECONDS - left) / CANCEL_DELAY_SECONDS) * 100;

  return (
    <Modal transparent animationType="slide" onRequestClose={() => settle(onBack)}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Commande en cours…</Text>

          <View style={[styles.row, styles.separator]}>
            <Text style={styles.icon}>📍</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.main} numberOfLines={1}>{place}</Text>
              {placeDetail ? <Text style={styles.sub} numberOfLines={1}>{placeDetail}</Text> : null}
            </View>
          </View>

          <View style={[styles.row, styles.separator]}>
            <Text style={styles.icon}>🕒</Text>
            <Text style={[styles.main, { flex: 1 }]}>{timing}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.icon}>🛍️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.main}>{storeName}</Text>
              <ScrollView style={{ maxHeight: 140 }}>
                {lines.map((l, i) => (
                  <Text key={`${l.productId}-${l.variantId ?? ''}-${i}`} style={styles.sub}>
                    {l.quantity}x  {l.name}
                    {l.variantName ? ` (${l.variantName})` : ''}
                  </Text>
                ))}
              </ScrollView>
            </View>
          </View>

          <TouchableOpacity style={styles.go} onPress={() => settle(onGo)} activeOpacity={0.85}>
            {/* La barre se remplit à mesure que le délai s'écoule. */}
            <View style={[styles.progress, { width: `${elapsed}%` }]} />
            <Text style={styles.goText}>Parfait (00:{String(left).padStart(2, '0')})</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.back} onPress={() => settle(onBack)}>
            <Text style={styles.backText}>Retour</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)', padding: 12 },
  sheet: { backgroundColor: '#fff', borderRadius: 24, padding: 22, marginBottom: 12 },
  title: { fontSize: 24, fontWeight: '800', color: '#111', marginBottom: 12 },
  row: { flexDirection: 'row', gap: 14, paddingVertical: 12 },
  separator: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ddd' },
  icon: { fontSize: 18, width: 26, textAlign: 'center' },
  main: { fontSize: 16, fontWeight: '600', color: '#111' },
  sub: { fontSize: 14, color: '#666', marginTop: 3 },
  go: {
    marginTop: 14,
    borderRadius: 12,
    backgroundColor: '#444',
    paddingVertical: 16,
    alignItems: 'center',
    overflow: 'hidden',
  },
  progress: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#111' },
  goText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  back: { paddingVertical: 14, alignItems: 'center' },
  backText: { fontSize: 17, fontWeight: '600', color: '#111' },
});
