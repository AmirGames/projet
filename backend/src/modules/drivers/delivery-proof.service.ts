import { randomInt } from "node:crypto";

import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { logger } from "../../config/logger";
import { cheminRelatif, presenter, verifierDepot } from "../files/fichiers-prives.service";
import { z } from "zod";
import { distanceKm, estUnPoint, Point } from "../../utils/geo";

/**
 * La preuve de la remise.
 *
 * Une course passait à `DELIVERED` sur simple clic du livreur. Rien ne
 * distinguait un repas remis en main propre d'un repas jamais sorti du sac : ni
 * code, ni photo, ni signature. Le client qui n'avait rien reçu n'avait que sa
 * parole contre celle du livreur, et la plateforme aucun moyen de trancher.
 *
 * Deux preuves, et il en faut une :
 *
 *   - **le code** : quatre chiffres remis au client avec sa commande, qu'il
 *     donne à la porte. C'est la preuve normale ;
 *   - **la photo** : le dépôt photographié quand le client est absent. C'est le
 *     repli, et il est tracé comme tel.
 *
 * Le code ne se devine pas à la force : au-delà de cinq essais ratés il se
 * bloque, et seule la photo reste. Sans cette limite, dix mille tentatives
 * suffiraient à clore n'importe quelle course.
 */

export const ESSAIS_MAX = 5;

/** Ce que le livreur attend un client injoignable avant de déposer la commande. */
export const ATTENTE_CLIENT_MS = 6 * 60 * 1000;

/** La fin de l'attente du client, si elle a commencé. */
export function finAttente(course: { customerWaitStartedAt: Date | null }) {
  return course.customerWaitStartedAt
    ? new Date(course.customerWaitStartedAt.getTime() + ATTENTE_CLIENT_MS)
    : null;
}

/**
 * La photo du dépôt n'est permise qu'au terme de l'attente.
 *
 * C'est le serveur qui compte, pas le téléphone : une horloge de téléphone se
 * règle à la main.
 */
export function exigerAttenteTerminee(course: { customerWaitStartedAt: Date | null }, maintenant = new Date()) {
  const fin = finAttente(course);
  if (!fin) {
    throw new ApiError(
      409,
      "Le client ne répond pas ? Appelez-le, puis lancez l'attente de 6 minutes avant de déposer la commande.",
      "WAIT_NOT_STARTED"
    );
  }
  const reste = fin.getTime() - maintenant.getTime();
  if (reste > 0) {
    const minutes = Math.floor(reste / 60000);
    const secondes = Math.ceil((reste % 60000) / 1000);
    throw new ApiError(
      409,
      `Le client peut encore descendre : attendez ${minutes ? `${minutes} min ` : ""}${secondes} s avant de déposer la commande.`,
      "WAIT_NOT_OVER"
    );
  }
}

/**
 * À cette distance de l'adresse, le livreur est chez le client. Plus large que
 * les 150 m de l'application : en ville, le GPS dérive de plusieurs dizaines
 * de mètres au pied d'un immeuble.
 */
export const RAYON_CHEZ_CLIENT_KM = 0.25;

/**
 * L'attente du client injoignable ne se lance que devant chez lui.
 *
 * C'est elle qui ouvre le dépôt en lieu sûr : lancée de n'importe où, elle
 * laissait un livreur parti avec la commande la « déposer » en photo au bout
 * de six minutes, être payé, et faire taire la surveillance. Le contrôle se
 * fait ici, au lancement, parce que l'attente ne part qu'en ligne : le dépôt,
 * lui, peut arriver bien plus tard depuis la file hors réseau du téléphone.
 *
 * `position` est la dernière position reçue, encore fraîche, ou null.
 * Une adresse non située ne peut pas être vérifiée : elle passe.
 */
