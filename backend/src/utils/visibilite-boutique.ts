/**
 * Faut-il montrer une boutique au client, vu d'où il habite ?
 *
 * La liste s'arrêtait à un cercle fixe à vol d'oiseau (10 km depuis
 * l'accueil), sans rien savoir des zones de livraison : une boutique qui
 * livrait à 15 km disparaissait à 12, et une autre qui ne livrait qu'à 3 km
 * restait affichée à 8.
 *
 * Désormais, une boutique apparaît :
 *  - si elle **livre vraiment** à cette adresse — ses zones, ou le rayon des
 *    livreurs de la plateforme, le disent ;
 *  - ou si elle est **assez proche pour un retrait** sur place.
 *
 * Une boutique sans aucune zone réglée livre « partout » au forfait : prise au
 * mot, elle s'afficherait dans tout le pays. On ne la compte donc comme
 * livrant que dans le rayon de retrait, faute de mieux.
 */
export interface VerdictResume {
  livrable: boolean;
  /** Vrai quand aucune zone n'est réglée et que le forfait s'applique partout. */
  forfaitBoutique: boolean;
}

export function livreVraiment(verdict: VerdictResume | null, distanceKm: number, rayonRetraitKm: number): boolean {
  if (!verdict?.livrable) return false;
  return verdict.forfaitBoutique ? distanceKm <= rayonRetraitKm : true;
}

export function boutiqueVisible(verdict: VerdictResume | null, distanceKm: number, rayonRetraitKm: number): boolean {
  return livreVraiment(verdict, distanceKm, rayonRetraitKm) || distanceKm <= rayonRetraitKm;
}
