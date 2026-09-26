import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiFetch, formatEuros } from '../../lib/api';
import { addLine, CartLine, cartTotal, itemCount } from '../../lib/carts';
import { useRealtimeEvent, useRoom } from '../../lib/realtime';
import type { DeliveryAddress } from '../../lib/session';
import {
  DeliveryVerdict,
  formatRating,
  Product,
  productImage,
  StoreDetail,
  storeLogo,
  Variant,
} from '../../lib/stores';
import { COLORS, ErrorBox, Loading, ScreenHeader } from '../ui';

/** La vitrine d'un commerce : son menu, rangé par catégorie, et le panier de ce commerce. */
export default function StoreScreen({
  token,
  storeId,
  address,
  lines,
  onChangeLines,
  onBack,
  onCheckout,
}: {
  token: string;
  storeId: string;
  address: DeliveryAddress | null;
  lines: CartLine[];
  onChangeLines: (lines: CartLine[], store: { id: string; name: string; logo?: string | null }) => void;
  onBack: () => void;
  onCheckout: () => void;
}) {
  const [store, setStore] = useState<StoreDetail | null>(null);
  const [verdict, setVerdict] = useState<DeliveryVerdict | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [picked, setPicked] = useState<Product | null>(null);
  const list = useRef<SectionList<Product>>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await apiFetch<{ data: StoreDetail }>(`/api/client/stores/${storeId}`, null);
      setStore(res.data);
    } catch (e: any) {
      setError(e.status === 423 ? 'Ce commerce est momentanément fermé.' : e.message || 'Vitrine indisponible');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    load();
  }, [load]);

  // Livré ou non à l'adresse retenue, à quels frais, à partir de quel montant.
  useEffect(() => {
    if (!address) return;
    const params =
      address.latitude != null && address.longitude != null
        ? `lat=${address.latitude}&lng=${address.longitude}`
        : `adresse=${encodeURIComponent([address.street, address.postalCode, address.city].filter(Boolean).join(' '))}`;
    apiFetch<{ data: DeliveryVerdict }>(`/api/client/stores/${storeId}/zone-livraison?${params}`, null)
      .then((res) => setVerdict(res.data))
      .catch(() => setVerdict(null));
  }, [storeId, address]);

  useEffect(() => {
    apiFetch<{ data: { storeId: string }[] }>('/api/client/me/favorites', token)
      .then((res) => setFavorite((res.data || []).some((f) => f.storeId === storeId)))
      .catch(() => undefined);
  }, [token, storeId]);

  // Un plat épuisé pendant que le client regarde le menu disparaît du choix
  // aussitôt, et de son panier avec.
  useRoom('store', storeId);
  useRealtimeEvent('produit-disponibilite', (c: { productId: string; storeId?: string; isAvailable: boolean; name?: string }) => {
    if (c.storeId && c.storeId !== storeId) return;
    setStore((s) => (s ? { ...s, menu: mapProducts(s.menu, (p) => (p.id === c.productId ? { ...p, isAvailable: c.isAvailable } : p)) } : s));
    if (!c.isAvailable && lines.some((l) => l.productId === c.productId) && store) {
      onChangeLines(lines.filter((l) => l.productId !== c.productId), { id: store.id, name: store.name, logo: store.settings?.logo });
      Alert.alert('Plat épuisé', `${c.name || 'Un plat'} n'est plus disponible : il a été retiré de votre panier.`);
    }
  });
  useRealtimeEvent('produit-declinaisons', (c: { productId: string; storeId?: string; variantes: Variant[] }) => {
    if (c.storeId && c.storeId !== storeId) return;
    setStore((s) => (s ? { ...s, menu: mapProducts(s.menu, (p) => (p.id === c.productId ? { ...p, variants: c.variantes } : p)) } : s));
  });

  const sections = useMemo(
    () => Object.entries(store?.menu || {}).map(([title, data]) => ({ title, data })),
    [store?.menu]
  );

  const toggleFavorite = async () => {
    const next = !favorite;
    setFavorite(next);
    try {
      if (next) await apiFetch('/api/client/me/favorites', token, { method: 'POST', body: { storeId } });
      else await apiFetch(`/api/client/me/favorites/${storeId}`, token, { method: 'DELETE' });
    } catch (e: any) {
      // « Déjà en favoris » : l'état voulu est atteint.
      if (!/déjà/i.test(e.message || '')) setFavorite(!next);
    }
  };

  const scrollTo = (title: string) => {
    const index = sections.findIndex((s) => s.title === title);
    if (index < 0) return;
    setCategory(title);
    list.current?.scrollToLocation({ sectionIndex: index, itemIndex: 0, viewOffset: 0, animated: true });
  };

  if (loading) {
    return (
      <View style={{ flex: 1 }}>
        <ScreenHeader title="Vitrine" onBack={onBack} />
        <Loading />
      </View>
    );
  }
  if (error || !store) {
    return (
      <View style={{ flex: 1 }}>
        <ScreenHeader title="Vitrine" onBack={onBack} />
        <ErrorBox message={error || 'Vitrine indisponible'} onRetry={load} />
      </View>
    );
  }

  const open = store.isOpenNow !== false && !store.enAttenteDeValidation;
  const logo = storeLogo(store);
  const rating = formatRating(store.averageRating, store.reviewCount);
  const count = itemCount(lines);
  const storeRef = { id: store.id, name: store.name, logo: store.settings?.logo };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.back}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {store.name}
        </Text>
        <TouchableOpacity onPress={toggleFavorite} hitSlop={10}>
          <Text style={styles.heart}>{favorite ? '❤️' : '🤍'}</Text>
        </TouchableOpacity>
      </View>

      <SectionList
        ref={list}
        sections={sections}
        keyExtractor={(p) => p.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.list}
        onScrollToIndexFailed={() => undefined}
        ListHeaderComponent={
          <View>
            <View style={styles.info}>
              <View style={styles.logoBox}>
                {logo ? <Image source={{ uri: logo }} style={styles.logo} resizeMode="contain" /> : <Text style={{ fontSize: 30 }}>🍽️</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.storeName}>{store.name}</Text>
                <Text style={styles.meta}>{[store.genreLibelle, rating].filter(Boolean).join(' · ') || 'Nouveau sur Zupone'}</Text>
                <Text style={styles.meta} numberOfLines={2}>
                  {[store.address, store.city].filter(Boolean).join(', ')}
                </Text>
                <Text style={[styles.openState, { color: open ? COLORS.success : COLORS.danger }]}>
                  {store.enAttenteDeValidation ? 'Bientôt sur Zupone' : open ? '● Ouvert' : '● Fermé — commande en retrait sur un créneau'}
                </Text>
              </View>
            </View>
            {store.description ? <Text style={styles.description}>{store.description}</Text> : null}

            {verdict && (
              <View style={[styles.verdict, !verdict.livrable && styles.verdictNo]}>
                <Text style={[styles.verdictText, !verdict.livrable && { color: '#8D6E00' }]}>
                  {verdict.livrable
                    ? `🛵 Livré chez vous · ${verdict.frais > 0 ? formatEuros(verdict.frais) : 'livraison offerte'}${
                        verdict.minimum > 0 ? ` · minimum ${formatEuros(verdict.minimum)}` : ''
                      }${verdict.zone?.deliveryMinutes ? ` · ~${verdict.zone.deliveryMinutes} min` : ''}`
                    : `🥡 ${verdict.raison || 'Ce commerce ne livre pas à votre adresse : retrait sur place possible.'}`}
                </Text>
              </View>
            )}

            {sections.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cats}>
                {sections.map((s) => (
                  <TouchableOpacity
                    key={s.title}
                    style={[styles.chip, category === s.title && styles.chipActive]}
                    onPress={() => scrollTo(s.title)}
                  >
                    <Text style={[styles.chipText, category === s.title && styles.chipTextActive]}>{s.title}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        }
        renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
        ListEmptyComponent={<Text style={styles.empty}>Le menu n’est pas encore en ligne.</Text>}
        renderItem={({ item }) => {
          const image = productImage(item);
          const inCart = lines.filter((l) => l.productId === item.id).reduce((n, l) => n + l.quantity, 0);
          const prices = item.variants.length ? item.variants.map((v) => v.prixEffectif) : [Number(item.price)];
          const from = Math.min(...prices);
          return (
            <TouchableOpacity
              style={[styles.product, !item.isAvailable && { opacity: 0.5 }]}
              disabled={!item.isAvailable || store.enAttenteDeValidation}
              onPress={() => setPicked(item)}
              activeOpacity={0.8}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.productName}>
                  {inCart > 0 ? <Text style={styles.inCart}>{inCart}× </Text> : null}
                  {item.name}
                </Text>
                {item.description ? (
                  <Text style={styles.productDesc} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}
                <Text style={styles.productPrice}>
                  {item.variants.length > 1 && prices.some((p) => p !== from) ? 'dès ' : ''}
                  {formatEuros(from)}
                  {item.note ? `  ·  ★ ${item.note.moyenne.toFixed(1).replace('.', ',')} (${item.note.nombre})` : ''}
                </Text>
                {!item.isAvailable && <Text style={styles.soldOut}>Épuisé</Text>}
              </View>
              {image ? <Image source={{ uri: image }} style={styles.productImage} /> : null}
            </TouchableOpacity>
          );
        }}
      />

      {count > 0 && (
        <TouchableOpacity style={styles.cartBar} onPress={onCheckout} activeOpacity={0.9}>
          <View style={styles.cartCount}>
            <Text style={styles.cartCountText}>{count}</Text>
          </View>
          <Text style={styles.cartBarText}>Voir le panier</Text>
          <Text style={styles.cartBarText}>{formatEuros(cartTotal(lines))}</Text>
        </TouchableOpacity>
      )}

      <ProductSheet
        product={picked}
        onClose={() => setPicked(null)}
        onAdd={(line) => {
          onChangeLines(addLine(lines, line), storeRef);
          setPicked(null);
        }}
      />
    </View>
  );
}

function mapProducts(menu: Record<string, Product[]>, fn: (p: Product) => Product) {
  return Object.fromEntries(Object.entries(menu).map(([k, v]) => [k, v.map(fn)]));
}

/** Choisir la déclinaison et la quantité d'un plat avant de l'ajouter. */
function ProductSheet({
  product,
  onClose,
  onAdd,
}: {
  product: Product | null;
  onClose: () => void;
  onAdd: (line: CartLine) => void;
}) {
  const [variantId, setVariantId] = useState<string | undefined>(undefined);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (!product) return;
    setQuantity(1);
    setVariantId(product.variants.find((v) => v.isAvailable)?.id);
  }, [product]);

  if (!product) return null;
  const image = productImage(product);
  const variant = product.variants.find((v) => v.id === variantId);
  const needsVariant = product.variants.length > 0;
  const unit = variant ? variant.prixEffectif : Number(product.price);
  const canAdd = product.isAvailable && (!needsVariant || (variant && variant.isAvailable));

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} />
        <View style={styles.sheet}>
          <ScrollView>
            {image ? <Image source={{ uri: image }} style={styles.sheetImage} /> : null}
            <Text style={styles.sheetTitle}>{product.name}</Text>
            {product.description ? <Text style={styles.sheetDesc}>{product.description}</Text> : null}

            {needsVariant && (
              <View style={{ marginTop: 14 }}>
                <Text style={styles.sectionTitle}>{product.variantLabel || 'Votre choix'}</Text>
                {product.variants.map((v) => (
                  <TouchableOpacity
                    key={v.id}
                    style={[styles.variant, variantId === v.id && styles.variantActive, !v.isAvailable && { opacity: 0.4 }]}
                    disabled={!v.isAvailable}
                    onPress={() => setVariantId(v.id)}
                  >
                    <Text style={styles.radio}>{variantId === v.id ? '◉' : '○'}</Text>
                    <Text style={styles.variantLabel}>
                      {v.label}
                      {!v.isAvailable ? ' — épuisé' : ''}
                    </Text>
                    <Text style={styles.variantPrice}>{formatEuros(v.prixEffectif)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.qtyRow}>
              <TouchableOpacity style={styles.qtyButton} onPress={() => setQuantity((q) => Math.max(1, q - 1))}>
                <Text style={styles.qtyButtonText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.qty}>{quantity}</Text>
              <TouchableOpacity style={styles.qtyButton} onPress={() => setQuantity((q) => Math.min(99, q + 1))}>
                <Text style={styles.qtyButtonText}>+</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          <TouchableOpacity
            style={[styles.addButton, !canAdd && { opacity: 0.5 }]}
            disabled={!canAdd}
            onPress={() =>
              onAdd({
                productId: product.id,
                variantId: variant?.id,
                name: product.name,
                variantName: variant?.label,
                price: unit,
                quantity,
              })
            }
          >
            <Text style={styles.addButtonText}>Ajouter · {formatEuros(unit * quantity)}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  back: { marginRight: 12, paddingVertical: 4, paddingRight: 8 },
  backText: { color: '#fff', fontSize: 22, fontWeight: '600' },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: 'bold', color: '#fff' },
  heart: { fontSize: 22 },
  list: { padding: 12, paddingBottom: 90 },
  info: { flexDirection: 'row', gap: 12, backgroundColor: COLORS.card, borderRadius: 10, padding: 12, marginBottom: 10 },
  logoBox: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logo: { width: 68, height: 68 },
  storeName: { fontSize: 18, fontWeight: 'bold', color: COLORS.text },
  meta: { fontSize: 13, color: '#666', marginTop: 2 },
  openState: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  description: { fontSize: 13, color: '#555', marginBottom: 10, lineHeight: 18 },
  verdict: { backgroundColor: '#E8F5E9', borderRadius: 10, padding: 10, marginBottom: 10 },
  verdictNo: { backgroundColor: '#FFF8E1' },
  verdictText: { fontSize: 13, color: '#1B5E20', fontWeight: '600' },
  cats: { gap: 8, paddingVertical: 4, marginBottom: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 13, color: COLORS.text },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.muted,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 8,
  },
  product: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    gap: 12,
  },
  productName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  inCart: { color: COLORS.primary, fontWeight: '800' },
  productDesc: { fontSize: 13, color: '#666', marginTop: 3, lineHeight: 18 },
  productPrice: { fontSize: 14, color: COLORS.text, fontWeight: '600', marginTop: 6 },
  soldOut: { fontSize: 12, color: COLORS.danger, fontWeight: '700', marginTop: 4 },
  productImage: { width: 84, height: 84, borderRadius: 8, backgroundColor: COLORS.bg },
  empty: { textAlign: 'center', color: COLORS.muted, marginTop: 30 },
  cartBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  cartCount: { backgroundColor: '#fff', borderRadius: 12, minWidth: 24, paddingHorizontal: 6, alignItems: 'center' },
  cartCountText: { color: COLORS.primary, fontWeight: '800', fontSize: 13, lineHeight: 22 },
  cartBarText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: '85%',
  },
  sheetImage: { width: '100%', height: 180, borderRadius: 10, marginBottom: 12, backgroundColor: COLORS.bg },
  sheetTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.text },
  sheetDesc: { fontSize: 14, color: '#555', marginTop: 6, lineHeight: 20 },
  variant: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 6,
  },
  variantActive: { borderColor: COLORS.primary, backgroundColor: '#EAF3FF' },
  radio: { fontSize: 18, color: COLORS.primary, marginRight: 10 },
  variantLabel: { flex: 1, fontSize: 15, color: COLORS.text },
  variantPrice: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, marginVertical: 18 },
  qtyButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyButtonText: { fontSize: 24, color: COLORS.primary, fontWeight: '700' },
  qty: { fontSize: 22, fontWeight: '700', color: COLORS.text, minWidth: 30, textAlign: 'center' },
  addButton: { backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  addButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
