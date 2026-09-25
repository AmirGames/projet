import { useCallback, useEffect, useRef } from 'react';
import { apiFetch } from './api';
import { Cart, CartLine, Carts, saveCarts } from './carts';
import { useRealtimeEvent } from './realtime';

/** Une ligne telle que le serveur et le site la gardent (`frontend/lib/paniers.ts`). */
interface RemoteLine {
  productId: string;
  variantId?: string;
  name: string;
  variantNom?: string;
  price: number;
  quantity: number;
}

/** Un panier tel que le serveur le rend et l'annonce (« panier-modifie »). */
interface RemoteCart {
  storeId: string;
  storeName: string;
  storeSlug: string | null;
  storeLogo: string | null;
  lignes: RemoteLine[];
  majA: string;
  appareil?: string | null;
}

/** Cet appareil, pour reconnaître ses propres annonces. */
const DEVICE = `mobile-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;

const fromRemote = (l: RemoteLine): CartLine => ({
  productId: l.productId,
  ...(l.variantId ? { variantId: l.variantId } : {}),
  name: l.name,
  ...(l.variantNom ? { variantName: l.variantNom } : {}),
  price: Number(l.price) || 0,
  quantity: l.quantity,
});

const toRemote = (l: CartLine): RemoteLine => ({
  productId: l.productId,
  ...(l.variantId ? { variantId: l.variantId } : {}),
  name: l.name,
  ...(l.variantName ? { variantNom: l.variantName } : {}),
  price: l.price,
  quantity: l.quantity,
});

/** Ce qui compte pour dire qu'un panier a changé : plats, choix, quantités, prix. */
const fingerprint = (lines: { productId: string; variantId?: string; quantity: number; price: number }[] = []) =>
  JSON.stringify(lines.map((l) => [l.productId, l.variantId || '', l.quantity, Number(l.price)]));

const toCart = (r: RemoteCart, local?: Cart): Cart => ({
  storeId: r.storeId,
  storeName: r.storeName || local?.storeName || '',
  storeLogo: r.storeLogo ?? local?.storeLogo ?? null,
  lines: r.lignes.map(fromRemote),
  updatedAt: r.majA,
});

/**
 * Les paniers suivent le compte : commencés sur le site, ils sont là sur le
 * téléphone, et inversement, en direct.
 *
 * Le téléphone garde sa copie (hors ligne, elle reste utilisable). À la
 * connexion, elle rejoint celle du serveur, la plus récente l'emportant pour
 * chaque commerce ; ensuite chaque modification part au serveur, qui
 * l'annonce aux autres appareils du compte.
 */
export function useCartSync({
  token,
  carts,
  setCarts,
}: {
  token: string;
  carts: Carts;
  setCarts: (update: (c: Carts) => Carts) => void;
}) {
  /** Pour chaque commerce, l'état que le serveur connaît. */
  const synced = useRef(new Map<string, string>());
  /** Tant que la première fusion n'est pas faite, rien ne part : on écraserait un panier plus récent. */
  const ready = useRef(false);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const cartsRef = useRef(carts);
  cartsRef.current = carts;

  const push = useCallback(
    (storeId: string) => {
      clearTimeout(timers.current.get(storeId));
      timers.current.set(
        storeId,
        setTimeout(async () => {
          timers.current.delete(storeId);
          const cart = cartsRef.current[storeId];
          const lines = cart?.lines || [];
          synced.current.set(storeId, fingerprint(lines));
          try {
            const res = await apiFetch<{ data: RemoteCart }>(`/api/client/me/paniers/${storeId}`, token, {
              method: 'PUT',
              body: {
                storeName: cart?.storeName || undefined,
                storeLogo: cart?.storeLogo ?? undefined,
                lignes: lines.map(toRemote),
                appareil: DEVICE,
              },
            });
            // L'heure du serveur fait foi pour départager deux appareils :
            // celle du téléphone peut avancer ou retarder.
            const majA = res.data?.majA;
            if (majA && !timers.current.has(storeId)) {
              setCarts((current) =>
                current[storeId] && fingerprint(current[storeId].lines) === fingerprint(lines)
                  ? { ...current, [storeId]: { ...current[storeId], updatedAt: majA } }
                  : current
              );
            }
          } catch {
            // Hors ligne : la prochaine synchronisation le renverra.
            synced.current.delete(storeId);
          }
        }, 400)
      );
    },
    [token, setCarts]
  );

  const syncAll = useCallback(async () => {
    if (!token) return;
    let remote: RemoteCart[];
    try {
      remote = (await apiFetch<{ data: RemoteCart[] }>('/api/client/me/paniers', token)).data || [];
    } catch {
      return;
    }

    const toPush: string[] = [];
    setCarts((current) => {
      const next = { ...current };
      const known = new Set<string>();
      for (const r of remote) {
        known.add(r.storeId);
        const local = next[r.storeId];
        // Modifié ici et pas encore parti : c'est lui qui l'emportera.
        if (timers.current.has(r.storeId)) continue;
        if (local && local.updatedAt > r.majA && fingerprint(local.lines) !== fingerprint(r.lignes)) {
          toPush.push(r.storeId);
          continue;
        }
        synced.current.set(r.storeId, fingerprint(r.lignes));
        if (r.lignes.length === 0) delete next[r.storeId];
        else next[r.storeId] = toCart(r, local);
      }
      // Composés avant de se connecter : le serveur ne les connaît pas encore.
      Object.keys(next).forEach((storeId) => {
        if (!known.has(storeId)) toPush.push(storeId);
      });
      saveCarts(next);
      return next;
    });
    ready.current = true;
    setTimeout(() => [...new Set(toPush)].forEach(push), 0);
  }, [token, setCarts, push]);

  // Connexion : la première fusion.
  useEffect(() => {
    ready.current = false;
    synced.current.clear();
    if (token) syncAll();
  }, [token, syncAll]);

  // Chaque modification faite ici part au serveur.
  useEffect(() => {
    if (!token || !ready.current) return;
    const ids = new Set([...Object.keys(carts), ...synced.current.keys()]);
    ids.forEach((storeId) => {
      const now = fingerprint(carts[storeId]?.lines);
      if (synced.current.get(storeId) !== now) {
        synced.current.set(storeId, now);
        push(storeId);
      }
    });
  }, [carts, token, push]);

  // Modifié sur un autre appareil du compte : appliqué aussitôt.
  useRealtimeEvent('panier-modifie', (r: RemoteCart) => {
    if (!r?.storeId || r.appareil === DEVICE || timers.current.has(r.storeId)) return;
    synced.current.set(r.storeId, fingerprint(r.lignes));
    setCarts((current) => {
      const next = { ...current };
      if (r.lignes.length === 0) delete next[r.storeId];
      else next[r.storeId] = toCart(r, current[r.storeId]);
      saveCarts(next);
      return next;
    });
  });

  // Ce qui a changé pendant une coupure n'a pas été annoncé : on relit.
  useRealtimeEvent('reconnecte', () => {
    if (token && ready.current) syncAll();
  });
}
