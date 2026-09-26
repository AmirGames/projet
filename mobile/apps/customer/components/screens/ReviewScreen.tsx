import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { apiFetch } from '../../lib/api';
import { OrderDetail, Tracking } from '../../lib/orders';
import { Card, COLORS, ErrorBox, Loading, ScreenHeader, ui } from '../ui';

interface Given {
  rating: number;
  comment?: string | null;
}

interface Draft {
  rating: number;
  comment: string;
}

const from = (given?: Given | null): Draft => (given ? { rating: given.rating, comment: given.comment ?? '' } : { rating: 5, comment: '' });

/**
 * L'avis sur une commande terminée : le commerce, chaque plat, et le livreur
 * quand il y en a eu un. Un seul avis par commerce et par plat, que le client
 * met à jour : le formulaire repart de ce qu'il avait dit.
 */
export default function ReviewScreen({ token, orderId, onBack, onDone }: { token: string; orderId: string; onBack: () => void; onDone: () => void }) {
  const [store, setStore] = useState<Draft>(from(null));
  const [products, setProducts] = useState<{ productId: string; name: string; draft: Draft }[]>([]);
  const [driver, setDriver] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const raw = await apiFetch<OrderDetail & { data?: OrderDetail }>(`/api/orders/${orderId}`, token);
      const order = raw.data ?? raw;
      const given = await apiFetch<{ data: { restaurant: Given | null; produits: Record<string, Given> } }>(
        `/api/reviews/commande/${orderId}`,
        token
      ).catch(() => ({ data: { restaurant: null, produits: {} as Record<string, Given> } }));

      setStore(from(given.data.restaurant));
      // Un plat commandé en deux déclinaisons ne se note qu'une fois.
      const seen = new Map<string, string>();
      order.items.forEach((i) => {
        if (!seen.has(i.productId)) seen.set(i.productId, i.product?.name || 'Produit');
      });
      setProducts([...seen].map(([productId, name]) => ({ productId, name, draft: from(given.data.produits?.[productId]) })));

      if (order.deliveryType !== 'PICKUP') {
        const t = await apiFetch<{ data: Tracking | null }>(`/api/client/deliveries/${orderId}`, token).catch(() => ({ data: null }));
        setDriver(t.data?.driver && t.data.status === 'DELIVERED' && !t.data.maNote ? from(null) : null);
      }
    } catch (e: any) {
      setError(e.message || 'Commande introuvable');
    } finally {
      setLoading(false);
    }
  }, [orderId, token]);

  useEffect(() => {
    load();
  }, [load]);

  const send = async () => {
    setSending(true);
    setError('');
    try {
      const calls: Promise<unknown>[] = [
        apiFetch('/api/reviews', token, {
          method: 'POST',
          body: { orderId, rating: store.rating, comment: store.comment.trim() || undefined, type: 'STORE' },
        }),
        ...products.map((p) =>
          apiFetch('/api/reviews', token, {
            method: 'POST',
            body: { orderId, productId: p.productId, rating: p.draft.rating, comment: p.draft.comment.trim() || undefined, type: 'PRODUCT' },
          })
        ),
      ];
      if (driver) {
        calls.push(
          apiFetch(`/api/client/deliveries/${orderId}/rating`, token, {
            method: 'POST',
            body: { note: driver.rating, commentaire: driver.comment.trim() || undefined },
          })
        );
      }
      const results = await Promise.allSettled(calls);
      const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      if (failed.length) {
        setError(failed[0].reason?.message || 'Une partie de vos avis n’a pas été enregistrée.');
        return;
      }
      Alert.alert('Merci !', 'Votre avis est enregistré.');
      onDone();
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1 }}>
        <ScreenHeader title="Mon avis ⭐" onBack={onBack} />
        <Loading />
      </View>
    );
  }
  if (error && products.length === 0) {
    return (
      <View style={{ flex: 1 }}>
        <ScreenHeader title="Mon avis ⭐" onBack={onBack} />
        <ErrorBox message={error} onRetry={load} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title="Mon avis ⭐" onBack={onBack} />
      <ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
        <Card title="Le commerce">
          <Rating draft={store} onChange={setStore} placeholder="Accueil, rapidité, qualité…" />
        </Card>

        {driver && (
          <Card title="Le livreur">
            <Rating draft={driver} onChange={setDriver} placeholder="Ponctualité, amabilité…" />
          </Card>
        )}

        {products.length > 0 && (
          <Card title="Les plats">
            {products.map((p, i) => (
              <View key={p.productId} style={[styles.product, i === products.length - 1 && { borderBottomWidth: 0 }]}>
                <Text style={styles.productName}>{p.name}</Text>
                <Rating
                  draft={p.draft}
                  onChange={(draft) => setProducts((list) => list.map((x) => (x.productId === p.productId ? { ...x, draft } : x)))}
                  placeholder="Un mot sur ce plat (facultatif)"
                />
              </View>
            ))}
          </Card>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity style={[styles.send, sending && { opacity: 0.6 }]} onPress={send} disabled={sending}>
          {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendText}>Envoyer mon avis</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Rating({ draft, onChange, placeholder }: { draft: Draft; onChange: (d: Draft) => void; placeholder: string }) {
  return (
    <View>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <TouchableOpacity key={n} onPress={() => onChange({ ...draft, rating: n })} hitSlop={6}>
            <Text style={[styles.star, n <= draft.rating && styles.starOn]}>★</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        style={styles.input}
        value={draft.comment}
        onChangeText={(comment) => onChange({ ...draft, comment })}
        placeholder={placeholder}
        placeholderTextColor="#999"
        multiline
        maxLength={1000}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stars: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  star: { fontSize: 34, color: '#ddd' },
  starOn: { color: '#FFB300' },
  input: {
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.text,
    minHeight: 44,
  },
  product: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  productName: { fontSize: 15, fontWeight: '600', color: COLORS.text, marginBottom: 4 },
  error: { color: COLORS.danger, textAlign: 'center', marginBottom: 10 },
  send: { backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 15, alignItems: 'center' },
  sendText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
