export interface Order {
  id: string;
  status?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  totalAmount: number | string;
  taxAmount?: number | string;
  deliveryType?: string;
  deliveryAddress?: string;
  deliveryCity?: string;
  deliveryPostal?: string;
  notes?: string | null;
  preparationMinutes?: number | null;
  estimatedReadyAt?: string | null;
  items?: OrderItem[];
  delivery?: OrderDelivery | null;
  storeId?: string;
  createdAt?: string;
}

export interface OrderItem {
  id: string;
  product?: { name: string; category?: { name: string; displayOrder?: number } | null };
  quantity: number;
  total: number | string;
}

export interface OrderDelivery {
  status: 'PENDING' | 'ACCEPTED' | 'PICKED_UP' | 'DELIVERED' | 'FAILED' | string;
  assignedAt?: string | null;
  pickupTime?: string | null;
  deliveryTime?: string | null;
  driver?: { name: string; phone?: string | null; vehicleType?: string | null } | null;
}

const STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'En attente', color: '#FFA500' },
  ACCEPTED: { label: 'Acceptée', color: '#4CAF50' },
  PREPARING: { label: 'En préparation', color: '#2196F3' },
  READY: { label: 'Prête', color: '#9C27B0' },
  COMPLETED: { label: 'Terminée', color: '#607D8B' },
  REJECTED: { label: 'Refusée', color: '#F44336' },
  CANCELLED: { label: 'Annulée', color: '#9E9E9E' },
};

export const statusLabel = (status?: string) => STATUS[(status || '').toUpperCase()]?.label || status || '—';
export const statusColor = (status?: string) => STATUS[(status || '').toUpperCase()]?.color || '#999';

const IN_DELIVERY = { label: 'En livraison', color: '#00897B' };

/**
 * Le statut à montrer : une commande « prête » récupérée par le livreur reste
 * READY côté serveur jusqu'à la livraison, mais elle n'est plus en boutique.
 */
export function displayStatus(order: Order) {
  const status = (order.status || '').toUpperCase();
  if (order.deliveryType === 'DELIVERY' && order.delivery?.status === 'PICKED_UP' && status !== 'COMPLETED') {
    return IN_DELIVERY;
  }
  return { label: statusLabel(order.status), color: statusColor(order.status) };
}

const hhmm = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';

/** Où en est le livreur, en une phrase. */
export function deliveryStep(order: Order): { icon: string; text: string; done?: boolean } | null {
  if (order.deliveryType !== 'DELIVERY') return null;
  const d = order.delivery;
  const who = d?.driver?.name?.split(' ')[0] || 'Le livreur';
  // Le livreur n'est cherché qu'à partir de « En préparation ».
  if (!d && ['PENDING', 'ACCEPTED'].includes((order.status || '').toUpperCase())) {
    return { icon: '⏳', text: 'Un livreur sera appelé dès que la commande passe en préparation' };
  }
  switch (d?.status) {
    case 'ACCEPTED':
      return { icon: '🛵', text: `Livreur trouvé : ${who} arrive au commerce` };
    case 'PICKED_UP':
      return { icon: '📦', text: `Récupérée par ${who}${d.pickupTime ? ` à ${hhmm(d.pickupTime)}` : ''} · en route vers le client` };
    case 'DELIVERED':
      return { icon: '✅', text: `Livrée${d.deliveryTime ? ` à ${hhmm(d.deliveryTime)}` : ''}`, done: true };
    case 'FAILED':
      return { icon: '⚠️', text: 'Livraison échouée — contactez le support' };
    default:
      return { icon: '🔎', text: 'Recherche d’un livreur…' };
  }
}

/** Les articles groupés par catégorie, dans l'ordre du menu. */
export function itemsByCategory(items: OrderItem[] = []) {
  const groups = new Map<string, { name: string; order: number; items: OrderItem[] }>();
  for (const item of items) {
    const cat = item.product?.category;
    const key = cat?.name || '';
    if (!groups.has(key)) {
      groups.set(key, { name: cat?.name || 'Autres', order: cat ? cat.displayOrder ?? 0 : Number.MAX_SAFE_INTEGER, items: [] });
    }
    groups.get(key)!.items.push(item);
  }
  return [...groups.values()].sort((a, b) => a.order - b.order);
}
export const isPending = (o: Order) => (o.status || '').toUpperCase() === 'PENDING';

export const isToday = (iso?: string) => {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
};