export function exigerPresenceChezClient(
  position: Point | null,
  course: { deliveryLat: number | null; deliveryLng: number | null }
) {
  const adresse = { latitude: course.deliveryLat, longitude: course.deliveryLng };
  if (!estUnPoint(adresse)) return;

  if (!position) {
    throw new ApiError(
      409,
      "Votre position n'arrive pas au serveur : activez la localisation pour lancer l'attente. Le client peut aussi vous donner son code ; sinon, écrivez au support.",
      "POSITION_UNKNOWN"
    );
  }

  const distance = distanceKm(position, adresse);
  if (distance > RAYON_CHEZ_CLIENT_KM) {
    throw new ApiError(
      409,
      `Vous êtes à ${distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1).replace(".", ",")} km`} de l'adresse du client : l'attente se lance devant chez lui.`,
      "NOT_AT_CUSTOMER"
    );
  }
}

/**
 * Pendant l'attente, le livreur reste devant chez le client : au-delà de cette
 * distance, il est reparti (marge pour le GPS au pied d'un immeuble).
 */
export const RAYON_ATTENTE_CLIENT_KM = 0.5;

/** L'attente est en cours et cette position est loin de l'adresse du client. */
export function quitteLAdressePendantLAttente(
  position: Point,
  course: {
    status: string;
    customerWaitStartedAt: Date | null;
    deliveryLat: number | null;
    deliveryLng: number | null;
  }
) {
  const adresse = { latitude: course.deliveryLat, longitude: course.deliveryLng };
  return (
    course.status === "PICKED_UP" &&
    Boolean(course.customerWaitStartedAt) &&
    estUnPoint(adresse) &&
    distanceKm(position, adresse) > RAYON_ATTENTE_CLIENT_KM
  );
}

/**
 * Le dépôt en photo est refusé au livreur qui a quitté l'adresse pendant
 * l'attente : l'attente lancée à la porte ne vaut plus présence. Il lui reste
 * le code du client, ou le support.
 */
export function exigerResteChezClient(course: { customerWaitLeftAt: Date | null }) {
  if (course.customerWaitLeftAt) {
    throw new ApiError(
      409,
      "Vous avez quitté l'adresse du client pendant l'attente : le dépôt en photo n'est plus possible. Remettez la commande contre le code du client, ou écrivez au support.",
      "LEFT_DURING_WAIT"
    );
  }
}

/**
 * La position du téléphone quand la photo du dépôt a été prise, envoyée avec
 * le dépôt (qui peut partir bien plus tard, de la file hors réseau).
 */
export const schemaPositionDepot = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  /** Précision annoncée par le téléphone, en mètres. */
  precision: z.number().min(0).max(100000).nullish(),
  /** Quand elle a été relevée (heure du téléphone). */
  releveeLe: z.string().datetime({ offset: true }).nullish(),
});
export type PositionDepot = z.infer<typeof schemaPositionDepot>;

/** Lit la position jointe au dépôt ; absente, rien. Mal formée : 400. */
export function lirePositionDepot(brut: unknown): PositionDepot | null {
  if (brut == null) return null;
  const lu = schemaPositionDepot.safeParse(brut);
  if (!lu.success) throw new ApiError(400, "Position du dépôt illisible", "INVALID_PROOF_POSITION");
  return lu.data;
}

/** Une position relevée plus longtemps avant la photo ne dit plus où elle a été prise. */
const POSITION_DEPOT_VALABLE_MS = 15 * 60 * 1000;

/**
 * La photo du dépôt a-t-elle été prise loin de l'adresse du client ?
 *
 * Un indice : la position se falsifie, et un GPS dérive au pied d'un
 * immeuble. La précision annoncée par le téléphone s'ajoute à la marge
 * (jusqu'à 200 m). Rend la distance quand elle est suspecte, sinon null —
 * position absente, trop ancienne, ou adresse non située compris.
 */
export function photoPriseLoinDuClient(course: {
  deliveryLat: number | null;
  deliveryLng: number | null;
  proofLat: number | null;
  proofLng: number | null;
  proofAccuracy: number | null;
  proofPositionAt: Date | null;
  proofAt: Date | null;
  /** L'heure réelle de la remise (étape faite hors réseau comprise). */
  deliveryTime?: Date | null;
}): number | null {
  const adresse = { latitude: course.deliveryLat, longitude: course.deliveryLng };
  const prise = { latitude: course.proofLat, longitude: course.proofLng };
  if (!estUnPoint(adresse) || !estUnPoint(prise)) return null;
  const remise = course.deliveryTime ?? course.proofAt;
  if (course.proofPositionAt && remise && remise.getTime() - course.proofPositionAt.getTime() > POSITION_DEPOT_VALABLE_MS) {
    return null;
  }
  const marge = RAYON_ATTENTE_CLIENT_KM + Math.min((course.proofAccuracy ?? 0) / 1000, 0.2);
  const distance = distanceKm(prise, adresse);
  return distance > marge ? distance : null;
}

export const TYPES_PREUVE = ["CODE", "PHOTO"] as const;
export type TypePreuve = (typeof TYPES_PREUVE)[number];

/**
 * Un code à quatre chiffres, tiré au sort.
 *
 * `randomInt` plutôt que `Math.random` : un code de remise prévisible se
 * devine, et celui-ci est la seule chose qui prouve la livraison.
 */
export function genererCode() {
  return String(randomInt(0, 10000)).padStart(4, "0");
}

/**
 * Les colonnes de la position jointe au dépôt. Une heure de relevé dans le
 * futur (horloge du téléphone déréglée) n'est pas crue : l'heure de réception
 * la remplace.
 */
function positionDuDepot(position: PositionDepot | null | undefined, maintenant: Date) {
  if (!position) return {};
  const declaree = position.releveeLe ? new Date(position.releveeLe) : null;
  const releveeLe = declaree && declaree.getTime() <= maintenant.getTime() + 60_000 ? declaree : maintenant;
  return {
    proofLat: position.latitude,
    proofLng: position.longitude,
    proofAccuracy: position.precision ?? null,
    proofPositionAt: releveeLe,
  };
}

export class DeliveryProofService {
  /**
   * Vérifie la preuve fournie par le livreur et l'enregistre.
   *
   * Lève si elle manque, si le code est faux, ou si la photo n'est pas un lien.
   * Rend le type de preuve retenu.
   */
  static async verifier(
    deliveryId: string,
    preuve: { code?: string; photoUrl?: string; note?: string; position?: PositionDepot | null }
  ): Promise<TypePreuve> {
    const course = await db.orderDelivery.findUnique({
      where: { id: deliveryId },
      select: { id: true, deliveryCode: true, codeAttempts: true, customerWaitStartedAt: true, customerWaitLeftAt: true },
    });

    if (!course) {
      throw new ApiError(404, "Course introuvable", "DELIVERY_NOT_FOUND");
    }

    const bloque = course.codeAttempts >= ESSAIS_MAX;
    const code = preuve.code?.trim();
    let photo = preuve.photoUrl?.trim();

    // Une course d'avant le code n'en a pas : la photo est alors la seule
    // preuve possible, et l'exiger est plus juste que de laisser passer.
    if (code && course.deliveryCode) {
      if (bloque) {
        throw new ApiError(
          400,
          `Code bloqué après ${ESSAIS_MAX} essais : lancez l'attente du client, puis déposez la commande en lieu sûr`,
          "CODE_LOCKED"
        );
      }

      if (code !== course.deliveryCode) {
        const essais = course.codeAttempts + 1;

        await db.orderDelivery.update({
          where: { id: deliveryId },
          data: { codeAttempts: essais },
        });

        logger.warn("Delivery code rejected", { deliveryId, essais });

        const restants = ESSAIS_MAX - essais;

        throw new ApiError(
          400,
          restants > 0
            ? `Code incorrect — ${restants} essai${restants > 1 ? "s" : ""} restant${
                restants > 1 ? "s" : ""
              }`
            : `Code incorrect — code bloqué : lancez l'attente du client, puis déposez la commande en lieu sûr`,
          "WRONG_CODE"
        );
      }

      await db.orderDelivery.update({
        where: { id: deliveryId },
        data: {
          proofType: "CODE",
          proofNote: preuve.note?.trim() || null,
          proofAt: new Date(),
          codeAttempts: 0,
        },
      });

      return "CODE";
    }

    if (photo) {
      if (!/^https?:\/\//i.test(photo)) {
        throw new ApiError(400, "Donnez un lien vers la photo du dépôt", "INVALID_PHOTO");
      }

      // Une pièce du stockage privé ne se rattache à la course que si c'est
      // une photo de dépôt encore libre : sinon, pointer vers celle d'une autre
      // course, ou vers le permis d'un livreur, en ouvrirait la lecture au
      // client et au commerce de cette course.
      if (photo.includes("/api/files/") || photo.includes("/documents/file/")) {
        throw new ApiError(400, "Envoyez l'adresse rendue par l'envoi de la photo", "INVALID_PHOTO");
      }
      // Les uploads hébergés ailleurs reçoivent le même reçu ; le retirer
      // après vérification évite de conserver une autorisation temporaire.
      if (photo.includes("depotExp=") || photo.includes("depotSig=")) {
        const stockage = verifierDepot(photo, deliveryId);
        if (!stockage) throw new ApiError(400, "Cette photo ne correspond pas à un dépôt", "INVALID_PHOTO");
        // Le contrôle local ci-dessous doit encore pouvoir vérifier ce reçu.
        if (!stockage.includes("/uploads/")) photo = stockage;
      }
      if (photo.includes("/uploads/")) {
        const relatif = cheminRelatif(photo);
        const stockage = verifierDepot(photo, deliveryId);
        const dejaPrise =
          relatif?.startsWith("deliveries/") &&
          (await db.orderDelivery.findFirst({
            where: { id: { not: deliveryId }, proofPhoto: { endsWith: `/uploads/${relatif}` } },
            select: { id: true },
          }));
        if (!relatif || !relatif.startsWith("deliveries/") || dejaPrise || !stockage) {
          throw new ApiError(400, "Cette photo ne correspond pas à un dépôt", "INVALID_PHOTO");
        }
        photo = stockage;
      }

      const maintenant = new Date();
      // Le dépôt se photographie quand le client n'est pas venu, pas avant.
      exigerAttenteTerminee(course);
      // Et seulement par un livreur resté à la porte.
      exigerResteChezClient(course);

      await db.orderDelivery.update({
        where: { id: deliveryId },
        data: {
          proofType: "PHOTO",
          proofPhoto: photo,
          proofNote: preuve.note?.trim() || null,
          proofAt: maintenant,
          ...positionDuDepot(preuve.position, maintenant),
        },
      });

      logger.info("Delivery proved by photo", { deliveryId });

      return "PHOTO";
    }

    throw new ApiError(
      400,
      course.deliveryCode && !bloque
        ? "Demandez au client son code à quatre chiffres, ou photographiez le dépôt"
        : "Photographiez le dépôt pour clore la course",
      "PROOF_REQUIRED"
    );
  }

  /**
   * Ce que le livreur doit savoir avant de sonner : si un code est attendu, et
   * combien d'essais lui restent.
   */
  static etatDeLaPreuve(course: {
    deliveryCode: string | null;
    codeAttempts: number;
    proofType: string | null;
    proofPhoto: string | null;
    proofAt: Date | null;
    customerWaitStartedAt?: Date | null;
  }) {
    return {
      // Jamais le code lui-même : c'est le client qui le détient, et un livreur
      // qui le lit n'a plus rien à prouver.
      codeAttendu: !!course.deliveryCode && course.codeAttempts < ESSAIS_MAX,
      essaisRestants: course.deliveryCode
        ? Math.max(0, ESSAIS_MAX - course.codeAttempts)
        : 0,
      preuve: course.proofType,
      photo: presenter(course.proofPhoto),
      prouveeLe: course.proofAt,
      // L'attente du client injoignable : l'heure du serveur fait foi, le
      // téléphone s'en sert pour son compte à rebours.
      attenteDebutLe: course.customerWaitStartedAt ?? null,
      attenteFinLe: finAttente({ customerWaitStartedAt: course.customerWaitStartedAt ?? null }),
      maintenant: new Date(),
    };
  }
}
