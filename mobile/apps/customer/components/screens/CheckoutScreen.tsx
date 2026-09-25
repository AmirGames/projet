import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StripeProvider, useStripe } from '@stripe/stripe-react-native';
import { apiFetch, formatEuros } from '../../lib/api';
import { Cart, CartLine, cartTotal, changeQuantity, lineKey } from '../../lib/carts';
import type { DeliveryAddress } from '../../lib/session';
import type { DeliveryVerdict } from '../../lib/stores';
import { Card, COLORS, Loading, Row, ScreenHeader, ui } from '../ui';
import { CancelDelay } from '../CancelDelay';

interface PaymentConfig {
  enLigne: boolean;
  publishableKey: string | null;
}

interface PaymentMethod {
  id: string;
  type: string;
  name: string;
  isDefault?: boolean;
}

interface SlotDay {
  date: string;
  libelle: string;
  creneaux: { valeur: string; libelle: string }[];
}

type Pay = (clientSecret: string) => Promise<'paid' | 'canceled' | string>;

interface Props {
  token: string;
  cart: Cart;
  address: DeliveryAddress | null;
  onChangeLines: (lines: CartLine[]) => void;
  onChangeAddress: () => void;
  onBack: () => void;
  /** « Retour » pendant le délai de repentir : revenir au menu du commerce. */
  onBackToStore: () => void;
  onOrdered: (orderId: string) => void;
}

/**
 * Le tunnel de commande, comme celui du site (`TunnelCommande`) : livraison ou
 * retrait, adresse vérifiée auprès des zones du commerce, créneau tenu aux
 * horaires, moyen de paiement, code promo, et le total annoncé avant de
 * valider. Le serveur recalcule tout : prix, frais, remise.
 */
export default function CheckoutScreen(props: Props) {
  const [config, setConfig] = useState<PaymentConfig | null>(null);

  useEffect(() => {
    apiFetch<{ data: PaymentConfig }>('/api/payments/config', null)
      .then((res) => setConfig(res.data))
      .catch(() => setConfig({ enLigne: false, publishableKey: null }));
  }, []);

  if (!config) {
    return (
      <View style={{ flex: 1 }}>
        <ScreenHeader title="Commander" onBack={props.onBack} />
        <Loading />
      </View>
    );
  }

  if (config.enLigne && config.publishableKey) {
    return (
      <StripeProvider
        publishableKey={config.publishableKey}
        merchantIdentifier="merchant.com.amir_games.zuponecustomer"
        urlScheme="zupone-customer"
      >
        <WithStripe {...props} config={config} />
      </StripeProvider>
    );
  }
  return <CheckoutBody {...props} config={config} />;
}

function WithStripe(props: Props & { config: PaymentConfig }) {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const pay: Pay = async (clientSecret) => {
    const init = await initPaymentSheet({
      paymentIntentClientSecret: clientSecret,
      merchantDisplayName: 'Zupone',
      returnURL: 'zupone-customer://stripe-redirect',
    });
    if (init.error) return init.error.message;
    const result = await presentPaymentSheet();
    if (result.error) return result.error.code === 'Canceled' ? 'canceled' : result.error.message;
    return 'paid';
  };
  return <CheckoutBody {...props} pay={pay} />;
}

