import crypto from "crypto";
import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";
import { logger } from "../config/logger";

/**
 * Les webhooks : prévenir un système extérieur de ce qui se passe ici.
 *
 * Trois choses manquaient, et ensemble elles rendaient la fonction inutilisable.
 * La page proposait dix événements dont neuf n'existaient pas côté serveur, et
 * personne ne refusait l'abonnement : on s'inscrivait à `payment.processed` et
 * on attendait un envoi qui ne viendrait jamais. Le secret, lui, n'était rendu
 * qu'une fois et l'écran le jetait — sans lui, aucune signature n'est
 * vérifiable. Et un envoi raté était perdu : le destinataire qui redémarrait
 * manquait la commande, définitivement.
 *
 * La liste ci-dessous est désormais la seule qui existe : la page la lit, la
 * création la fait respecter, et chaque événement qui y figure est réellement
 * émis quelque part dans le code.
 */

// Nombre d'envois définitivement abandonnés avant de couper l'abonnement.
const SEUIL_ECHECS = 5;
const DELAI_MS = 5000;

/**
 * Les relances, en millisecondes après l'échec précédent : une minute, cinq,
 * puis trente. Court d'abord — un destinataire qui redémarre est de retour en
 * quelques secondes —, puis espacé, pour ne pas marteler un serveur en panne.
 *
 * Réglable par `WEBHOOK_RELANCES_MS` (des millisecondes séparées par des
 * virgules) : les vérifications s'en servent pour ne pas attendre une demi-heure.
 */
const RELANCES_MS = (process.env.WEBHOOK_RELANCES_MS || "60000,300000,1800000")
  .split(",")
  .map((valeur) => Number(valeur.trim()))
  .filter((valeur) => Number.isFinite(valeur) && valeur >= 0);

export interface EvenementWebhook {
  nom: string;
  description: string;
}

export const EVENEMENTS_WEBHOOK: EvenementWebhook[] = [
  { nom: "order.created", description: "Une commande vient d'être passée" },
  { nom: "order.status_changed", description: "Une commande change d'état (acceptée, prête, terminée…)" },
  { nom: "merchant.suspended", description: "Un compte commerçant est suspendu" },
  { nom: "merchant.closed", description: "Un compte commerçant est fermé" },
  { nom: "ticket.created", description: "Un commerçant ouvre un ticket de support" },
  { nom: "ticket.message", description: "Un message est ajouté à un ticket" },
];

export const EVENEMENTS_DISPONIBLES = EVENEMENTS_WEBHOOK.map((e) => e.nom);

/** L'événement d'essai : envoyé à la demande, jamais par le métier. */
export const EVENEMENT_ESSAI = "webhook.test";

export class WebhookService {
  static async list(limit = 20, offset = 0) {
    const [abonnements, total] = await Promise.all([
      db.webhook.findMany({ skip: offset, take: limit, orderBy: { createdAt: "desc" } }),
      db.webhook.count(),
    ]);

    return {
      webhooks: abonnements.map((w) => ({
        id: w.id,
        url: w.url,
        events: w.events,
        status: w.status,
        lastTriggered: w.lastTriggered,
        createdAt: w.createdAt,
        retryCount: w.retryCount,
      })),
      availableEvents: EVENEMENTS_WEBHOOK,
      pagination: { total, limit, offset },
    };
  }

  static async create(params: { url: string; events: string[]; createdById?: string }) {
    // Un événement inconnu était accepté sans un mot : l'abonnement paraissait
    // en place et n'envoyait rien. Il est maintenant refusé, en nommant ce qui
    // ne va pas.
    const inconnus = params.events.filter((e) => !EVENEMENTS_DISPONIBLES.includes(e));

    if (inconnus.length > 0) {
      throw new ApiError(
        400,
        `Événement inconnu : ${inconnus.join(", ")}. Les événements disponibles sont : ${EVENEMENTS_DISPONIBLES.join(", ")}.`,
        "UNKNOWN_EVENT"
      );
    }

    const existant = await db.webhook.findFirst({ where: { url: params.url } });

    if (existant) {
      throw new ApiError(400, "Un webhook existe déjà pour cette URL", "DUPLICATE_URL");
    }

    const abonnement = await db.webhook.create({
      data: {
        url: params.url,
        events: params.events,
        secret: crypto.randomBytes(32).toString("hex"),
        createdById: params.createdById,
      },
    });

    logger.info("Webhook created", { id: abonnement.id, url: params.url });
    return abonnement;
  }

  static async remove(id: string) {
    const abonnement = await db.webhook.findUnique({ where: { id } });

    if (!abonnement) {
      throw new ApiError(404, "Webhook introuvable", "NOT_FOUND");
    }

    await db.webhook.delete({ where: { id } });
    logger.info("Webhook deleted", { id });
  }

  /**
   * Remet un abonnement en marche, ou le met en pause.
   *
   * Un abonnement tombé en `FAILED` après cinq abandons n'avait aucun moyen de
   * repartir : il fallait le supprimer et le recréer, donc changer de secret
   * chez le destinataire. Réactiver remet le compteur à zéro.
   */
  static async setStatus(id: string, status: "ACTIVE" | "INACTIVE") {
    const abonnement = await db.webhook.findUnique({ where: { id } });

    if (!abonnement) {
      throw new ApiError(404, "Webhook introuvable", "NOT_FOUND");
    }

    return db.webhook.update({
      where: { id },
      data: { status, ...(status === "ACTIVE" && { retryCount: 0 }) },
    });
  }

