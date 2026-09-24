import webpush, { PushSubscription } from "web-push";
import { Prisma } from "@prisma/client";

import { db } from "./db";
import { logger } from "../config/logger";
import { EmailService } from "./email.service";

/**
 * Notifications multicanales : e-mail, SMS, push navigateur.
 *
 * Jusqu'ici tout passait par la cloche de l'application et la connexion temps
 * réel : un livreur dont l'onglet dormait en arrière-plan ne voyait pas sa
 * course, et un client qui avait fermé la page ne savait pas que son repas
 * arrivait.
 *
 * Chaque canal est facultatif et s'active par sa configuration :
 *   - SMS  : TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM
 *   - Push : VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (et VAPID_SUBJECT)
 *   - E-mail : la configuration SMTP existante
 * Un canal non configuré est ignoré sans erreur : l'envoi d'une notification
 * ne doit jamais faire échouer l'action qui l'a déclenchée.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || `mailto:${process.env.EMAIL_FROM || "contact@example.com"}`;

let pushPret = false;
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
    pushPret = true;
  } catch (err) {
    logger.error("Clés VAPID invalides : notifications push désactivées", {
      error: err instanceof Error ? err.message : err,
    });
  }
}

const smsPret = Boolean(
  process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM
);

export interface MessagePush {
  title: string;
  body: string;
  /** Page ouverte au clic sur la notification. */
  url?: string;
  /** Deux notifications de même tag se remplacent au lieu de s'empiler. */
  tag?: string;
}

/**
 * Numéro au format international (E.164), attendu par les fournisseurs SMS.
 * Les numéros français saisis en « 06 12 34 56 78 » deviennent « +33612345678 ».
 */
export function numeroInternational(numero: string, indicatif = process.env.SMS_DEFAULT_COUNTRY_CODE || "33") {
  const chiffres = numero.replace(/[^\d+]/g, "");
  if (chiffres.startsWith("+")) return chiffres;
  if (chiffres.startsWith("00")) return `+${chiffres.slice(2)}`;
  if (chiffres.startsWith("0")) return `+${indicatif}${chiffres.slice(1)}`;
  return `+${indicatif}${chiffres}`;
}

/**
 * Lance un envoi sans l'attendre : une notification lente ou en échec ne doit
 * ni ralentir ni faire échouer l'action qui l'a déclenchée.
 */
export function enArrierePlan(envoi: Promise<unknown>) {
  envoi.catch((err) =>
    logger.warn("Notification non envoyée", { error: err instanceof Error ? err.message : err })
  );
}

export class Notifier {
  static get canaux() {
    return { push: pushPret, sms: smsPret, vapidPublicKey: VAPID_PUBLIC || null };
  }

  // -------------------------------------------------------------------------
  // Canaux bruts
  // -------------------------------------------------------------------------

  static async sms(numero: string | null | undefined, texte: string) {
    if (!smsPret || !numero) return false;

    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const corps = new URLSearchParams({
      To: numeroInternational(numero),
      From: process.env.TWILIO_FROM!,
      // Un SMS au-delà de 160 caractères est facturé en plusieurs parties.
      Body: texte.slice(0, 320),
    });

    try {
      const reponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: corps,
      });

