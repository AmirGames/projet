import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { calculerItineraire, type Point } from "./itineraire.service";
import { REGIONS, type Region } from "./chauffeur-onboarding.service";
import { MatchingAlgorithmService } from "./matching-algorithm.service";

/**
 * Le prix d'une course ZupDrive, fixé à la commande.
 *
 * Tous les montants sont des entiers en centimes d'euro. Le prix est :
 *
 *   max(minimum, priseEnCharge + parKm × km + parMinute × minutes)
 *
 * calculé sur des valeurs exactes (mètres, secondes), puis arrondi au centime
 * le plus proche une seule fois, sur le total. Il est annoncé au passager
 * avant la commande, figé avec la course, et le tarif appliqué est recopié
 * dans la course pour rester explicable.
 *
 * Distance et durée viennent de l'itinéraire (itineraire.service.ts : OSRM
 * ou estimation). Le devis est ensuite signé (devis-signe.ts) : la commande
 * reprend exactement le prix affiché.
 */

/** Un trajet plus court n'a pas de sens pour une course (et plus long non plus). */
const DISTANCE_MIN_METRES = 300;
const DISTANCE_MAX_METRES = 200_000;

export type { Point };

export interface Tarif {
  priseEnChargeCentimes: number;
  parKmCentimes: number;
  parMinuteCentimes: number;
  minimumCentimes: number;
}

/** Le prix en centimes, arrondi une seule fois, sur le total. */
export function calculerPrix(tarif: Tarif, distanceMetres: number, dureeSecondes: number): number {
  const brut =
    tarif.priseEnChargeCentimes +
    (tarif.parKmCentimes * distanceMetres) / 1000 +
    (tarif.parMinuteCentimes * dureeSecondes) / 60;
  return Math.max(tarif.minimumCentimes, Math.round(brut));
}

/** Le prix avec surge multiplier optionnel (ex: 1.5 pour 50% de supplément). */
function calculerPrixAvecSurge(
  tarif: Tarif,
  distanceMetres: number,
  dureeSecondes: number,
  surgeFactor: number = 1.0
): { prixBaseCentimes: number; surgeFactor: number; prixFinalCentimes: number } {
  const prixBase = calculerPrix(tarif, distanceMetres, dureeSecondes);
  const prixFinal = Math.round(prixBase * surgeFactor);
  return {
    prixBaseCentimes: prixBase,
    surgeFactor,
    prixFinalCentimes: prixFinal,
  };
}

/**
 * La région d'une adresse belge, d'après son code postal : c'est elle qui
 * fixe le tarif et les chauffeurs autorisés (une licence ne vaut que dans sa
 * région). Bruxelles 1000–1299 ; Wallonie 1300–1499 et 4000–7999 ; Flandre
 * 1500–3999 et 8000–9999.
 */
export function regionDuCodePostal(codePostal: string | null | undefined): Region | null {
  const cp = Number((codePostal || "").trim());
  if (!Number.isInteger(cp) || cp < 1000 || cp > 9999) return null;
  if (cp <= 1299) return "BRUXELLES";
  if (cp <= 1499) return "WALLONIE";
  if (cp <= 3999) return "FLANDRE";
  if (cp <= 7999) return "WALLONIE";
  return "FLANDRE";
}

const tarifDe = (ligne: Tarif): Tarif => ({
  priseEnChargeCentimes: ligne.priseEnChargeCentimes,
  parKmCentimes: ligne.parKmCentimes,
  parMinuteCentimes: ligne.parMinuteCentimes,
  minimumCentimes: ligne.minimumCentimes,
});

export class TarificationDriveService {
  /**
   * Le devis d'un trajet : distance, durée et prix, avec le tarif appliqué.
   * Refusé hors de Belgique, dans une région où le service n'est pas ouvert,
   * ou quand départ et destination ne sont pas dans la même région (la
   * licence du chauffeur ne vaut que dans la sienne).
   *
   * Inclut optionnellement le surge pricing basé sur la demande/offre actuelle.
   */
  static async devis(
    trajet: {
      depart: Point & { codePostal: string };
      arrivee: Point & { codePostal: string };
    },
    includeSurgePricing: boolean = true
  ) {
    const region = regionDuCodePostal(trajet.depart.codePostal);
    if (!region) {
      throw new ApiError(400, "ZupDrive n'est disponible qu'en Belgique pour le moment", "REGION_NOT_SERVED");
    }
    if (regionDuCodePostal(trajet.arrivee.codePostal) !== region) {
      throw new ApiError(
        400,
        "Départ et destination doivent être dans la même région (Bruxelles, Wallonie ou Flandre)",
        "CROSS_REGION_RIDE"
      );
    }

    const ligne = await db.tarifDrive.findUnique({ where: { region } });
    if (!ligne?.actif) {
      throw new ApiError(400, "ZupDrive n'est pas encore ouvert dans cette région", "REGION_NOT_SERVED");
    }

    const { distanceMetres, dureeSecondes, trace, source } = await calculerItineraire(trajet.depart, trajet.arrivee);
    if (distanceMetres < DISTANCE_MIN_METRES) {
      throw new ApiError(400, "Départ et destination sont trop proches", "RIDE_TOO_SHORT");
    }
    if (distanceMetres > DISTANCE_MAX_METRES) {
      throw new ApiError(400, "Ce trajet est trop long", "RIDE_TOO_LONG");
    }

    const tarif = tarifDe(ligne);

    // Calcule le surge pricing basé sur demande/offre
    const surgeFactor = includeSurgePricing ? await MatchingAlgorithmService.calculateSurgePricing(region) : 1.0;
    const prixData = calculerPrixAvecSurge(tarif, distanceMetres, dureeSecondes, surgeFactor);

    return {
      region,
      distanceMetres,
      dureeSecondes,
      prixCentimes: prixData.prixFinalCentimes,
      prixBaseCentimes: prixData.prixBaseCentimes,
      surgeFactor: prixData.surgeFactor,
      devise: "EUR" as const,
      tarif,
      trace,
      source,
    };
  }

  static async lister() {
    const lignes = await db.tarifDrive.findMany();
    return REGIONS.map((region) => {
      const ligne = lignes.find((l) => l.region === region);
      return ligne
        ? { region, actif: ligne.actif, ...tarifDe(ligne), updatedAt: ligne.updatedAt }
        : { region, actif: false, priseEnChargeCentimes: 0, parKmCentimes: 0, parMinuteCentimes: 0, minimumCentimes: 0, updatedAt: null };
    });
  }

  /** L'équipe fixe le tarif d'une région. Renvoie l'ancien pour le journal. */
  static async definir(region: Region, valeurs: Tarif & { actif: boolean }) {
    const avant = await db.tarifDrive.findUnique({ where: { region } });
    const apres = await db.tarifDrive.upsert({
      where: { region },
      create: { region, ...valeurs },
      update: valeurs,
    });
    return { avant, apres };
  }
}
