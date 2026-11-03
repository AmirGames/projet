import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { dateCivileEnBruxelles, loadEnv, type Env } from "../../config/env";
import { calculerItineraire, type Point } from "./itineraire.service";
import { REGIONS, type Region } from "./chauffeur-onboarding.service";
import { MatchingAlgorithmService } from "./matching-algorithm.service";
import { adresseDansZonePiloteNamur } from "./zone-commune-namur";
export { adresseDansZonePiloteNamur, CODES_POSTAUX_PILOTE_NAMUR, estDansZonePiloteNamur } from "./zone-commune-namur";

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

/** En production, ne pas afficher de devis tant que le paiement carte du pilote n'est pas actif. */
export function exigerPaiementStripePourPilote(config: Pick<Env, "NODE_ENV" | "ENABLE_STRIPE" | "ZUPDRIVE_PAIEMENT_OBLIGATOIRE">) {
  if (config.NODE_ENV === "production" && (!config.ENABLE_STRIPE || !config.ZUPDRIVE_PAIEMENT_OBLIGATOIRE)) {
    throw new ApiError(503, "Les courses ZupDrive restent fermées en production tant que le paiement Stripe obligatoire n'est pas activé", "WALLONIE_PILOT_PAYMENT_NOT_READY");
  }
}

/** En production, aucune course wallonne avant confirmation de l'agrément SPW. */
export function exigerAgrementWalloniePourPilote(config: Pick<
  Env,
  "NODE_ENV" | "ZUPDRIVE_WALLONIE_AGREMENT_CONFIRME" | "ZUPDRIVE_WALLONIE_AGREMENT_REFERENCE" | "ZUPDRIVE_WALLONIE_AGREMENT_EXPIRES_AT"
>) {
  const reference = config.ZUPDRIVE_WALLONIE_AGREMENT_REFERENCE?.trim();
  const expiration = config.ZUPDRIVE_WALLONIE_AGREMENT_EXPIRES_AT;
  if (config.NODE_ENV === "production" && (
    !config.ZUPDRIVE_WALLONIE_AGREMENT_CONFIRME ||
    !reference ||
    reference.length < 3 ||
    !expiration ||
    expiration < dateCivileEnBruxelles()
  )) {
    throw new ApiError(503, "Les courses ZupDrive en Wallonie restent fermées jusqu'à confirmation documentée et valide de l'agrément d'intermédiation électronique", "WALLONIE_INTERMEDIATION_NOT_APPROVED");
  }
}

export interface Tarif {
  priseEnChargeCentimes: number;
  parKmCentimes: number;
  parMinuteCentimes: number;
  minimumCentimes: number;
}

/**
 * Tarif applicable aux courses réservées par intermédiation électronique à
 * Namur. L'article 12 §2 du règlement communal impose le prix/km maximal de
 * l'article 19 §2 AGW et le minimum de course de l'article 19 §3. La zone
 * Wallonie étant fermée à la commune de Namur pour le pilote, ces valeurs
 * s'appliquent à tout devis wallon de cette application.
 */
export const TARIF_PILOTE_NAMUR: Readonly<Tarif> = Object.freeze({
  priseEnChargeCentimes: 0,
  parKmCentimes: 190,
  parMinuteCentimes: 0,
  minimumCentimes: 820,
});

