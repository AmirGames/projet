import crypto from "crypto";
import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";
import { logger } from "../config/logger";

// Nombre d'échecs consécutifs avant de considérer un abonnement comme défaillant.
const SEUIL_ECHECS = 5;
const DELAI_MS = 5000;

export const EVENEMENTS_DISPONIBLES = [
  "order.created",
  "order.status_changed",
  "merchant.suspended",
  "merchant.closed",
  "ticket.created",
  "ticket.message",
] as const;

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
      pagination: { total, limit, offset },
    };
  }

  static async create(params: { url: string; events: string[]; createdById?: string }) {
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

    await Promise.all(abonnements.map((a) => this.deliver(a, event, payload)));
    return abonnements.length;
  }

  private static async deliver(
    abonnement: { id: string; url: string; secret: string; retryCount: number },
    event: string,
    payload: Record<string, unknown>
  ) {
    const corps = JSON.stringify({ event, sentAt: new Date().toISOString(), data: payload });
    const signature = crypto
      .createHmac("sha256", abonnement.secret)
      .update(corps)
      .digest("hex");

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
          "X-Webhook-Event": event,
          "X-Webhook-Signature": signature,
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

    await db.webhookDelivery.create({
      data: { webhookId: abonnement.id, event, payload: payload as any, statusCode, success, error },
    });

    const echecs = success ? 0 : abonnement.retryCount + 1;

    await db.webhook.update({
      where: { id: abonnement.id },
      data: {
        lastTriggered: new Date(),
        retryCount: echecs,
        ...(echecs >= SEUIL_ECHECS && { status: "FAILED" }),
      },
    });

    if (!success) {
      logger.warn("Webhook delivery failed", { id: abonnement.id, event, error });
    }
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
