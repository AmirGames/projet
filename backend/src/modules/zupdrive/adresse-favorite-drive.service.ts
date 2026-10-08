import { db } from "../../services/db";

/**
 * Les adresses « Domicile » et « Travail » d'un passager ZupDrive.
 *
 * Toujours celles du compte connecté : le type est la seule clé fournie par
 * le client, l'identité vient du jeton. Une seule adresse par type (la
 * contrainte unique de la base), remplacée à chaque enregistrement.
 */
export const TYPES_ADRESSE_FAVORITE = ["DOMICILE", "TRAVAIL"] as const;
export type TypeAdresseFavorite = (typeof TYPES_ADRESSE_FAVORITE)[number];

export interface AdresseFavorite {
  adresse: string;
  latitude: number;
  longitude: number;
  codePostal: string;
}

const choix = { type: true, adresse: true, latitude: true, longitude: true, codePostal: true } as const;

export class AdresseFavoriteDriveService {
  static lister(userId: string) {
    return db.adresseFavoriteDrive.findMany({ where: { userId }, select: choix, orderBy: { type: "asc" } });
  }

  /** Crée ou remplace l'adresse du type ; rejouer la même requête donne le même résultat. */
  static enregistrer(userId: string, type: TypeAdresseFavorite, adresse: AdresseFavorite) {
    return db.adresseFavoriteDrive.upsert({
      where: { userId_type: { userId, type } },
      create: { userId, type, ...adresse },
      update: adresse,
      select: choix,
    });
  }

  /** Sans effet (et sans erreur) quand l'adresse n'existe pas : la suppression est idempotente. */
  static async supprimer(userId: string, type: TypeAdresseFavorite) {
    await db.adresseFavoriteDrive.deleteMany({ where: { userId, type } });
  }
}
