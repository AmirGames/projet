import { Linking } from 'react-native';
import { apiFetch } from './api';
import { CartLine, CartSupplement, keyOf } from './carts';
import type { Product, StoreDetail } from './stores';

/** Une commande dans la liste « Mes commandes » (/api/client/me/orders). */
export interface OrderSummary {
  id: string;
  status: string;
  paymentStatus?: string;
  deliveryType: 'PICKUP' | 'DELIVERY';
  totalAmount: number;
  createdAt: string;
  store?: { id: string; name: string; slug?: string; city?: string | null } | null;
  deliveryStatus?: string | null;
  avisARedemander?: boolean;
  items: {
    productId?: string;
    variantId?: string | null;
    variantLabel?: string | null;
    name: string;
    quantity: number;
    price: number;
    total: number;
    /** Les suppléments tels qu'ils ont été payés (copie figée). */
    supplements?: { id: string; label: string; price: number }[];
  }[];
}

/**
 * Le détail d'une commande (/api/orders/:id), lu avec la session du client :
 * une liste blanche de champs, sans secret de paiement ni course brute. Le
 * code de remise n'y figure que pour le client propriétaire, tant que la
 * commande n'est pas remise.
 */
export interface OrderDetail {
  id: string;
  storeId: string;
  status: string;
  paymentStatus?: string;
  submittedAt?: string | null;
  deliveryType: 'PICKUP' | 'DELIVERY';
  pickupTime?: string | null;
  deliveryAddress?: string | null;
  deliveryCity?: string | null;
  totalAmount: number | string;
  feesAmount?: number | string;
  serviceFeeAmount?: number | string;
  discountAmount?: number | string;
  /** Le pourboire du livreur, payé en plus de la commande. */
  tipAmount?: number | string;
  taxAmount?: number | string;
  promoCode?: string | null;
  paymentMethodName?: string | null;
  notes?: string | null;
  estimatedReadyAt?: string | null;
  rejectionReason?: string | null;
  rejectionNote?: string | null;
  createdAt: string;
  items: {
    id: string;
    productId: string;
    quantity: number;
    price: number | string;
    total: number | string;
    product?: { name: string } | null;
    variant?: { label: string } | null;
    selectedOptions?: { supplements?: { id?: string; label?: string; price?: number }[] } | null;
  }[];
  codeRemise?: string | null;
  livreurProche?: boolean;
}

/** Le suivi de la course (/api/client/deliveries/:orderId). */
export interface Tracking {
  id: string;
  status: 'PENDING' | 'ACCEPTED' | 'PICKED_UP' | 'DELIVERED' | 'FAILED' | 'CANCELLED' | string;
  estimatedTime?: number | null;
  boutique?: string | null;
  adresseLivraison?: string | null;
  /** Le commerce, d'où part la commande. */
  retrait?: { latitude: number; longitude: number } | null;
  destination?: { latitude: number; longitude: number } | null;
  position?: { latitude: number; longitude: number; misAJourLe?: string | null } | null;
  gpsPerdu?: boolean;
  distanceRestanteKm?: number | null;
  distanceTotaleKm?: number | null;
  driver?: {
    name?: string | null;
    phone?: string | null;
    vehicleType?: string | null;
    rating: number | null;
    avis: number;
  } | null;
  maNote?: { note: number; commentaire?: string | null } | null;
  codeRemise?: string | null;
  preuve?: string | null;
  photoDepot?: string | null;
  noteDepot?: string | null;
  livreurProche?: boolean;
  /** Le livreur attend à la porte : passé cette heure, dépôt en lieu sûr. */
  attenteFinLe?: string | null;
  /** L'heure du serveur à la lecture, pour corriger l'horloge du téléphone. */
  maintenant?: string | null;
}

export const ORDER_STATUS: Record<string, { label: string; color: string; icon: string }> = {
  PENDING: { label: 'En attente du commerce', color: '#FFA500', icon: '⏳' },
  ACCEPTED: { label: 'Acceptée', color: '#2196F3', icon: '✅' },
  PREPARING: { label: 'En préparation', color: '#9C27B0', icon: '👨‍🍳' },
  READY: { label: 'Prête', color: '#00897B', icon: '📦' },
  COMPLETED: { label: 'Terminée', color: '#4CAF50', icon: '🎉' },
  REJECTED: { label: 'Annulée', color: '#F44336', icon: '✗' },
};

export const orderStatus = (status?: string) =>
  ORDER_STATUS[(status || '').toUpperCase()] || { label: status || '—', color: '#999', icon: '•' };

/** Les étapes d'une course, du point de vue du client. */
export const DELIVERY_STATUS: Record<string, string> = {
  PENDING: 'Recherche d’un livreur',
  ACCEPTED: 'Le livreur va au commerce',
  PICKED_UP: 'En route vers vous',
  DELIVERED: 'Livrée',
  FAILED: 'Livraison échouée',
  CANCELLED: 'Course annulée',
};

