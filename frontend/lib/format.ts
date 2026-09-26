/**
 * Formatage des montants.
 *
 * Les colonnes monétaires du schéma sont des `Decimal(10, 2)` : elles
 * contiennent des euros, pas des centimes. Prisma les sérialise en chaîne
 * ("12.50"), d'où le passage systématique par `Number()` — sans quoi
 * l'opérateur `+` concatène au lieu d'additionner.
 */
export function euro(valeur: number | string | null | undefined, decimales = 2) {
  return Number(valeur || 0).toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

/** Somme une colonne monétaire sans risque de concaténation de chaînes. */
export function sommeEuros<T>(lignes: T[], champ: (ligne: T) => number | string | null | undefined) {
  return lignes.reduce((total, ligne) => total + Number(champ(ligne) || 0), 0);
}

/**
 * L'équivalent à la semaine d'un tarif mensuel.
 *
 * La facturation reste mensuelle ; le prix à la semaine n'est qu'un
 * argument d'affichage. Un mois compte en moyenne 52 / 12 semaines.
 */
export function parSemaine(prixMensuel: number | string | null | undefined) {
  return (Number(prixMensuel || 0) * 12) / 52;
}

type Montants = {
  totalAmount: number | string | null | undefined;
  feesAmount?: number | string | null;
  serviceFeeAmount?: number | string | null;
};

/**
 * Ce que la commande rapporte au commerçant : ses articles, remise déduite.
 *
 * `totalAmount` est ce que le client a payé, livraison et frais de service
 * compris : 15 € d'articles s'affichaient 20,25 € chez le commerçant. La
 * livraison, quand elle est à lui, se montre sur sa propre ligne.
 */
export function montantCommercant(commande: Montants) {
  const montant =
    Number(commande.totalAmount || 0) -
    Number(commande.feesAmount || 0) -
    Number(commande.serviceFeeAmount || 0);
  return Math.max(0, Number(montant.toFixed(2)));
}
