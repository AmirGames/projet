/**
 * Distance de livraison selon le véhicule du livreur.
 *
 * Un vélo ne fait pas 8 km avec un repas : la distance du trajet (commerce →
 * client) est limitée selon le véhicule — vélo 4 km, scooter 7 km par défaut —
 * et jamais au-delà du rayon de la plateforme (driverMaxRadiusKm), qui est la
 * limite de la voiture. Les trois valeurs se règlent dans l'espace plateforme.
 *
 * Ce sont des préférences d'attribution, pas des interdits : une course que
 * aucun véhicule adapté ne prend est ouverte, au bout d'un délai, aux autres
 * livreurs, qui acceptent ou refusent en connaissance de la distance.
 */

export interface LimitesVehicule {
  maxRadiusKm: number;
  bikeMaxKm: number;
  scooterMaxKm: number;
  /** Délai avant d'ouvrir une course aux véhicules hors limite. */
  exceptionSeconds: number;
}

export const LIMITES_VEHICULE_PAR_DEFAUT: LimitesVehicule = {
  maxRadiusKm: 8,
  bikeMaxKm: 4,
  scooterMaxKm: 7,
  exceptionSeconds: 180,
};

/** Jusqu'où ce véhicule livre sans exception. Un type inconnu vaut la voiture. */
export function limiteVehiculeKm(vehicleType: string | null | undefined, limites: LimitesVehicule): number {
  if (vehicleType === "bike") return Math.min(limites.bikeMaxKm, limites.maxRadiusKm);
  if (vehicleType === "scooter") return Math.min(limites.scooterMaxKm, limites.maxRadiusKm);
  return limites.maxRadiusKm;
}

/**
 * Ce véhicule couvre-t-il ce trajet ? Sans distance connue (adresse non
 * géolocalisée), on ne peut pas juger : la course n'est pas écartée.
 */
export function peutLivrer(
  vehicleType: string | null | undefined,
  trajetKm: number | null | undefined,
  limites: LimitesVehicule
): boolean {
  if (trajetKm == null || !Number.isFinite(trajetKm)) return true;
  return trajetKm <= limiteVehiculeKm(vehicleType, limites);
}

/**
 * Les livreurs hors limite peuvent-ils recevoir la course ?
 *
 * Oui s'il n'existe aucun livreur adapté dans le secteur (inutile d'attendre),
 * ou si la course cherche preneur depuis plus que le délai réglé.
 */
export function exceptionOuverte(options: {
  aucunLivreurAdapte: boolean;
  rechercheDepuis: Date;
  maintenant: number;
  limites: LimitesVehicule;
}): boolean {
  if (options.aucunLivreurAdapte) return true;
  return options.maintenant - options.rechercheDepuis.getTime() >= options.limites.exceptionSeconds * 1000;
}