export const REJECTION_REASONS: Record<string, string> = {
  TOO_BUSY: 'Le commerce est trop occupé pour le moment.',
  PRODUCT_UNAVAILABLE: "Un produit de votre commande n'est plus disponible.",
  EXCEPTIONAL_CLOSURE: 'Le commerce a dû fermer exceptionnellement.',
  OTHER: 'Le commerce ne peut pas honorer votre commande.',
  NO_RESPONSE: "Le commerce n'a pas confirmé votre commande à temps.",
};

export const VEHICLE_LABELS: Record<string, string> = {
  car: '🚗 Voiture',
  scooter: '🛵 Scooter',
  bike: '🚲 Vélo',
};

/** Une commande encore vivante : elle se suit en direct. */
export const isActive = (o: { status: string; deliveryStatus?: string | null; deliveryType?: string }) =>
  !['COMPLETED', 'REJECTED'].includes(o.status) &&
  !(o.deliveryType === 'DELIVERY' && ['DELIVERED', 'FAILED', 'CANCELLED'].includes(o.deliveryStatus || ''));

export const itemName = (item: OrderDetail['items'][number]) =>
  [
    item.product?.name || 'Produit supprimé',
    item.variant?.label,
    (item.selectedOptions?.supplements || []).length
      ? `+ ${(item.selectedOptions?.supplements || []).map((s) => s.label).filter(Boolean).join(', ')}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

/** Ce que le client a payé : la commande et le pourboire, gardé à part. */
export const amountPaid = (o: { totalAmount: number | string; tipAmount?: number | string | null }) =>
  Number(o.totalAmount || 0) + Number(o.tipAmount || 0);

export const hhmm = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';

export const shortId = (id: string) => `#${id.slice(-6).toUpperCase()}`;

export function callPhone(phone?: string | null) {
  if (!phone) return;
  Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`).catch(() => undefined);
}


/**
 * « Commander à nouveau » : remet au panier du commerce les plats d'une
 * commande passée.
 *
 * Tout est relu dans le menu du jour, jamais recopié de la commande (comme
 * `remettreAuPanier` du site) : un plat retiré ou épuisé reste dehors, un prix
 * qui a bougé prend sa nouvelle valeur, un supplément disparu écarte la ligne.
 * Ce qui était déjà dans le panier y reste ; les quantités s'additionnent.
 */
export async function reorderLines(order: OrderSummary, current: CartLine[]): Promise<{ lines: CartLine[]; absent: string[]; added: number }> {
  if (!order.store?.id) throw new Error('Ce commerce n’est plus disponible.');
  const res = await apiFetch<{ data: StoreDetail }>(`/api/client/stores/${order.store.id}`, null);
  const dishes = new Map<string, Product>(Object.values(res.data.menu || {}).flat().map((p) => [p.id, p]));

  let lines = [...current];
  const absent: string[] = [];
  let added = 0;

  for (const item of order.items) {
    const label = item.variantLabel ? `${item.name} (${item.variantLabel})` : item.name;
    const dish = item.productId ? dishes.get(item.productId) : undefined;
    if (!dish || !dish.isAvailable) {
      absent.push(label);
      continue;
    }

    let price = Number(dish.price);
    let variantName: string | undefined;
    if (item.variantId) {
      const variant = dish.variants.find((v) => v.id === item.variantId);
      if (!variant || !variant.isAvailable) {
        absent.push(label);
        continue;
      }
      price = variant.prixEffectif;
      variantName = variant.label;
    } else if (dish.variants.length > 0) {
      // Le plat se décline désormais : le client doit choisir sur la vitrine.
      absent.push(label);
      continue;
    }

    // Les suppléments, au prix du jour ; un seul disparu écarte la ligne.
    const wanted = item.supplements || [];
    const choices = new Map<string, CartSupplement>(
      (dish.supplements || []).flatMap((g) =>
        g.choices.filter((c) => c.isAvailable).map((c) => [c.id, { id: c.id, label: c.label, price: Number(c.price) || 0 }] as const)
      )
    );
    const supplements = wanted.map((w) => choices.get(w.id)).filter((s): s is CartSupplement => Boolean(s));
    const missingRequired = (dish.supplements || []).some(
      (g) => g.isRequired && !g.choices.some((c) => supplements.some((s) => s.id === c.id))
    );
    if (supplements.length !== wanted.length || missingRequired) {
      absent.push(wanted.length ? `${label} + ${wanted.map((w) => w.label).join(', ')}` : label);
      continue;
    }
    price += supplements.reduce((n, s) => n + s.price, 0);

    const line: CartLine = {
      productId: dish.id,
      ...(item.variantId ? { variantId: item.variantId, variantName } : {}),
      ...(supplements.length ? { supplements } : {}),
      name: dish.name,
      price: Number(price.toFixed(2)),
      quantity: item.quantity,
    };
    const existing = lines.find((l) => keyOf(l) === keyOf(line));
    lines = existing
      ? lines.map((l) => (l === existing ? { ...l, price: line.price, quantity: l.quantity + line.quantity } : l))
      : [...lines, line];
    added += 1;
  }
  return { lines, absent, added };
}
