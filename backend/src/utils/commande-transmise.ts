/**
 * Ce que le commerçant voit de ses commandes.
 *
 * Une commande payée par carte naît sans `submittedAt` : elle attend
 * l'encaissement. Tant qu'il n'est pas confirmé, elle n'apparaît ni dans ses
 * listes, ni dans ses chiffres, et personne ne lui demande d'y répondre.
 */
export const TRANSMISE = { submittedAt: { not: null } } as const;

/**
 * Les moyens de paiement réglés en ligne, par carte, avant que la commande
 * parte au commerçant. Les autres (espèces, virement…) se règlent sur place.
 */
export const TYPES_PAYES_EN_LIGNE = ["STRIPE", "CREDIT_CARD", "DEBIT_CARD"];

export function payeEnLigne(type: string | null | undefined, stripeActif: boolean) {
  return stripeActif && !!type && TYPES_PAYES_EN_LIGNE.includes(type);
}

/** Le moment de référence pour le délai de réponse du commerçant. */
export function arriveeChezLeCommercant(commande: { submittedAt?: Date | null; createdAt: Date }) {
  return commande.submittedAt ?? commande.createdAt;
}
