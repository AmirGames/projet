import { mediaUrl } from './api';

/** Un commerce tel que le renvoient /api/client/stores et /stores/nearby. */
export interface Store {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  /** Moyenne des avis publiés, null tant que personne n'a noté. */
  rating?: number | string | null;
  totalRatings?: number;
  distance?: number;
  deliveryCost?: number | string | null;
  isOpen?: boolean;
  /** Le planning de la semaine et le bouton rapide du commerçant, croisés. */
  isOpenNow?: boolean;
  famille?: string | null;
  genreLibelle?: string | null;
  settings?: { logo?: string | null } | null;
  /** Les frais jusqu'à l'adresse du client, quand elle est connue. */
  livraison?: {
    livrable: boolean;
    frais: number;
    minimum: number;
    deliveryMinutes: number | null;
  } | null;
}

export interface Famille {
  code: string;
  libelle: string;
  emoji: string;
}

export interface Variant {
  id: string;
  label: string;
  price: number | null;
  /** Le prix réellement payé : celui de la déclinaison, sinon celui du plat. */
  prixEffectif: number;
  isAvailable: boolean;
}

export interface Product {
  id: string;
  name: string;
  description?: string | null;
  price: number | string;
  isAvailable: boolean;
  variantLabel?: string | null;
  variants: Variant[];
  media?: { url: string }[];
  images?: { url: string }[];
  note?: { moyenne: number; nombre: number } | null;
}

/** La fiche d'un commerce avec son menu, rangé par catégorie dans l'ordre du commerçant. */
export interface StoreDetail extends Store {
  menu: Record<string, Product[]>;
  enAttenteDeValidation?: boolean;
  averageRating?: number | string;
  reviewCount?: number;
  reviews?: { id: string; rating: number; comment?: string | null; createdAt: string; customer?: { name?: string } | null }[];
}

/** Ce que dit le serveur d'une adresse : livrée ou non, à quels frais, à partir de quel montant. */
export interface DeliveryVerdict {
  livrable: boolean;
  frais: number;
  minimum: number;
  raison?: string | null;
  zone?: { deliveryMinutes?: number | null } | null;
}

export const storeLogo = (store?: { settings?: { logo?: string | null } | null } | null) => mediaUrl(store?.settings?.logo);

export const productImage = (product: Product) => mediaUrl((product.media || product.images || [])[0]?.url);

export function formatRating(rating: unknown, count?: number) {
  const value = rating == null ? NaN : Number(rating);
  if (!count || !Number.isFinite(value) || value <= 0) return null;
  return `★ ${value.toFixed(1).replace('.', ',')} (${count})`;
}

export const formatKm = (km?: number | null) =>
  km == null ? '' : km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1).replace('.', ',')} km`;
