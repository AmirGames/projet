/**
 * Le jeton de suivi d'une commande.
 *
 * Le suivi public (`GET /api/orders/:id`) ne s'ouvre plus avec le seul numéro
 * de commande : il faut le jeton remis une seule fois à la création, ou celui
 * que portent les liens des e-mails et SMS (`/track?commande=…&t=…`). La
 * vitrine le garde dans ce navigateur, pour qu'un client invité retrouve sa
 * commande sans chercher le message.
 */

const CLE = (orderId: string) => `suiviCommande:${orderId}`;

/** Garde le jeton d'une commande dans ce navigateur. */
export function memoriserJetonDeSuivi(orderId: string | undefined, jeton: unknown) {
  if (!orderId || typeof jeton !== 'string' || !jeton) return;
  try {
    localStorage.setItem(CLE(orderId), jeton);
  } catch {
    // Stockage indisponible (navigation privée) : le lien de l'e-mail reste.
  }
}

/** Le jeton gardé pour cette commande, s'il y en a un. */
export function jetonDeSuivi(orderId: string): string | null {
  try {
    return localStorage.getItem(CLE(orderId));
  } catch {
    return null;
  }
}

/** Le chemin d'API d'une commande, avec son jeton de suivi quand il est connu. */
export function cheminCommande(orderId: string, jeton?: string | null, suite = '') {
  const base = `/api/orders/${encodeURIComponent(orderId)}${suite}`;
  return jeton ? `${base}?t=${encodeURIComponent(jeton)}` : base;
}
