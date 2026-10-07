import type {
  Prisma,
  ProviderIntegration as ProviderIntegrationRow,
  WebhookDeliveryDrive as WebhookDeliveryRow,
  WebhookEndpoint as WebhookEndpointRow,
  WebhookEvent as WebhookEventRow,
} from "@prisma/client";
import { db } from "../../services/db";
import { logger } from "../../config/logger";
import { ApiError } from "../../middleware/api-error";

/**
 * Webhooks & Integrations pour ZupDrive.
 * Webhooks outbound, retry logic, provider integrations.
 */

export interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[]; // DRIVER_SUSPENDED, INFRACTION_REPORTED, DOCUMENT_EXPIRED, etc
  active: boolean;
  secret: string; // Pour signature HMAC
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
  status: "PENDING" | "SENT" | "FAILED" | "DELIVERY_FAILED";
  statusCode?: number;
  responseBody?: string;
  errorMessage?: string;
  attempt: number;
  sentAt?: Date;
  failedAt?: Date;
  createdAt: Date;
}

export interface ProviderIntegration {
  id: string;
  provider: "SENDGRID" | "TWILIO" | "MAILGUN" | "AWS_SES" | "STRIPE" | "CUSTOM";
  type: "EMAIL" | "SMS" | "PAYMENT" | "CUSTOM";
  apiKey: string; // encrypted
  webhookSigningKey?: string; // encrypted
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
    // Valider l'URL
    try {
      new URL(data.url);
    } catch {
      throw new ApiError(400, "URL invalide");
    }

    const secret = this.generateWebhookSecret();

    const endpoint = await db.webhookEndpoint.create({
      data: {
        url: data.url,
        events: JSON.stringify(data.events),
        secret,
        active: true,
        retryPolicy: JSON.stringify({
          maxRetries: data.maxRetries || 5,
          initialDelayMs: data.initialDelayMs || 1000,
          backoffMultiplier: data.backoffMultiplier || 2,
        }),
      },
    });

    logger.info(`Webhook endpoint created: ${data.url}`);
    return this.formatWebhookEndpoint(endpoint);
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

  /**
   * Supprimer un endpoint de webhook.
   */
  static async deleteWebhookEndpoint(endpointId: string): Promise<void> {
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
    const event = await db.webhookEvent.create({
      data: {
        eventType: data.eventType,
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        data: JSON.stringify(data.data),
        timestamp: new Date(),
        delivered: false,
        retryCount: 0,
      },
    });

    // Déclencher les livraisons pour les endpoints intéressés
    const endpoints = await db.webhookEndpoint.findMany({
      where: { active: true },
    });

    const matchingEndpoints = endpoints.filter((e) => {
      const events = JSON.parse(e.events || "[]");
      return events.includes(data.eventType) || events.includes("*");
    });

    for (const endpoint of matchingEndpoints) {
      await this.scheduleWebhookDelivery(endpoint.id, event.id);
    }

    logger.info(`Webhook event triggered: ${data.eventType}`);
    return this.formatWebhookEvent(event);
  }

  /**
   * Planifier une livraison de webhook.
   */
  private static async scheduleWebhookDelivery(webhookId: string, eventId: string): Promise<void> {
    const delivery = await db.webhookDeliveryDrive.create({
      data: {
        webhookId,
        eventId,
        status: "PENDING",
        attempt: 1,
      },
    });

    // TODO: Ajouter à une queue de jobs (Bull, RabbitMQ, etc)
    // Pour l'instant, marquer pour livraison immédiate
    logger.info(`Webhook delivery scheduled: ${delivery.id}`);
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
    // TODO: Encrypter les clés sensibles
    const integration = await db.providerIntegration.create({
      data: {
        provider: data.provider,
        type: data.type,
        apiKey: data.apiKey,
        webhookSigningKey: data.webhookSigningKey,
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
    const updateData: Prisma.ProviderIntegrationUpdateInput = {};
    if (data.apiKey) updateData.apiKey = data.apiKey;
    if (data.webhookSigningKey) updateData.webhookSigningKey = data.webhookSigningKey;
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
    return Array.from({ length: 32 }, () => Math.random().toString(36).charAt(2)).join("");
  }

  // Formatters

  private static formatWebhookEndpoint(endpoint: WebhookEndpointRow): WebhookEndpoint {
    return {
      id: endpoint.id,
      url: endpoint.url,
      events: JSON.parse(endpoint.events || "[]"),
      active: endpoint.active,
      secret: endpoint.secret,
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
      responseBody: delivery.responseBody || undefined,
      errorMessage: delivery.errorMessage || undefined,
      attempt: delivery.attempt,
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
      apiKey: integration.apiKey, // TODO: masquer la clé réelle
      webhookSigningKey: integration.webhookSigningKey || undefined,
      active: integration.active,
      config: JSON.parse(integration.config || "{}"),
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt,
    };
  }
}
