/**
 * Clé de tentative d'achat (en-tête Idempotency-Key).
 *
 * Un achat renvoyé tel quel — double appui, réseau coupé puis nouvel essai —
 * rend la même commande au lieu d'en créer une seconde. La clé reste la même
 * tant que le contenu envoyé ne change pas.
 */
let last: { body: string; key: string } | null = null;

const random = () => Math.random().toString(36).slice(2, 12);

export function attemptKey(body: unknown): string {
  const serialized = JSON.stringify(body);
  if (!last || last.body !== serialized) {
    last = { body: serialized, key: `${Date.now().toString(36)}-${random()}${random()}` };
  }
  return last.key;
}

/** Après un achat abouti : le prochain sera un nouvel achat. */
export function forgetAttempt() {
  last = null;
}
