import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Linking,
  TouchableOpacity,
  View,
} from 'react-native';
import { StripeProvider, useStripe } from '@stripe/stripe-react-native';
import { attemptKey, forgetAttempt } from '../../lib/attempt-key';
import { apiFetch, formatEuros } from '../../lib/api';
import { Cart, CartLine, cartTotal, changeQuantity, keyOf } from '../../lib/carts';
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

/** Les montants proposés d'un clic ; « Autre » laisse saisir le sien. */
const TIP_CHOICES = [0, 1, 2, 3, 5];
const TIP_MAX = 50;

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
        merchantIdentifier="merchant.com.amir_games.zupeatcustomer"
        urlScheme="zupeat-customer"
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
      merchantDisplayName: 'ZupEat',
      returnURL: 'zupeat-customer://stripe-redirect',
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
  const [conditionsAcceptees, setConditionsAcceptees] = useState(false);
  // Attestation d'âge, demandée si un plat contient de l'alcool (et exigée par le serveur).
  const [ageConfirme, setAgeConfirme] = useState(false);
  const [tipChosen, setTipChosen] = useState(0);
  const [tipFree, setTipFree] = useState(false);
  const [error, setError] = useState('');
  // Le délai de repentir court : rien n'est encore parti.
  const [pending, setPending] = useState(false);
  /** Commande créée, en attente du paiement en ligne : elle n'est pas encore chez le commerçant. */
  const [toPay, setToPay] = useState<{ id: string; amount: number; trackingToken?: string } | null>(null);

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

  const contientAlcool = lines.some((l) => l.alcool);
  const subtotal = cartTotal(lines);
  // Le seuil de la zone atteint, la livraison est offerte : le serveur
  // l'applique de la même façon.
  const freeDelivery = verdict?.gratuiteDes != null && subtotal >= verdict.gratuiteDes;
  const missingForFree = verdict?.gratuiteDes != null && !freeDelivery ? verdict.gratuiteDes - subtotal : 0;
  const deliveryFee = mode === 'DELIVERY' && verdict?.livrable && !freeDelivery ? verdict.frais : 0;
  const discountAmount = discount?.amount ?? 0;
  const orderTotal = Math.max(0, subtotal + deliveryFee + serviceFee - discountAmount);
  // Le pourboire n'a de sens que pour un livreur de la plateforme, sur une
  // commande payée en ligne : le serveur refuse les autres cas.
  const tipPossible =
    Boolean(pay) &&
    mode === 'DELIVERY' &&
    Boolean(verdict?.livrable) &&
    verdict?.mode === 'PLATFORM' &&
    Boolean(methodId) &&
    usable.find((m) => m.id === methodId)?.type !== 'CASH';
  const tip = tipPossible ? tipChosen : 0;
  const total = Number((orderTotal + tip).toFixed(2));
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
        body: {
          code: typed,
          // Le serveur tarife le panier : l'aperçu est la remise de la commande.
          lignes: lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            ...(l.variantId ? { variantId: l.variantId } : {}),
            ...(l.supplements?.length ? { supplements: l.supplements.map((s) => s.id) } : {}),
          })),
        },
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

  const payOnline = async (order: { id: string; amount: number; trackingToken?: string }) => {
    if (!pay) return;
    setSubmitting(true);
    try {
      // Le serveur exige une preuve que la commande est la nôtre : la session,
      // et le jeton de suivi remis à la création.
      const intent = await apiFetch<{ clientSecret: string }>('/api/payments/intent', token, {
        method: 'POST',
        body: { orderId: order.id, trackingToken: order.trackingToken },
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
      const body = {
        conditionsAcceptees,
        ...(contientAlcool ? { ageMinimumConfirme: ageConfirme } : {}),
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
        ...(tip > 0 ? { tipAmount: tip } : {}),
        // Aucun montant envoyé : prix, frais et total sont calculés par le serveur.
        items: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          ...(l.variantId ? { variantId: l.variantId } : {}),
          // Le serveur relit et tarife chaque supplément désigné.
          ...(l.supplements?.length ? { supplements: l.supplements.map((s) => s.id) } : {}),
        })),
      };
      const res = await apiFetch<{
        order: {
          id: string;
          totalAmount: number | string;
          tipAmount?: number | string;
          paiementEnLigne?: boolean;
          trackingToken?: string;
        };
      }>(
        '/api/orders',
        // Le jeton range la commande dans l'historique du compte.
        token,
        {
          method: 'POST',
          // Renvoyé tel quel, cet achat rend la même commande au lieu d'en créer une seconde.
          headers: { 'Idempotency-Key': attemptKey(body) },
          body,
        }
      );
      forgetAttempt();

      const order = {
        id: res.order.id,
        // Le pourboire se paie avec la commande.
        amount: Number(res.order.totalAmount) + Number(res.order.tipAmount || 0),
        trackingToken: res.order.trackingToken,
      };
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
            const key = keyOf(l);
            return (
              <View key={key} style={[styles.line, i === lines.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineName}>{l.name}</Text>
                  {l.variantName ? <Text style={styles.lineVariant}>{l.variantName}</Text> : null}
                  {l.supplements?.length ? (
                    <Text style={styles.lineVariant}>+ {l.supplements.map((s) => s.label).join(', ')}</Text>
                  ) : null}
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
                    ? `Livré · ${deliveryFee > 0 ? formatEuros(deliveryFee) : 'livraison offerte'}${
                        verdict.minimum > 0 ? ` · minimum ${formatEuros(verdict.minimum)}` : ''
                      }`
                    : verdict.raison || 'Ce commerce ne livre pas à cette adresse.'}
                </Text>
              )}
              {verdict?.livrable && missingForFree > 0 && (
                <Text style={[styles.verdict, { color: COLORS.success }]}>
                  Encore {formatEuros(missingForFree)} pour la livraison offerte.
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
          {tipPossible && (
            <View style={styles.tipBlock}>
              <Row label="Pourboire pour le livreur" value={tip > 0 ? formatEuros(tip) : '—'} last />
              <View style={[styles.chips, { flexWrap: 'wrap', marginTop: 6 }]}>
                {TIP_CHOICES.map((amount) => {
                  const on = !tipFree && tipChosen === amount;
                  return (
                    <TouchableOpacity
                      key={amount}
                      style={[styles.chip, on && styles.chipActive]}
                      onPress={() => {
                        setTipFree(false);
                        setTipChosen(amount);
                      }}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextActive]}>{amount === 0 ? 'Aucun' : formatEuros(amount)}</Text>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity style={[styles.chip, tipFree && styles.chipActive]} onPress={() => setTipFree(true)}>
                  <Text style={[styles.chipText, tipFree && styles.chipTextActive]}>Autre</Text>
                </TouchableOpacity>
              </View>
              {tipFree && (
                <TextInput
                  style={[styles.input, { marginTop: 8, width: 120 }]}
                  placeholder="Montant"
                  placeholderTextColor="#999"
                  keyboardType="decimal-pad"
                  value={tipChosen ? String(tipChosen) : ''}
                  onChangeText={(t) => {
                    const typed = Number(t.replace(',', '.'));
                    setTipChosen(Number.isFinite(typed) ? Math.min(Math.max(typed, 0), TIP_MAX) : 0);
                  }}
                />
              )}
              <Text style={styles.help}>Il revient en entier à votre livreur.</Text>
            </View>
          )}
          <Row label="Total" value={<Text style={styles.total}>{formatEuros(total)}</Text>} last />
        </Card>

        {error ? <Text style={[styles.error, { textAlign: 'center', marginBottom: 10 }]}>{error}</Text> : null}

        {contientAlcool && (
          <TouchableOpacity
            style={styles.conditions}
            onPress={() => setAgeConfirme((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: ageConfirme }}
          >
            <Text style={styles.conditionsCase}>{ageConfirme ? '☑' : '☐'}</Text>
            <Text style={styles.conditionsTexte}>
              Mon panier contient de l&apos;alcool : je certifie avoir l&apos;âge légal pour en acheter et je présenterai une pièce d&apos;identité à la remise.
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.conditions}
          onPress={() => setConditionsAcceptees((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: conditionsAcceptees }}
        >
          <Text style={styles.conditionsCase}>{conditionsAcceptees ? '☑' : '☐'}</Text>
          <Text style={styles.conditionsTexte}>
            J&apos;ai lu et j&apos;accepte les{' '}
            <Text style={styles.conditionsLien} onPress={() => Linking.openURL('https://zupeat.com/cgv')}>
              conditions générales de vente
            </Text>
            .
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.submit, (submitting || lines.length === 0 || !conditionsAcceptees || (contientAlcool && !ageConfirme)) && { opacity: 0.6 }]}
          onPress={review}
          disabled={submitting || lines.length === 0 || !conditionsAcceptees || (contientAlcool && !ageConfirme)}
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
  conditions: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginVertical: 12 },
  conditionsCase: { fontSize: 18, color: COLORS.text },
  conditionsTexte: { flex: 1, color: COLORS.text },
  conditionsLien: { textDecorationLine: 'underline' },
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
  tipBlock: { marginTop: 4, marginBottom: 8 },
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
