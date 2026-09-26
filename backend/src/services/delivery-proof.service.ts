import { randomInt } from "node:crypto";

import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";
import { logger } from "../config/logger";

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

export class DeliveryProofService {
  /**
   * Vérifie la preuve fournie par le livreur et l'enregistre.
   *
   * Lève si elle manque, si le code est faux, ou si la photo n'est pas un lien.
   * Rend le type de preuve retenu.
   */
  static async verifier(
    deliveryId: string,
    preuve: { code?: string; photoUrl?: string; note?: string }
  ): Promise<TypePreuve> {
    const course = await db.orderDelivery.findUnique({
      where: { id: deliveryId },
      select: { id: true, deliveryCode: true, codeAttempts: true, customerWaitStartedAt: true },
    });

    if (!course) {
      throw new ApiError(404, "Course introuvable", "DELIVERY_NOT_FOUND");
    }

    const bloque = course.codeAttempts >= ESSAIS_MAX;
    const code = preuve.code?.trim();
    const photo = preuve.photoUrl?.trim();

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

      // Le dépôt se photographie quand le client n'est pas venu, pas avant.
      exigerAttenteTerminee(course);

      await db.orderDelivery.update({
        where: { id: deliveryId },
        data: {
          proofType: "PHOTO",
          proofPhoto: photo,
          proofNote: preuve.note?.trim() || null,
          proofAt: new Date(),
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
      photo: course.proofPhoto,
      prouveeLe: course.proofAt,
      // L'attente du client injoignable : l'heure du serveur fait foi, le
      // téléphone s'en sert pour son compte à rebours.
      attenteDebutLe: course.customerWaitStartedAt ?? null,
      attenteFinLe: finAttente({ customerWaitStartedAt: course.customerWaitStartedAt ?? null }),
      maintenant: new Date(),
    };
  }
}
