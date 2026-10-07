/**
 * Un prix HT passé TTC, arrondi au centime.
 *
 * Le calcul se fait en entiers (centimes, taux en centièmes de pour cent) :
 * `0,5 × 1,21` vaut 0,605 en théorie mais 0,60499… en flottant, et
 * `toFixed(2)` rendait 0,60 au lieu du 0,61 attendu. Ici, l'arrondi est celui du
 * commerce : au centime le plus proche, la moitié vers le haut.
 */
export function ttc(prix: unknown, taux: number) {
  const centimes = Math.round(Number(prix) * 100);
  const centiemesDePourCent = Math.round(taux * 100);
  return Math.round((centimes * (10000 + centiemesDePourCent)) / 10000) / 100;
}
