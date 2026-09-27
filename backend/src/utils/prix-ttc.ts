/** Un prix HT passé TTC, arrondi au centime. */
export function ttc(prix: unknown, taux: number) {
  return Number((Number(prix) * (1 + taux / 100)).toFixed(2));
}
