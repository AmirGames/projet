import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Un panier par commerce, comme sur le site (`frontend/lib/paniers.ts`) :
 * passer d'une boutique à l'autre ne mélange rien, et les paniers laissés
 * ailleurs attendent leur tour.
 */

const KEY = 'zupone.customer.carts';

export interface CartLine {
  productId: string;
  /** La déclinaison choisie, quand le plat se décline. */
  variantId?: string;
  name: string;
  variantName?: string;
  /** En euros. */
  price: number;
  quantity: number;
}

export interface Cart {
  storeId: string;
  storeName: string;
  storeLogo?: string | null;
  lines: CartLine[];
  updatedAt: string;
}

export type Carts = Record<string, Cart>;

/** Produit et déclinaison : « penne » et « spaghetti » du même plat font deux lignes. */
export const lineKey = (productId: string, variantId?: string) => (variantId ? `${productId}:${variantId}` : productId);

export async function loadCarts(): Promise<Carts> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    // Un contenu abîmé ne doit pas faire planter l'application.
    return Object.fromEntries(
      Object.entries(parsed as Carts).filter(([, cart]) => cart && Array.isArray(cart.lines) && cart.lines.length > 0)
    );
  } catch {
    return {};
  }
}

export function saveCarts(carts: Carts) {
  AsyncStorage.setItem(KEY, JSON.stringify(carts)).catch(() => undefined);
}

/** Remplace les lignes d'un panier ; un panier vide disparaît. */
export function withLines(carts: Carts, store: { id: string; name: string; logo?: string | null }, lines: CartLine[]): Carts {
  const next = { ...carts };
  if (lines.length === 0) {
    delete next[store.id];
  } else {
    next[store.id] = {
      storeId: store.id,
      storeName: store.name || carts[store.id]?.storeName || '',
      storeLogo: store.logo ?? carts[store.id]?.storeLogo ?? null,
      lines,
      updatedAt: new Date().toISOString(),
    };
  }
  return next;
}

export function addLine(lines: CartLine[], line: CartLine): CartLine[] {
  const key = lineKey(line.productId, line.variantId);
  const existing = lines.find((l) => lineKey(l.productId, l.variantId) === key);
  if (!existing) return [...lines, line];
  return lines.map((l) => (l === existing ? { ...l, quantity: l.quantity + line.quantity } : l));
}

export function changeQuantity(lines: CartLine[], key: string, delta: number): CartLine[] {
  return lines
    .map((l) => (lineKey(l.productId, l.variantId) === key ? { ...l, quantity: l.quantity + delta } : l))
    .filter((l) => l.quantity > 0);
}

/** Les paniers non vides, du plus récent au plus ancien. */
export const sortedCarts = (carts: Carts) =>
  Object.values(carts)
    .filter((c) => c.lines.length > 0)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

export const itemCount = (lines: CartLine[]) => lines.reduce((n, l) => n + l.quantity, 0);

export const cartTotal = (lines: CartLine[]) => lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
