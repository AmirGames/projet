import { Linking, Platform } from 'react-native';
import type { Prefs } from './session';

/** Le livreur connecté, tel que le renvoie /api/drivers/me. */
export interface Driver {
  id: string;
  name?: string | null;
  email?: string | null;
  rating: number | null;
  avis: number;
  totalEarnings?: number | string;
  completedDeliveries?: number;
  /** Ce que le livreur a choisi : prendre des courses ou non. */
  isOnline: boolean;
  /** Ce que l'attribution en a fait : libre ou déjà sur une course. */
  isAvailable: boolean;
  vehicleType?: string | null;
  licensePlate?: string | null;
  status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED' | 'INACTIVE' | string;
  statusReason?: string | null;
  pausedUntil?: string | null;
  pauseReason?: string | null;
  gpsLostAt?: string | null;
}

/** Une course proposée, qui n'attend la réponse que quelques dizaines de secondes. */
export interface Offer {
  id: string;
  deliveryId: string;
  /** Trajet payé, du commerce au client. */
  distanceKm: number | null;
  /** Chemin du livreur jusqu'au commerce. */
  approcheKm?: number | null;
  payout: number;
  expiresAt: string;
  pickupStore?: string | null;
  pickupAddress?: string | null;
  pickupCity?: string | null;
  deliveryAddress?: string | null;
  deliveryCity?: string | null;
  deliveryPostal?: string | null;
}

export interface DeliveryItem {
  id?: string;
  quantity: number;
  name?: string;
  product?: { name: string } | null;
}

/** Une course attribuée, en résumé (liste) ou en détail. */
export interface Delivery {
  id: string;
  orderId: string;
  status: 'PENDING' | 'ACCEPTED' | 'PICKED_UP' | 'DELIVERED' | 'FAILED' | string;
  /** L'état de la commande au commerce : elle ne se prend qu'une fois prête. */
  orderStatus?: string;
  pickupStore?: string;
  pickupAddress: string;
  pickupLat?: number | null;
  pickupLng?: number | null;
  deliveryAddress: string;
  customerName?: string;
  customerPhone?: string;
  totalAmount?: number | string;
  distance?: number;
  estimatedTime?: number | null;
  /** Point de livraison : exact une fois la course acceptée. */
  latitude?: number | null;
  longitude?: number | null;
  items?: DeliveryItem[];
  /** Un code est attendu à la remise. Sa valeur, elle, reste chez le client. */
  codeAttendu?: boolean;
  essaisRestants?: number;
  preuve?: string | null;
}

export const DELIVERY_STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Proposée', color: '#FFA500' },
  ACCEPTED: { label: 'Vers le commerce', color: '#2196F3' },
  PICKED_UP: { label: 'Vers le client', color: '#00897B' },
  DELIVERED: { label: 'Livrée', color: '#4CAF50' },
  FAILED: { label: 'Échouée', color: '#F44336' },
  CANCELLED: { label: 'Annulée', color: '#9E9E9E' },
};

export const deliveryStatus = (status?: string) =>
  DELIVERY_STATUS[(status || '').toUpperCase()] || { label: status || '—', color: '#999' };

export const DRIVER_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Dossier en cours de validation',
  ACTIVE: 'Compte validé',
  REJECTED: 'Dossier refusé',
  SUSPENDED: 'Compte suspendu',
  INACTIVE: 'Compte désactivé',
};

export const VEHICLE_LABELS: Record<string, string> = {
  car: '🚗 Voiture',
  scooter: '🛵 Scooter',
  bike: '🚲 Vélo',
};

export const itemName = (item: DeliveryItem) => item.product?.name || item.name || 'Article';

/** Distance à vol d'oiseau, en mètres. */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function formatDistance(metres: number) {
  return metres >= 1000 ? `${(metres / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(metres)} m`;
}

export const formatKm = (km?: number | null) => (km == null ? '—' : `${Number(km).toFixed(1).replace('.', ',')} km`);

export const hhmm = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';

export const shortId = (id: string) => `#${id.slice(-6).toUpperCase()}`;

/**
 * Ouvre l'itinéraire dans l'application de navigation choisie. Les
 * coordonnées priment sur l'adresse, plus sûre qu'une adresse mal saisie.
 */
export async function openNavigation(
  target: { lat?: number | null; lng?: number | null; address?: string },
  app: Exclude<Prefs['navigationApp'], 'zupone'>
) {
  const coords = target.lat != null && target.lng != null ? `${target.lat},${target.lng}` : null;
  const query = coords || encodeURIComponent(target.address || '');
  if (!query) return false;

  const google = `https://www.google.com/maps/dir/?api=1&destination=${query}&travelmode=driving`;
  const candidates: string[] = [];
  if (app === 'waze') {
    candidates.push(coords ? `https://waze.com/ul?ll=${coords}&navigate=yes` : `https://waze.com/ul?q=${query}&navigate=yes`);
  } else if (app === 'apple' && Platform.OS === 'ios') {
    candidates.push(`maps://?daddr=${query}&dirflg=d`);
  }
  candidates.push(google);

  for (const url of candidates) {
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      // Application absente : on passe à la suivante.
    }
  }
  return false;
}

export function callPhone(phone?: string | null) {
  if (!phone) return;
  Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`).catch(() => undefined);
}
