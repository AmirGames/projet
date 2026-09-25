/**
 * Ce que le commerçant voit de ses commandes.
 *
 * Une commande payée en ligne (tout sauf les espèces) naît sans `submittedAt` : elle attend
 * l'encaissement. Tant qu'il n'est pas confirmé, elle n'apparaît ni dans ses
 * listes, ni dans ses chiffres, et personne ne lui demande d'y répondre.
 */
export const TRANSMISE = { submittedAt: { not: null } } as const;

/**
 * Toute commande se règle en ligne, par Stripe, avant de partir au
 * commerçant — sauf les espèces, réglées à la remise. Une commande sans moyen
 * de paiement choisi se règle en ligne elle aussi : rien ne dit qu'elle sera
 * payée autrement.
 */
export function payeEnLigne(type: string | null | undefined, stripeActif: boolean) {
  return stripeActif && type !== "CASH";
}

/** Le moment de référence pour le délai de réponse du commerçant. */
export function arriveeChezLeCommercant(commande: { submittedAt?: Date | null; createdAt: Date }) {
  return commande.submittedAt ?? commande.createdAt;
}
