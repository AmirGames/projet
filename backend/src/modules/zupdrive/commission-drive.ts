import { db } from "../../services/db";

/**
 * Commission de la plateforme sur une course ZupDrive : une seule règle, partagée par
 * le paiement, les versements, la supervision et les rapports (CLAUDE.md : montants en
 * centimes entiers, arrondi explicite, la somme des parts est exacte).
 *
 * Le pourcentage vient de PlatformSettingsDrive (ligne « default »). Il est appliqué à la
 * création du paiement puis figé sur PaymentIntentDrive (platformCommissionCentimes,
 * driverEarningsCentimes) : changer le pourcentage ne réécrit jamais un paiement existant.
 */

/** Commission par défaut si la ligne PlatformSettingsDrive « default » n'existe pas encore. */
export const COMMISSION_PAR_DEFAUT_POURCENT = 20;

export interface RepartitionPrixCourse {
  commissionCentimes: number;
  chauffeurCentimes: number;
}

/**
 * Répartition unique du prix d'une course (entiers, en centimes).
 * commission = arrondi(prix × pourcentage / 100) ; chauffeur = prix - commission,
 * donc commission + chauffeur = prix exactement. Toute la plateforme doit passer par ici.
 */
export function repartirPrixCourse(prixCentimes: number, commissionPourcent: number): RepartitionPrixCourse {
  const commissionCentimes = Math.round((prixCentimes * commissionPourcent) / 100);
  return { commissionCentimes, chauffeurCentimes: prixCentimes - commissionCentimes };
}

/** Pourcentage de commission global (PlatformSettingsDrive, ligne « default »). */
export async function lireCommissionPourcentage(): Promise<number> {
  const reglages = await db.platformSettingsDrive.findUnique({
    where: { id: "default" },
    select: { commissionPercentage: true },
  });
  return reglages?.commissionPercentage ?? COMMISSION_PAR_DEFAUT_POURCENT;
}
