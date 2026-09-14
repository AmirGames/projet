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