function CheckoutBody({
  token,
  cart,
  address,
  config,
  pay,
  onChangeLines,
  onChangeAddress,
  onBack,
  onBackToStore,
  onOrdered,
}: Props & { config: PaymentConfig; pay?: Pay }) {
  const lines = cart.lines;
  const [isOpenNow, setIsOpenNow] = useState<boolean | null>(null);
  const [mode, setMode] = useState<'DELIVERY' | 'PICKUP'>('DELIVERY');
  const [verdict, setVerdict] = useState<DeliveryVerdict | null>(null);
  const [slots, setSlots] = useState<SlotDay[]>([]);
  const [slotDay, setSlotDay] = useState(0);
  const [pickupTime, setPickupTime] = useState('');
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [methodId, setMethodId] = useState('');
  const [serviceFee, setServiceFee] = useState(0);
  const [contact, setContact] = useState({ name: '', email: '', phone: '' });
  const [notes, setNotes] = useState('');
  const [code, setCode] = useState('');
  const [discount, setDiscount] = useState<{ code: string; amount: number } | null>(null);
  const [codeError, setCodeError] = useState('');
  const [checkingCode, setCheckingCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // Le délai de repentir court : rien n'est encore parti.
  const [pending, setPending] = useState(false);
  /** Commande créée, en attente du paiement en ligne : elle n'est pas encore chez le commerçant. */
  const [toPay, setToPay] = useState<{ id: string; amount: number } | null>(null);

  // Le profil pré-remplit le contact.
  useEffect(() => {
    apiFetch<{ data: { name?: string; email?: string; phone?: string | null } }>('/api/client/me', token)
      .then((res) =>
        setContact((c) => ({
          name: c.name || res.data.name || '',
          email: c.email || res.data.email || '',
          phone: c.phone || res.data.phone || '',
        }))
      )
      .catch(() => undefined);
  }, [token]);

  useEffect(() => {
    apiFetch<{ data: { isOpenNow?: boolean } }>(`/api/client/stores/${cart.storeId}`, null)
      .then((res) => {
        const open = res.data.isOpenNow !== false;
        setIsOpenNow(open);
        // Hors des horaires, seul le retrait sur un créneau reste possible.
        if (!open) setMode('PICKUP');
      })
      .catch(() => setIsOpenNow(true));
    apiFetch<{ data: PaymentMethod[] }>(`/api/client/stores/${cart.storeId}/payment-methods`, null)
      .then((res) => setMethods(res.data || []))
      .catch(() => undefined);
    apiFetch<{ data: { frais: number } }>('/api/client/service-fee', null)
      .then((res) => setServiceFee(Number(res.data?.frais) || 0))
      .catch(() => undefined);
  }, [cart.storeId]);

  useEffect(() => {
    if (mode !== 'DELIVERY' || !address) {
      setVerdict(null);
      return;
    }
    const params =
      address.latitude != null && address.longitude != null
        ? `lat=${address.latitude}&lng=${address.longitude}`
        : `adresse=${encodeURIComponent([address.street, address.postalCode, address.city].filter(Boolean).join(' '))}`;
    apiFetch<{ data: DeliveryVerdict }>(`/api/client/stores/${cart.storeId}/zone-livraison?${params}`, null)
      .then((res) => setVerdict(res.data))
      .catch(() => setVerdict(null));
  }, [mode, address, cart.storeId]);

  useEffect(() => {
    if (mode !== 'PICKUP') return;
    apiFetch<{ data: SlotDay[] }>(`/api/client/stores/${cart.storeId}/pickup-slots`, null)
      .then((res) => setSlots((res.data || []).filter((d) => d.creneaux.length > 0)))
      .catch(() => setSlots([]));
  }, [mode, cart.storeId]);

  /**
   * Sans clé Stripe côté application, un moyen payé en ligne ne pourrait pas
   * être encaissé ici : seuls restent les espèces.
   */
  const usable = useMemo(
    () => (config.enLigne && !pay ? methods.filter((m) => m.type === 'CASH') : methods),
    [methods, config.enLigne, pay]
  );
  useEffect(() => {
    if (usable.some((m) => m.id === methodId)) return;
    setMethodId((usable.find((m) => m.isDefault) || usable[0])?.id || '');
  }, [usable, methodId]);

  const subtotal = cartTotal(lines);
  const deliveryFee = mode === 'DELIVERY' && verdict?.livrable ? verdict.frais : 0;
  const discountAmount = discount?.amount ?? 0;
  const total = Math.max(0, subtotal + deliveryFee + serviceFee - discountAmount);
  const belowMinimum = mode === 'DELIVERY' && Boolean(verdict?.livrable) && subtotal < (verdict?.minimum ?? 0);

  // Le panier change : la remise calculée ne vaut plus.
  useEffect(() => {
    setDiscount(null);
  }, [subtotal]);

  const applyCode = async () => {
    const typed = code.trim();
    if (!typed) return;
    setCheckingCode(true);
    setCodeError('');
    try {
      const res = await apiFetch<any>(`/api/promotions/validate?storeId=${cart.storeId}`, null, {
        method: 'POST',
        body: { code: typed, cartTotal: Number(subtotal.toFixed(2)), productIds: lines.map((l) => l.productId) },
      });
      const amount = Number(res?.discountAmount ?? res?.data?.discountAmount ?? 0);
      if (!(amount > 0)) {
        setCodeError("Ce code n'accorde aucune remise sur ce panier");
        return;
      }
      setDiscount({ code: typed, amount });
    } catch (e: any) {
      setCodeError(e.message || "Ce code promo n'est pas valable");
    } finally {
      setCheckingCode(false);
    }
  };

  const payOnline = async (order: { id: string; amount: number }) => {
    if (!pay) return;
    setSubmitting(true);
    try {
      const intent = await apiFetch<{ clientSecret: string }>('/api/payments/intent', null, {
        method: 'POST',
        body: { orderId: order.id },
      });
      const result = await pay(intent.clientSecret);
      if (result === 'paid') {
        setToPay(null);
        onOrdered(order.id);
      } else if (result !== 'canceled') {
        setError(result || 'Le paiement a échoué');
      }
    } catch (e: any) {
      setError(e.message || 'Le paiement est indisponible pour le moment');
    } finally {
      setSubmitting(false);
    }
  };

  /** Vérifie la commande, puis laisse au client le délai pour se raviser. */
  const review = () => {
    setError('');
    if (!contact.name.trim() || !contact.email.trim() || contact.phone.trim().length < 9) {
      setError('Indiquez votre nom, votre e-mail et un téléphone valide.');
      return;
    }
    if (mode === 'DELIVERY') {
      if (!address?.street || !address.city) {
        setError('Choisissez votre adresse de livraison.');
        return;
      }
      if (verdict && !verdict.livrable) {
        setError(verdict.raison || 'Ce commerce ne livre pas à cette adresse : choisissez le retrait.');
        return;
      }
      if (belowMinimum) {
        setError(`Le minimum de commande pour votre adresse est de ${formatEuros(verdict?.minimum)}.`);
        return;
      }
    }
    if (mode === 'PICKUP' && !pickupTime) {
      setError('Choisissez une heure de retrait.');
      return;
    }
    if (lines.length === 0) {
      setError('Votre panier est vide.');
      return;
    }
    setPending(true);
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await apiFetch<{ order: { id: string; totalAmount: number | string; paiementEnLigne?: boolean } }>(
        '/api/orders',
        null,
        {
          method: 'POST',
          body: {
            storeId: cart.storeId,
            customerName: contact.name.trim(),
            customerEmail: contact.email.trim(),
            customerPhone: contact.phone.trim(),
            deliveryType: mode,
            deliveryAddress: mode === 'DELIVERY' ? address?.street : undefined,
            deliveryCity: mode === 'DELIVERY' ? address?.city : undefined,
            deliveryPostal: mode === 'DELIVERY' ? address?.postalCode || undefined : undefined,
            deliveryLat: mode === 'DELIVERY' ? address?.latitude ?? undefined : undefined,
            deliveryLng: mode === 'DELIVERY' ? address?.longitude ?? undefined : undefined,
            pickupTime: mode === 'PICKUP' ? pickupTime : undefined,
            notes: notes.trim() || undefined,
            // Le code part tel quel : le serveur recalcule la remise.
            promoCode: discount?.code,
            paymentMethodId: methodId || undefined,
            totalAmount: Number(total.toFixed(2)),
            taxAmount: 0,
            feesAmount: Number(deliveryFee.toFixed(2)),
            items: lines.map((l) => ({
              productId: l.productId,
              quantity: l.quantity,
              price: l.price,
              ...(l.variantId ? { variantId: l.variantId } : {}),
            })),
          },
        }
      );

      const order = { id: res.order.id, amount: Number(res.order.totalAmount) };
      if (res.order.paiementEnLigne) {
        setToPay(order);
        setSubmitting(false);
        await payOnline(order);
        return;
      }
      onOrdered(order.id);
    } catch (e: any) {
      setError(e.message || 'La commande n’a pas pu être passée');
    } finally {
      setSubmitting(false);
    }
  };

  if (toPay) {
    return (
      <View style={{ flex: 1 }}>
        <ScreenHeader title="Paiement" subtitle={cart.storeName} onBack={onBack} />
        <View style={ui.content}>
          <Card title="Paiement en ligne">
            <Text style={styles.help}>
              Commande #{toPay.id.slice(-6).toUpperCase()} — {formatEuros(toPay.amount)}. Elle sera transmise à{' '}
              {cart.storeName} dès le paiement accepté.
            </Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <TouchableOpacity style={styles.submit} onPress={() => payOnline(toPay)} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Payer {formatEuros(toPay.amount)}</Text>}
            </TouchableOpacity>
          </Card>
        </View>
      </View>
    );
  }

  const day = slots[slotDay];
  const slotLabel = (value: string) => {
    for (const d of slots) {
      const found = d.creneaux.find((c) => c.valeur === value);
      if (found) return `${d.libelle}, ${found.libelle}`;
    }
    return value;
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title="Commander 🛒" subtitle={cart.storeName} onBack={onBack} />
      <ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
        <Card title="Mon panier">
          {lines.map((l, i) => {
            const key = lineKey(l.productId, l.variantId);
            return (
              <View key={key} style={[styles.line, i === lines.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineName}>{l.name}</Text>
                  {l.variantName ? <Text style={styles.lineVariant}>{l.variantName}</Text> : null}
                  <Text style={styles.linePrice}>{formatEuros(l.price * l.quantity)}</Text>
                </View>
                <View style={styles.qtyRow}>
                  <TouchableOpacity style={styles.qtyButton} onPress={() => onChangeLines(changeQuantity(lines, key, -1))}>
                    <Text style={styles.qtyButtonText}>{l.quantity === 1 ? '🗑' : '−'}</Text>
                  </TouchableOpacity>
                  <Text style={styles.qty}>{l.quantity}</Text>
                  <TouchableOpacity style={styles.qtyButton} onPress={() => onChangeLines(changeQuantity(lines, key, 1))}>
                    <Text style={styles.qtyButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </Card>

        <Card title="Mode">
          <View style={styles.modes}>
            {(['DELIVERY', 'PICKUP'] as const).map((m) => {
              const disabled = m === 'DELIVERY' && isOpenNow === false;
              return (
                <TouchableOpacity
                  key={m}
                  style={[styles.mode, mode === m && styles.modeActive, disabled && { opacity: 0.4 }]}
                  disabled={disabled}
                  onPress={() => setMode(m)}
                >
                  <Text style={[styles.modeText, mode === m && styles.modeTextActive]}>
                    {m === 'DELIVERY' ? '🛵 Livraison' : '🥡 Retrait'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {isOpenNow === false && (
            <Text style={styles.help}>Le commerce est fermé : commandez maintenant et passez retirer sur un créneau.</Text>
          )}

          {mode === 'DELIVERY' ? (
            <>
              <TouchableOpacity style={styles.addressRow} onPress={onChangeAddress}>
                <Text style={styles.addressText} numberOfLines={2}>
                  📍 {address?.label || 'Choisir mon adresse'}
                </Text>
                <Text style={styles.link}>Modifier</Text>
              </TouchableOpacity>
              {verdict && (
                <Text style={[styles.verdict, { color: verdict.livrable ? COLORS.success : '#B26A00' }]}>
                  {verdict.livrable
                    ? `Livré · ${verdict.frais > 0 ? formatEuros(verdict.frais) : 'livraison offerte'}${
                        verdict.minimum > 0 ? ` · minimum ${formatEuros(verdict.minimum)}` : ''
                      }`
                    : verdict.raison || 'Ce commerce ne livre pas à cette adresse.'}
                </Text>
              )}
              {belowMinimum && (
                <Text style={styles.error}>
                  Encore {formatEuros((verdict?.minimum ?? 0) - subtotal)} pour atteindre le minimum de livraison.
                </Text>
              )}
            </>
          ) : slots.length === 0 ? (
            <Text style={styles.help}>Aucun créneau de retrait disponible pour le moment.</Text>
          ) : (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {slots.map((d, i) => (
                  <TouchableOpacity
                    key={d.date}
                    style={[styles.chip, slotDay === i && styles.chipActive]}
                    onPress={() => setSlotDay(i)}
                  >
                    <Text style={[styles.chipText, slotDay === i && styles.chipTextActive]}>{d.libelle}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={[styles.chips, { flexWrap: 'wrap', marginTop: 8 }]}>
                {day?.creneaux.map((c) => (
                  <TouchableOpacity
                    key={c.valeur}
                    style={[styles.chip, pickupTime === c.valeur && styles.chipActive]}
                    onPress={() => setPickupTime(c.valeur)}
                  >
                    <Text style={[styles.chipText, pickupTime === c.valeur && styles.chipTextActive]}>{c.libelle}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </Card>

        <Card title="Mes coordonnées">
          <TextInput
            style={styles.input}
            placeholder="Nom"
            placeholderTextColor="#999"
            value={contact.name}
            onChangeText={(name) => setContact((c) => ({ ...c, name }))}
          />
          <TextInput
            style={styles.input}
            placeholder="E-mail"
            placeholderTextColor="#999"
            value={contact.email}
            onChangeText={(email) => setContact((c) => ({ ...c, email }))}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="Téléphone"
            placeholderTextColor="#999"
            value={contact.phone}
            onChangeText={(phone) => setContact((c) => ({ ...c, phone }))}
            keyboardType="phone-pad"
          />
          <TextInput
            style={[styles.input, { minHeight: 60 }]}
            placeholder={mode === 'DELIVERY' ? 'Instructions (étage, digicode…)' : 'Une précision pour le commerce'}
            placeholderTextColor="#999"
            value={notes}
            onChangeText={setNotes}
            multiline
          />
        </Card>

        <Card title="Paiement">
          {usable.length === 0 ? (
            <Text style={styles.help}>
              {config.enLigne && methods.length > 0
                ? 'Le paiement en ligne de ce commerce n’est pas encore disponible dans l’application.'
                : 'Le paiement se fait auprès du commerce.'}
            </Text>
          ) : (
            usable.map((m) => (
              <TouchableOpacity key={m.id} style={styles.method} onPress={() => setMethodId(m.id)}>
                <Text style={styles.radio}>{methodId === m.id ? '◉' : '○'}</Text>
                <Text style={styles.methodText}>
                  {m.name}
                  {config.enLigne && m.type !== 'CASH' ? ' · en ligne' : ''}
                </Text>
              </TouchableOpacity>
            ))
          )}

          <View style={styles.codeRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              placeholder="Code promo"
              placeholderTextColor="#999"
              value={code}
              onChangeText={(t) => {
                setCode(t);
                setCodeError('');
              }}
              autoCapitalize="characters"
              editable={!discount}
            />
            {discount ? (
              <TouchableOpacity style={styles.codeButton} onPress={() => { setDiscount(null); setCode(''); }}>
                <Text style={styles.codeButtonText}>Retirer</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.codeButton} onPress={applyCode} disabled={checkingCode || !code.trim()}>
                {checkingCode ? <ActivityIndicator color="#fff" /> : <Text style={styles.codeButtonText}>Appliquer</Text>}
              </TouchableOpacity>
            )}
          </View>
          {codeError ? <Text style={styles.error}>{codeError}</Text> : null}
        </Card>

        <Card title="Total">
          <Row label="Sous-total" value={formatEuros(subtotal)} />
          {mode === 'DELIVERY' && <Row label="Livraison" value={verdict?.livrable ? formatEuros(deliveryFee) : '—'} />}
          {serviceFee > 0 && <Row label="Frais de service" value={formatEuros(serviceFee)} />}
          {discount && <Row label={`Code ${discount.code}`} value={`− ${formatEuros(discount.amount)}`} />}
          <Row label="Total" value={<Text style={styles.total}>{formatEuros(total)}</Text>} last />
        </Card>

        {error ? <Text style={[styles.error, { textAlign: 'center', marginBottom: 10 }]}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.submit, (submitting || lines.length === 0) && { opacity: 0.6 }]}
          onPress={review}
          disabled={submitting || lines.length === 0}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Commander · {formatEuros(total)}</Text>}
        </TouchableOpacity>
      </ScrollView>

      {pending && (
        <CancelDelay
          place={mode === 'DELIVERY' ? address?.label || address?.street || 'Livraison' : `Retrait chez ${cart.storeName}`}
          placeDetail={mode === 'DELIVERY' ? [address?.street, address?.city].filter(Boolean).join(', ') : undefined}
          timing={
            mode === 'DELIVERY'
              ? verdict?.zone?.deliveryMinutes
                ? `Livraison : environ ${verdict.zone.deliveryMinutes} minutes`
                : 'Livraison dès que possible'
              : `Retrait : ${slotLabel(pickupTime)}`
          }
          storeName={cart.storeName}
          lines={lines}
          onGo={() => {
            setPending(false);
            void submit();
          }}
          onBack={() => {
            setPending(false);
            onBackToStore();
          }}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  help: { fontSize: 13, color: '#666', marginVertical: 6 },
  error: { fontSize: 13, color: COLORS.danger, marginTop: 6 },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  lineName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  lineVariant: { fontSize: 12, color: '#666', marginTop: 2 },
  linePrice: { fontSize: 13, color: COLORS.text, marginTop: 4 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qtyButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyButtonText: { fontSize: 18, color: COLORS.primary, fontWeight: '700' },
  qty: { fontSize: 16, fontWeight: '700', color: COLORS.text, minWidth: 20, textAlign: 'center' },
  modes: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  mode: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    backgroundColor: COLORS.bg,
  },
  modeActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  modeText: { fontSize: 15, color: COLORS.text, fontWeight: '600' },
  modeTextActive: { color: '#fff' },
  addressRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  addressText: { flex: 1, fontSize: 14, color: COLORS.text },
  link: { color: COLORS.primary, fontWeight: '600' },
  verdict: { fontSize: 13, fontWeight: '600' },
  chips: { flexDirection: 'row', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 13, color: COLORS.text },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  input: {
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.text,
    marginBottom: 8,
  },
  method: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  radio: { fontSize: 18, color: COLORS.primary, marginRight: 10 },
  methodText: { fontSize: 15, color: COLORS.text },
  codeRow: { flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' },
  codeButton: { backgroundColor: COLORS.primary, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 11 },
  codeButtonText: { color: '#fff', fontWeight: '600' },
  total: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  submit: { backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
