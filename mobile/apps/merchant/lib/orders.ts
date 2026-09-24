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
  items?: {
    id: string;
    product?: { name: string };
    quantity: number;
    total: number | string;
  }[];
  storeId?: string;
  createdAt?: string;
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
export const isPending = (o: Order) => (o.status || '').toUpperCase() === 'PENDING';

export const isToday = (iso?: string) => {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
};