  // Envoie l'événement à tous les abonnements concernés.
  // Volontairement sans await côté appelant : un destinataire lent ne doit pas
  // ralentir la requête métier qui a déclenché l'événement.
  static async emit(event: string, payload: Record<string, unknown>) {
    const abonnements = await db.webhook.findMany({
      where: { status: "ACTIVE", events: { has: event } },
    });

    await Promise.all(abonnements.map((a) => this.premierEnvoi(a, event, payload)));
    return abonnements.length;
  }

  /**
   * Envoi d'essai, déclenché depuis l'écran.
   *
   * Sans lui, la seule façon de savoir si son destinataire répond correctement
   * était d'attendre une vraie commande — et de la manquer.
   */
  static async essayer(id: string) {
    const abonnement = await db.webhook.findUnique({ where: { id } });

    if (!abonnement) {
      throw new ApiError(404, "Webhook introuvable", "NOT_FOUND");
    }

    const envoi = await this.premierEnvoi(abonnement, EVENEMENT_ESSAI, {
      message: "Ceci est un envoi d'essai : aucun événement réel ne s'est produit.",
    });

    return envoi;
  }

  private static async premierEnvoi(
    abonnement: { id: string; url: string; secret: string },
    event: string,
    payload: Record<string, unknown>
  ) {
    const envoi = await db.webhookDelivery.create({
      data: { webhookId: abonnement.id, event, payload: payload as any, attempt: 0 },
    });

    return this.deliver(abonnement, envoi);
  }

  /**
   * Une tentative, et une seule. Ce qu'elle décide de la suite tient dans
   * `nextAttemptAt` : rempli, une relance est due ; vide, c'est terminé.
   */
  private static async deliver(
    abonnement: { id: string; url: string; secret: string },
    envoi: { id: string; event: string; payload: unknown; attempt: number }
  ) {
    const tentative = envoi.attempt + 1;

    const corps = JSON.stringify({
      id: envoi.id,
      event: envoi.event,
      sentAt: new Date().toISOString(),
      attempt: tentative,
      data: envoi.payload,
    });

    const signature = crypto.createHmac("sha256", abonnement.secret).update(corps).digest("hex");

    let statusCode: number | null = null;
    let success = false;
    let error: string | null = null;

    try {
      const controleur = new AbortController();
      const minuterie = setTimeout(() => controleur.abort(), DELAI_MS);

      const reponse = await fetch(abonnement.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Event": envoi.event,
          "X-Webhook-Signature": signature,
          // Le même identifiant à chaque relance : c'est ce qui permet au
          // destinataire de reconnaître un envoi déjà traité plutôt que de
          // compter deux fois la même commande.
          "X-Webhook-Id": envoi.id,
          "X-Webhook-Attempt": String(tentative),
        },
        body: corps,
        signal: controleur.signal,
      });

      clearTimeout(minuterie);
      statusCode = reponse.status;
      success = reponse.ok;

      if (!success) {
        error = `Réponse ${reponse.status}`;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Envoi impossible";
    }

    const relance = success ? null : RELANCES_MS[tentative - 1];
    const abandonne = !success && relance === undefined;

    await db.webhookDelivery.update({
      where: { id: envoi.id },
      data: {
        attempt: tentative,
        statusCode,
        success,
        error,
        nextAttemptAt: relance == null ? null : new Date(Date.now() + relance),
        abandonedAt: abandonne ? new Date() : null,
      },
    });

    // Le compteur de l'abonnement ne bouge qu'au verdict : un envoi encore en
    // cours de relance n'est pas un échec, et le compter en ferait couper
    // l'abonnement bien avant d'avoir épuisé ses chances.
    if (success || abandonne) {
      const abonnementLu = await db.webhook.findUnique({
        where: { id: abonnement.id },
        select: { retryCount: true },
      });

      const echecs = success ? 0 : (abonnementLu?.retryCount ?? 0) + 1;

      await db.webhook.update({
        where: { id: abonnement.id },
        data: {
          lastTriggered: new Date(),
          retryCount: echecs,
          ...(echecs >= SEUIL_ECHECS && { status: "FAILED" }),
        },
      });
    }

    if (!success) {
      logger.warn("Webhook delivery failed", {
        id: abonnement.id,
        envoi: envoi.id,
        event: envoi.event,
        tentative,
        error,
        relanceDans: relance ?? "aucune",
      });
    }

    return { success, statusCode, error, attempt: tentative, deliveryId: envoi.id };
  }

  /**
   * Rejoue les envois dont la relance est due. Appelé par le balayage.
   *
   * Rend le nombre d'envois repris, pour que le journal n'écrive que lorsqu'il
   * s'est passé quelque chose.
   */
  static async relancerLesEnvoisDus(limite = 50) {
    const dus = await db.webhookDelivery.findMany({
      where: { nextAttemptAt: { lte: new Date() } },
      orderBy: { nextAttemptAt: "asc" },
      take: limite,
      include: { webhook: true },
    });

    for (const envoi of dus) {
      // Un abonnement mis en pause ou coupé entre-temps ne doit plus rien
      // recevoir : l'envoi en attente est abandonné plutôt que forcé.
      if (envoi.webhook.status !== "ACTIVE") {
        await db.webhookDelivery.update({
          where: { id: envoi.id },
          data: { nextAttemptAt: null, abandonedAt: new Date() },
        });
        continue;
      }

      await this.deliver(envoi.webhook, envoi);
    }

    return dus.length;
  }

  static async deliveries(webhookId: string, limit = 20) {
    return db.webhookDelivery.findMany({
      where: { webhookId },
      take: limit,
      orderBy: { createdAt: "desc" },
    });
  }
}

// Déclenche un événement sans bloquer l'appelant ni propager ses erreurs.
export function emitWebhook(event: string, payload: Record<string, unknown>) {
  WebhookService.emit(event, payload).catch((err) =>
    logger.error("Webhook emit failed", { event, error: err instanceof Error ? err.message : err })
  );
}
