import { Linking } from 'react-native';

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
  items: { name: string; quantity: number; price: number; total: number }[];
}

/** Le détail d'une commande (/api/orders/:id). */
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
  [item.product?.name || 'Produit supprimé', item.variant?.label].filter(Boolean).join(' · ');

export const hhmm = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';

export const shortId = (id: string) => `#${id.slice(-6).toUpperCase()}`;

export function callPhone(phone?: string | null) {
  if (!phone) return;
  Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`).catch(() => undefined);
}

