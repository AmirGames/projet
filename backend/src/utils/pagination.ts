/**
 * Bornes de pagination venues de la requête.
 *
 * `parseInt(req.query.limit) || 20` laisse passer n'importe quelle valeur :
 * `limit=1000000` charge toute la table, `limit=-5` fait lire à l'envers à
 * Prisma. Ces deux fonctions rendent toujours un entier dans une plage sûre.
 */

/** Un entier entre 1 et `max` ; `defaut` si la valeur est absente ou illisible. */
export function limiteBornee(valeur: unknown, defaut: number, max: number): number {
  const brut = Array.isArray(valeur) ? valeur[0] : valeur;
  const n = Number.parseInt(String(brut ?? ""), 10);
  if (!Number.isFinite(n)) return Math.min(defaut, max);
  return Math.min(Math.max(n, 1), max);
}

/** Un entier positif ou nul ; 0 si la valeur est absente, illisible ou négative. */
export function decalage(valeur: unknown): number {
  const brut = Array.isArray(valeur) ? valeur[0] : valeur;
  const n = Number.parseInt(String(brut ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