export function tarifPiloteNamurConforme(tarif: Partial<Tarif>): boolean {
  return Object.entries(TARIF_PILOTE_NAMUR).every(([cle, valeur]) => tarif[cle as keyof Tarif] === valeur);
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
  private static exigerAgrementWallonie() {
    const config = loadEnv();
    exigerAgrementWalloniePourPilote(config);
  }

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
    includeSurgePricing: boolean = true,
    nombrePassagers: number = 1
  ) {
    if (!Number.isInteger(nombrePassagers) || nombrePassagers < 1 || nombrePassagers > 6) {
      throw new ApiError(400, "Le nombre de passagers doit être compris entre 1 et 6", "INVALID_PASSENGER_COUNT");
    }
    const region = regionDuCodePostal(trajet.depart.codePostal);
    if (!region) {
      throw new ApiError(400, "ZupDrive n'est disponible qu'en Belgique pour le moment", "REGION_NOT_SERVED");
    }
    if (region === "WALLONIE") {
      const config = loadEnv();
      this.exigerAgrementWallonie();
      exigerPaiementStripePourPilote(config);
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
    if (region === "WALLONIE" && !tarifPiloteNamurConforme(ligne)) {
      throw new ApiError(503, "Le tarif Wallonie ne respecte pas encore le tarif réglementaire du pilote Namur", "NAMUR_REGULATED_TARIFF_NOT_CONFIGURED");
    }

    if (!adresseDansZonePiloteNamur(trajet.depart) || !adresseDansZonePiloteNamur(trajet.arrivee)) {
      throw new ApiError(
        400,
        "Pour le pilote, les adresses doivent avoir un code postal et des coordonnées situés dans la commune de Namur.",
        "PILOT_AREA_NOT_SERVED"
      );
    }

    const { distanceMetres, dureeSecondes, trace, source } = await calculerItineraire(trajet.depart, trajet.arrivee);
    if (distanceMetres < DISTANCE_MIN_METRES) {
      throw new ApiError(400, "Départ et destination sont trop proches", "RIDE_TOO_SHORT");
    }
    if (distanceMetres > DISTANCE_MAX_METRES) {
      throw new ApiError(400, "Ce trajet est trop long", "RIDE_TOO_LONG");
    }

    const categorie = nombrePassagers <= 4 ? "STANDARD" : "XL";
    const tarifXL = categorie === "XL"
      ? await db.tarifVehiculeDrive.findUnique({ where: { region_categorie: { region, categorie: "XL" } } })
      : null;
    if (categorie === "XL" && !tarifXL?.actif) {
      throw new ApiError(400, "La catégorie XL n'est pas encore disponible dans cette zone", "VEHICLE_CLASS_NOT_SERVED");
    }
    if (region === "WALLONIE" && categorie === "XL" && !tarifPiloteNamurConforme(tarifXL!)) {
      throw new ApiError(503, "Le tarif XL ne respecte pas encore le tarif réglementaire du pilote Namur", "NAMUR_REGULATED_TARIFF_NOT_CONFIGURED");
    }
    const tarif = categorie === "XL" ? tarifDe(tarifXL!) : tarifDe(ligne);

    // Le tarif communal de Namur est fixe pour une course réservée via une
    // plateforme : une majoration dynamique sortirait du barème applicable.
    const surgeFactor = region === "WALLONIE" || !includeSurgePricing
      ? 1.0
      : await MatchingAlgorithmService.calculateSurgePricing(region);
    const prixData = calculerPrixAvecSurge(tarif, distanceMetres, dureeSecondes, surgeFactor);

    return {
      region,
      distanceMetres,
      dureeSecondes,
      prixCentimes: prixData.prixFinalCentimes,
      nombrePassagers,
      categorieVehicule: categorie,
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
    const tarifsXL = await db.tarifVehiculeDrive.findMany();
    return REGIONS.flatMap((region) => {
      const ligne = lignes.find((l) => l.region === region);
      const xl = tarifsXL.find((l) => l.region === region && l.categorie === "XL");
      return [
        ligne
          ? { region, categorie: "STANDARD", actif: ligne.actif, ...tarifDe(ligne), updatedAt: ligne.updatedAt }
          : { region, categorie: "STANDARD", actif: false, priseEnChargeCentimes: 0, parKmCentimes: 0, parMinuteCentimes: 0, minimumCentimes: 0, updatedAt: null },
        xl
          ? { region, categorie: "XL", actif: xl.actif && !!ligne?.actif, ...tarifDe(xl), updatedAt: xl.updatedAt }
          : { region, categorie: "XL", actif: false, priseEnChargeCentimes: 0, parKmCentimes: 0, parMinuteCentimes: 0, minimumCentimes: 0, updatedAt: null },
      ];
    });
  }

  /** L'équipe fixe le tarif d'une région. Renvoie l'ancien pour le journal. */
  static async definir(region: Region, valeurs: Tarif & { actif: boolean }) {
    if (region === "WALLONIE" && valeurs.actif) this.exigerAgrementWallonie();
    if (valeurs.actif && valeurs.minimumCentimes < 1) {
      throw new ApiError(400, "Un tarif actif doit avoir un minimum supérieur à zéro", "INVALID_TARIFF");
    }
    this.exigerTarifNamur(region, valeurs);
    const avant = await db.tarifDrive.findUnique({ where: { region } });
    const apres = await db.tarifDrive.upsert({
      where: { region },
      create: { region, ...valeurs },
      update: valeurs,
    });
    return { avant, apres };
  }

  /** Configure le tarif XL indépendamment du tarif Standard de la région. */
  static async definirXL(region: Region, valeurs: Tarif & { actif: boolean }) {
    if (region === "WALLONIE" && valeurs.actif) this.exigerAgrementWallonie();
    if (valeurs.actif && valeurs.minimumCentimes < 1) {
      throw new ApiError(400, "Un tarif XL actif doit avoir un minimum supérieur à zéro", "INVALID_TARIFF");
    }
    this.exigerTarifNamur(region, valeurs);
    // Crée le parent de région inactif si l'équipe configure XL en premier.
    // Le code ne peut alors ouvrir la région par accident.
    await db.tarifDrive.upsert({
      where: { region },
      create: {
        region,
        priseEnChargeCentimes: 0,
        parKmCentimes: 0,
        parMinuteCentimes: 0,
        minimumCentimes: 0,
        actif: false,
      },
      update: {},
    });
    const avant = await db.tarifVehiculeDrive.findUnique({ where: { region_categorie: { region, categorie: "XL" } } });
    const apres = await db.tarifVehiculeDrive.upsert({
      where: { region_categorie: { region, categorie: "XL" } },
      create: { region, categorie: "XL", ...valeurs },
      update: valeurs,
    });
    return { avant, apres };
  }

  private static exigerTarifNamur(region: Region, valeurs: Tarif & { actif: boolean }) {
    if (region === "WALLONIE" && !tarifPiloteNamurConforme(valeurs)) {
      throw new ApiError(400, "Pour le pilote Namur, le tarif plateforme doit être fixé à 1,90 €/km, 8,20 € minimum, sans prise en charge ni attente", "NAMUR_REGULATED_TARIFF");
    }
  }
}
