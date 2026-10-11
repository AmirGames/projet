import type {
  Prisma,
  ProviderIntegration as ProviderIntegrationRow,
  WebhookDeliveryDrive as WebhookDeliveryRow,
  WebhookEndpoint as WebhookEndpointRow,
  WebhookEvent as WebhookEventRow,
} from "@prisma/client";
import { createHmac, randomBytes } from "node:crypto";
import { db } from "../../services/db";
import { logger } from "../../config/logger";
import { ApiError } from "../../middleware/api-error";
import { decrypt, encrypt } from "../privacy/crypto";
import { destinationWebhook, posterWebhook } from "../webhooks/webhook-destination";

/**
 * Webhooks & Integrations pour ZupDrive.
 * Webhooks outbound, retry logic, provider integrations.
 */

/** Contextes de chiffrement (AAD) : une valeur chiffrée pour un usage ne se déchiffre pas pour un autre. */
const CONTEXTE_SECRET_ENDPOINT = "zupdrive:webhook-endpoint:secret";
const CONTEXTE_CLE_FOURNISSEUR = "zupdrive:provider-integration:key";

export interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[]; // DRIVER_SUSPENDED, INFRACTION_REPORTED, DOCUMENT_EXPIRED, etc
  active: boolean;
  /** Secret HMAC : renvoyé une seule fois, à la création ; stocké chiffré, jamais relisible par l'API. */
  secret?: string;
  retryPolicy: {
    maxRetries: number;
    initialDelayMs: number;
    backoffMultiplier: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookEvent {
  id: string;
  eventType: string;
  resourceType: "DRIVER" | "DOCUMENT" | "INFRACTION" | "PAYMENT" | "ALERT";
  resourceId: string;
  data: Record<string, unknown>;
  timestamp: Date;
  delivered: boolean;
  deliveredAt?: Date;
  nextRetryAt?: Date;
  retryCount: number;
  lastError?: string;
  createdAt: Date;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventId: string;
  status: "PENDING" | "PROCESSING" | "SENT" | "FAILED" | "DELIVERY_FAILED";
  statusCode?: number;
  errorMessage?: string;
  attempt: number;
  maxAttempts: number;
  nextAttemptAt?: Date;
  lockedUntil?: Date;
  sentAt?: Date;
  failedAt?: Date;
  createdAt: Date;
}

export interface ProviderIntegration {
  id: string;
  provider: "SENDGRID" | "TWILIO" | "MAILGUN" | "AWS_SES" | "STRIPE" | "CUSTOM";
  type: "EMAIL" | "SMS" | "PAYMENT" | "CUSTOM";
  /** Les clés sont stockées chiffrées et ne ressortent jamais ; l'API dit seulement si elles existent. */
  apiKeyConfigured: boolean;
  webhookSigningKeyConfigured: boolean;
  active: boolean;
  config: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class ZupDriveWebhooksService {
  /**
   * Créer un endpoint de webhook.
   */
  static async createWebhookEndpoint(data: {
    url: string;
    events: string[];
    maxRetries?: number;
    initialDelayMs?: number;
    backoffMultiplier?: number;
  }): Promise<WebhookEndpoint> {
    // HTTPS public uniquement (refuse adresses privées, boucle locale, métadonnées cloud).
    await destinationWebhook(data.url);

    const secret = this.generateWebhookSecret();

    const endpoint = await db.webhookEndpoint.create({
      data: {
        url: data.url,
        events: JSON.stringify(data.events),
        secret: encrypt(secret, CONTEXTE_SECRET_ENDPOINT),
        active: true,
        retryPolicy: JSON.stringify({
          maxRetries: data.maxRetries || 5,
          initialDelayMs: data.initialDelayMs || 1000,
          backoffMultiplier: data.backoffMultiplier || 2,
        }),
      },
    });

    logger.info(`Webhook endpoint created: ${endpoint.id}`);
    // Seule occasion de lire le secret : à noter par l'équipe, il n'est plus relisible ensuite.
    return { ...this.formatWebhookEndpoint(endpoint), secret };
  }

  /**
   * Lister les endpoints de webhook.
   */
  static async listWebhookEndpoints(activeOnly = true): Promise<WebhookEndpoint[]> {
    const endpoints = await db.webhookEndpoint.findMany({
      where: activeOnly ? { active: true } : {},
      orderBy: { createdAt: "desc" },
    });

    return endpoints.map((e) => this.formatWebhookEndpoint(e));
  }

  /**
   * Mettre à jour un endpoint de webhook.
   */
  static async updateWebhookEndpoint(
    endpointId: string,
    data: Partial<{
      url: string;
      events: string[];
      active: boolean;
    }>
  ): Promise<void> {
    const existant = await db.webhookEndpoint.findUnique({ where: { id: endpointId }, select: { id: true } });
    if (!existant) throw new ApiError(404, "Endpoint introuvable", "WEBHOOK_ENDPOINT_NOT_FOUND");
    if (data.url) await destinationWebhook(data.url);

    const updateData: Prisma.WebhookEndpointUpdateInput = {};
    if (data.url) updateData.url = data.url;
    if (data.events) updateData.events = JSON.stringify(data.events);
    if (data.active !== undefined) updateData.active = data.active;

    await db.webhookEndpoint.update({
      where: { id: endpointId },
      data: updateData,
    });

    logger.info(`Webhook endpoint ${endpointId} updated`);
  }

  static async rotateWebhookSecret(endpointId: string): Promise<string> {
    const secret = this.generateWebhookSecret();
    const result = await db.webhookEndpoint.updateMany({
      where: { id: endpointId },
      data: { secret: encrypt(secret, CONTEXTE_SECRET_ENDPOINT) },
    });
    if (result.count !== 1) throw new ApiError(404, "Endpoint introuvable", "WEBHOOK_ENDPOINT_NOT_FOUND");
    return secret;
  }

  /**
   * Supprimer un endpoint de webhook.
   */
  static async deleteWebhookEndpoint(endpointId: string): Promise<void> {
    const existant = await db.webhookEndpoint.findUnique({ where: { id: endpointId }, select: { id: true } });
    if (!existant) throw new ApiError(404, "Endpoint introuvable", "WEBHOOK_ENDPOINT_NOT_FOUND");
    await db.webhookEndpoint.delete({
      where: { id: endpointId },
    });

    logger.info(`Webhook endpoint ${endpointId} deleted`);
  }

  /**
   * Déclencher un événement webhook.
   */
  static async triggerWebhookEvent(data: {
    eventType: string;
    resourceType: "DRIVER" | "DOCUMENT" | "INFRACTION" | "PAYMENT" | "ALERT";
    resourceId: string;
    data: Record<string, unknown>;
  }): Promise<WebhookEvent> {
    const event = await db.$transaction(async (tx) => {
      const event = await tx.webhookEvent.create({ data: {
        eventType: data.eventType,
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        data: JSON.stringify(data.data),
        timestamp: new Date(),
        delivered: false,
        retryCount: 0,
      } });

      // Déclencher les livraisons pour les endpoints intéressés
      const endpoints = await tx.webhookEndpoint.findMany({ where: { active: true } });

      const matchingEndpoints = endpoints.filter((e) => {
        const events = JSON.parse(e.events || "[]");
        return events.includes(data.eventType) || events.includes("*");
      });

      if (matchingEndpoints.length) await tx.webhookDeliveryDrive.createMany({
        data: matchingEndpoints.map((endpoint) => {
          let maxRetries = 5;
          try { maxRetries = Number(JSON.parse(endpoint.retryPolicy || "{}").maxRetries ?? 5); } catch { /* défaut borné */ }
          return { webhookId: endpoint.id, eventId: event.id, status: "PENDING", attempt: 0, maxAttempts: Math.min(11, Math.max(1, maxRetries + 1)), nextAttemptAt: new Date() };
        }),
        skipDuplicates: true,
      });
      return event;
    });

    logger.info(`Webhook event triggered: ${data.eventType}`);
    return this.formatWebhookEvent(event);
  }

  // Les envois restent désactivés par défaut jusqu'au rattachement des événements
  // aux transitions métier ZupDrive et à leur validation en production.
  static async traiterLesLivraisonsDues(limite = 20, maintenant = new Date()): Promise<number> {
    if (process.env.ZUPDRIVE_WEBHOOKS_ENABLED !== "true") return 0;
    const dus = await db.webhookDeliveryDrive.findMany({
      where: { OR: [{ status: "PENDING", nextAttemptAt: { lte: maintenant } }, { status: "PROCESSING", lockedUntil: { lt: maintenant } }] },
      orderBy: { nextAttemptAt: "asc" }, take: limite, include: { endpoint: true, event: true },
    });
    let envoyes = 0;
    for (const livraison of dus) {
      const claim = await db.webhookDeliveryDrive.updateMany({
        where: { id: livraison.id, status: livraison.status, attempt: livraison.attempt },
        data: { status: "PROCESSING", attempt: livraison.attempt + 1, lockedUntil: new Date(maintenant.getTime() + 60_000) },
      });
      if (claim.count !== 1) continue;
      const attempt = livraison.attempt + 1;
      let statusCode: number | null = null;
      let errorMessage: string | null = null;
      let retryable = true;
      try {
        if (!livraison.endpoint.active) throw Object.assign(new Error("Endpoint désactivé"), { permanent: true });
        // Résolution DNS, protocole et IP publique revérifiés à chaque tentative; posterWebhook épingle l'IP et ne suit pas les redirections.
        await destinationWebhook(livraison.endpoint.url);
        const secret = decrypt(livraison.endpoint.secret, CONTEXTE_SECRET_ENDPOINT).toString("utf8");
        const body = JSON.stringify({ id: livraison.id, event: livraison.event.eventType, version: "2026-10-11", sentAt: livraison.event.timestamp.toISOString(), attempt, data: { ...JSON.parse(livraison.event.data || "{}"), resourceType: livraison.event.resourceType, resourceId: livraison.event.resourceId } });
        const signature = createHmac("sha256", secret).update(body).digest("hex");
        const response = await posterWebhook(livraison.endpoint.url, { "Content-Type": "application/json", "X-Webhook-Event": livraison.event.eventType, "X-Webhook-Version": "2026-10-11", "X-Webhook-Id": livraison.id, "X-Webhook-Attempt": String(attempt), "X-Webhook-Signature": `sha256=${signature}` }, body);
        statusCode = response.status;
        if (response.ok) {
          await db.webhookDeliveryDrive.update({ where: { id: livraison.id }, data: { status: "SENT", statusCode, sentAt: new Date(), failedAt: null, errorMessage: null, lockedUntil: null } });
          await this.actualiserEvenement(livraison.eventId);
          envoyes++;
          continue;
        }
        retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        errorMessage = `Réponse HTTP ${response.status}`;
      } catch (error) {
        retryable = !(error && typeof error === "object" && ("permanent" in error || ("code" in error && error.code === "WEBHOOK_DESTINATION_FORBIDDEN")));
        errorMessage = error && typeof error === "object" && "code" in error && error.code === "WEBHOOK_DESTINATION_FORBIDDEN"
          ? "Destination webhook interdite"
          : "Échec réseau, DNS ou délai dépassé";
      }
      const terminal = !retryable || attempt >= livraison.maxAttempts;
      let delay = 1_000 * 2 ** (attempt - 1);
      try { const policy = JSON.parse(livraison.endpoint.retryPolicy || "{}"); delay = Number(policy.initialDelayMs ?? 1_000) * Number(policy.backoffMultiplier ?? 2) ** (attempt - 1); } catch { /* défaut */ }
      delay = Math.min(3_600_000, Math.max(1_000, delay));
      await db.webhookDeliveryDrive.update({ where: { id: livraison.id }, data: { status: terminal ? "FAILED" : "PENDING", statusCode, errorMessage, failedAt: terminal ? new Date() : null, lockedUntil: null, nextAttemptAt: terminal ? new Date(8640000000000000) : new Date(maintenant.getTime() + delay) } });
      await db.webhookEvent.update({ where: { id: livraison.eventId }, data: { retryCount: { increment: 1 }, lastError: errorMessage, nextRetryAt: terminal ? null : new Date(maintenant.getTime() + delay) } });
      if (terminal) logger.error("Livraison webhook ZupDrive abandonnée", { deliveryId: livraison.id, endpointId: livraison.webhookId, attempt, statusCode, error: errorMessage });
      else logger.warn("Livraison webhook ZupDrive à réessayer", { deliveryId: livraison.id, endpointId: livraison.webhookId, attempt, statusCode });
    }
    return envoyes;
  }

  private static async actualiserEvenement(eventId: string) {
    const lignes = await db.webhookDeliveryDrive.findMany({ where: { eventId }, select: { status: true } });
    if (lignes.length && lignes.every((ligne) => ligne.status === "SENT")) {
      await db.webhookEvent.update({ where: { id: eventId }, data: { delivered: true, deliveredAt: new Date(), nextRetryAt: null, lastError: null } });
    }
  }

  static async reprendreLivraison(id: string): Promise<boolean> {
    const resultat = await db.webhookDeliveryDrive.updateMany({
      where: { id, status: "FAILED", endpoint: { is: { active: true } } },
      data: { status: "PENDING", attempt: 0, errorMessage: null, statusCode: null, failedAt: null, nextAttemptAt: new Date(), lockedUntil: null },
    });
    return resultat.count === 1;
  }

  /**
   * Récupérer l'historique des livraisons de webhooks.
   */
  static async getWebhookDeliveryHistory(filters: {
    webhookId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ deliveries: WebhookDelivery[]; total: number }> {
    const limit = Math.min(filters.limit || 50, 100);
    const offset = filters.offset || 0;

    const where: Prisma.WebhookDeliveryDriveWhereInput = {};
    if (filters.webhookId) where.webhookId = filters.webhookId;
    if (filters.status) where.status = filters.status;

    const [deliveries, total] = await Promise.all([
      db.webhookDeliveryDrive.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.webhookDeliveryDrive.count({ where }),
    ]);

    return {
      deliveries: deliveries.map((d) => this.formatWebhookDelivery(d)),
      total,
    };
  }

  /**
   * Créer une intégration de provider.
   */
  static async createProviderIntegration(data: {
    provider: "SENDGRID" | "TWILIO" | "MAILGUN" | "AWS_SES" | "STRIPE" | "CUSTOM";
    type: "EMAIL" | "SMS" | "PAYMENT" | "CUSTOM";
    apiKey: string;
    webhookSigningKey?: string;
    config?: Record<string, unknown>;
  }): Promise<ProviderIntegration> {
    const integration = await db.providerIntegration.create({
      data: {
        provider: data.provider,
        type: data.type,
        apiKey: encrypt(data.apiKey, CONTEXTE_CLE_FOURNISSEUR),
        webhookSigningKey: data.webhookSigningKey ? encrypt(data.webhookSigningKey, CONTEXTE_CLE_FOURNISSEUR) : undefined,
        active: true,
        config: JSON.stringify(data.config || {}),
      },
    });

    logger.info(`Provider integration created: ${data.provider}`);
    return this.formatProviderIntegration(integration);
  }

  /**
   * Lister les intégrations de providers.
   */
  static async listProviderIntegrations(activeOnly = true): Promise<ProviderIntegration[]> {
    const integrations = await db.providerIntegration.findMany({
      where: activeOnly ? { active: true } : {},
      orderBy: { createdAt: "desc" },
    });

    return integrations.map((i) => this.formatProviderIntegration(i));
  }

  /**
   * Mettre à jour une intégration de provider.
   */
  static async updateProviderIntegration(
    integrationId: string,
    data: Partial<{
      apiKey: string;
      webhookSigningKey: string;
      active: boolean;
      config: Record<string, unknown>;
    }>
  ): Promise<void> {
    const existante = await db.providerIntegration.findUnique({ where: { id: integrationId }, select: { id: true } });
    if (!existante) throw new ApiError(404, "Intégration introuvable", "PROVIDER_NOT_FOUND");

    const updateData: Prisma.ProviderIntegrationUpdateInput = {};
    if (data.apiKey) updateData.apiKey = encrypt(data.apiKey, CONTEXTE_CLE_FOURNISSEUR);
    if (data.webhookSigningKey) updateData.webhookSigningKey = encrypt(data.webhookSigningKey, CONTEXTE_CLE_FOURNISSEUR);
    if (data.active !== undefined) updateData.active = data.active;
    if (data.config) updateData.config = JSON.stringify(data.config);

    await db.providerIntegration.update({
      where: { id: integrationId },
      data: updateData,
    });

    logger.info(`Provider integration ${integrationId} updated`);
  }

  /**
   * Obtenir les statistiques des webhooks.
   */
  static async getWebhookStats(): Promise<{
    totalEndpoints: number;
    activeEndpoints: number;
    totalEvents: number;
    deliveredEvents: number;
    failedDeliveries: number;
    successRate: number;
  }> {
    const endpoints = await db.webhookEndpoint.findMany();
    const events = await db.webhookEvent.findMany();
    const deliveries = await db.webhookDeliveryDrive.findMany();

    const activeEndpoints = endpoints.filter((e) => e.active).length;
    const deliveredEvents = events.filter((e) => e.delivered).length;
    const failedDeliveries = deliveries.filter((d) => d.status === "FAILED" || d.status === "DELIVERY_FAILED").length;

    return {
      totalEndpoints: endpoints.length,
      activeEndpoints,
      totalEvents: events.length,
      deliveredEvents,
      failedDeliveries,
      successRate: events.length > 0 ? (deliveredEvents / events.length) * 100 : 0,
    };
  }

  /**
   * Générer un secret de webhook.
   */
  private static generateWebhookSecret(): string {
    return randomBytes(32).toString("hex");
  }

  // Formatters

  private static formatWebhookEndpoint(endpoint: WebhookEndpointRow): WebhookEndpoint {
    return {
      id: endpoint.id,
      url: endpoint.url,
      events: JSON.parse(endpoint.events || "[]"),
      active: endpoint.active,
      retryPolicy: JSON.parse(endpoint.retryPolicy || "{}"),
      createdAt: endpoint.createdAt,
      updatedAt: endpoint.updatedAt,
    };
  }

  private static formatWebhookEvent(event: WebhookEventRow): WebhookEvent {
    return {
      id: event.id,
      eventType: event.eventType,
      resourceType: event.resourceType as WebhookEvent["resourceType"],
      resourceId: event.resourceId,
      data: JSON.parse(event.data || "{}"),
      timestamp: event.timestamp,
      delivered: event.delivered,
      deliveredAt: event.deliveredAt || undefined,
      nextRetryAt: event.nextRetryAt || undefined,
      retryCount: event.retryCount,
      lastError: event.lastError || undefined,
      createdAt: event.createdAt,
    };
  }

  private static formatWebhookDelivery(delivery: WebhookDeliveryRow): WebhookDelivery {
    return {
      id: delivery.id,
      webhookId: delivery.webhookId,
      eventId: delivery.eventId,
      status: delivery.status as WebhookDelivery["status"],
      statusCode: delivery.statusCode || undefined,
      errorMessage: delivery.errorMessage || undefined,
      attempt: delivery.attempt,
      maxAttempts: delivery.maxAttempts,
      nextAttemptAt: delivery.nextAttemptAt,
      lockedUntil: delivery.lockedUntil || undefined,
      sentAt: delivery.sentAt || undefined,
      failedAt: delivery.failedAt || undefined,
      createdAt: delivery.createdAt,
    };
  }

  private static formatProviderIntegration(integration: ProviderIntegrationRow): ProviderIntegration {
    return {
      id: integration.id,
      provider: integration.provider as ProviderIntegration["provider"],
      type: integration.type as ProviderIntegration["type"],
      apiKeyConfigured: !!integration.apiKey,
      webhookSigningKeyConfigured: !!integration.webhookSigningKey,
      active: integration.active,
      config: JSON.parse(integration.config || "{}"),
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt,
    };
  }
}