      if (!reponse.ok) {
        logger.warn("SMS refusé par le fournisseur", { status: reponse.status, body: await reponse.text() });
        return false;
      }
      return true;
    } catch (err) {
      logger.warn("Envoi SMS impossible", { error: err instanceof Error ? err.message : err });
      return false;
    }
  }

  static async email(destinataire: string | null | undefined, sujet: string, texte: string, lien?: string) {
    if (!destinataire) return false;

    const bouton = lien
      ? `<p><a href="${lien}" style="display:inline-block;background:#ea580c;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Voir le suivi</a></p>`
      : "";

    try {
      await EmailService.sendEmail({
        to: destinataire,
        subject: sujet,
        text: lien ? `${texte}\n\n${lien}` : texte,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1f2937">
          <h2 style="color:#ea580c">${sujet}</h2><p>${texte}</p>${bouton}</div>`,
      });
      return true;
    } catch {
      // EmailService journalise déjà l'échec.
      return false;
    }
  }

  /** Push vers un abonnement ; renvoie false si l'abonnement n'est plus valable. */
  static async push(abonnement: unknown, message: MessagePush): Promise<boolean | "expire"> {
    if (!pushPret || !abonnement) return false;

    try {
      await webpush.sendNotification(abonnement as PushSubscription, JSON.stringify(message), { TTL: 60 });
      return true;
    } catch (err: any) {
      // 404/410 : le navigateur a révoqué l'abonnement.
      if (err?.statusCode === 404 || err?.statusCode === 410) return "expire";
      logger.warn("Notification push impossible", { status: err?.statusCode, error: err?.message });
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Destinataires
  // -------------------------------------------------------------------------

  /** Pousse une notification au navigateur du livreur, s'il s'est abonné. */
  static async pushLivreur(driverId: string, message: MessagePush) {
    const livreur = await db.driver.findUnique({
      where: { id: driverId },
      select: { pushSubscription: true },
    });
    if (!livreur?.pushSubscription) return false;

    const resultat = await this.push(livreur.pushSubscription, message);
    if (resultat === "expire") {
      await db.driver
        .update({ where: { id: driverId }, data: { pushSubscription: Prisma.DbNull } })
        .catch(() => {});
      return false;
    }
    return resultat;
  }

  /**
   * Prévient le client d'une étape de sa livraison, par e-mail et SMS.
   *
   * Seules trois étapes méritent un message hors application : un livreur a
   * pris la commande, elle est en route (avec le code de remise), elle est
   * livrée. Le reste se lit sur la page de suivi.
   */
  static async etapeLivraisonClient(orderId: string, etape: "ACCEPTED" | "PICKED_UP" | "DELIVERED") {
    const commande = await db.order.findUnique({
      where: { id: orderId },
      select: {
        customerEmail: true,
        customerPhone: true,
        customerName: true,
        store: { select: { name: true } },
        delivery: { select: { deliveryCode: true, driver: { select: { name: true } } } },
      },
    });
    if (!commande) return;

    const boutique = commande.store?.name || "votre commerce";
    const livreur = commande.delivery?.driver?.name?.split(" ")[0] || "Votre livreur";
    const lien = `${process.env.SITE_URL || process.env.FRONTEND_URL || ""}/client/orders/${orderId}`;
    const code = commande.delivery?.deliveryCode;

    const messages = {
      ACCEPTED: {
        sujet: "Un livreur a pris votre commande",
        texte: `${livreur} va récupérer votre commande chez ${boutique}.`,
        sms: `${livreur} a pris votre commande chez ${boutique}. Suivi : ${lien}`,
      },
      PICKED_UP: {
        sujet: "Votre commande est en route",
        texte: `${livreur} a récupéré votre commande et arrive.${code ? ` Donnez-lui le code ${code} à la remise.` : ""}`,
        sms: `Votre commande ${boutique} est en route.${code ? ` Code de remise : ${code}.` : ""} Suivi : ${lien}`,
      },
      DELIVERED: {
        sujet: "Commande livrée",
        texte: `Votre commande ${boutique} a été livrée. Bon appétit !`,
        sms: null as string | null,
      },
    }[etape];

    await Promise.all([
      this.email(commande.customerEmail, messages.sujet, messages.texte, lien),
      messages.sms ? this.sms(commande.customerPhone, messages.sms) : Promise.resolve(false),
    ]);
  }

  /**
   * Le livreur est à moins de 300 m : le client peut descendre.
   *
   * Dans l'application (cloche et suivi en direct) et hors d'elle (courriel,
   * SMS) : c'est le seul message dont l'intérêt tient en une minute.
   */
  static async livreurProcheClient(orderId: string) {
    const commande = await db.order.findUnique({
      where: { id: orderId },
      select: {
        customerEmail: true,
        customerPhone: true,
        delivery: { select: { deliveryCode: true, driver: { select: { name: true } } } },
      },
    });
    if (!commande) return;

    const livreur = commande.delivery?.driver?.name?.split(" ")[0] || "Votre livreur";
    const code = commande.delivery?.deliveryCode;
    const lien = `${process.env.SITE_URL || process.env.FRONTEND_URL || ""}/client/orders/${orderId}`;
    const titre = "Votre livreur est bientôt là";
    const texte = `${livreur} arrive dans un instant : vous pouvez descendre devant la porte.${
      code ? ` Préparez votre code de remise : ${code}.` : ""
    }`;

    if (commande.customerEmail) {
      await db.notification.create({
        data: {
          type: "DRIVER_NEARBY",
          title: titre,
          message: texte,
          recipientEmail: commande.customerEmail,
          link: `/client/orders/${orderId}`,
          relatedOrderId: orderId,
        },
      });

      const { emitNotification } = await import("../config/socket");
      emitNotification(commande.customerEmail, {
        type: "driver_nearby",
        orderId,
        title: titre,
        message: texte,
        timestamp: new Date().toISOString(),
      });
    }

    await Promise.all([
      this.email(commande.customerEmail, titre, texte, lien),
      this.sms(commande.customerPhone, `${texte} Suivi : ${lien}`),
    ]);
  }
}
