/**
 * La clé de tentative d'achat (en-tête Idempotency-Key).
 *
 * Un achat renvoyé tel quel — double clic, nouvel essai après un délai, réponse
 * perdue — doit rendre la même commande, pas en créer une seconde. La clé
 * reste la même tant que le contenu envoyé ne change pas ; un panier modifié
 * est un autre achat et reçoit une autre clé.
 */
let derniere: { corps: string; cle: string } | null = null;

export function cleDeTentative(corps: string): string {
  if (!derniere || derniere.corps !== corps) {
    const aleatoire =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    derniere = { corps, cle: aleatoire };
  }
  return derniere.cle;
}

/** Après un achat abouti : le prochain sera un nouvel achat. */
export function oublierTentative() {
  derniere = null;
}
