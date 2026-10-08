/** Les statuts d'un trajet, en français (mêmes libellés que le site). */

export const STATUT_COURT: Record<string, string> = {
  RECHERCHE: "Recherche d'un chauffeur",
  ACCEPTEE: 'Chauffeur en route',
  ARRIVEE: 'Chauffeur arrivé',
  EN_COURS: 'En cours',
  TERMINEE: 'Terminée',
  ANNULEE: 'Annulée',
  SANS_CHAUFFEUR: 'Sans chauffeur',
};

export const STATUT_DETAIL: Record<string, string> = {
  RECHERCHE: "Recherche d'un chauffeur…",
  ACCEPTEE: 'Votre chauffeur arrive',
  ARRIVEE: 'Votre chauffeur vous attend',
  EN_COURS: 'Bon trajet !',
  TERMINEE: 'Trajet terminé',
  ANNULEE: 'Trajet annulé',
  SANS_CHAUFFEUR: 'Aucun chauffeur disponible',
};

/** Un statut inconnu (ajouté côté serveur) s'affiche tel quel plutôt que de planter. */
export const statutCourt = (statut: string) => STATUT_COURT[statut] ?? statut;
export const statutDetail = (statut: string) => STATUT_DETAIL[statut] ?? statut;
