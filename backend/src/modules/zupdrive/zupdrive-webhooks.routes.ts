import { Router } from "express";
import { z } from "zod";
import { validateRequest } from "../../middleware/validation";
import { adminAuth } from "../../middleware/auth";
import { ZupDriveWebhooksService } from "./zupdrive-webhooks.service";

const router = Router();

/**
 * Webhook Endpoints Management
 */

/**
 * POST /api/zupdrive/admin/webhooks/endpoints
 * Créer un endpoint de webhook
 */
router.post(
  "/admin/endpoints",
  adminAuth,
  validateRequest({
    body: z.object({
      url: z.string().url(),
      events: z.array(z.string()),
      maxRetries: z.number().min(1).max(10).optional(),
      initialDelayMs: z.number().min(100).optional(),
      backoffMultiplier: z.number().min(1.5).max(5).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const endpoint = await ZupDriveWebhooksService.createWebhookEndpoint(req.body);
      res.status(201).json(endpoint);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/zupdrive/admin/webhooks/endpoints
 * Lister les endpoints de webhook
 */
router.get(
  "/admin/endpoints",
  adminAuth,
  validateRequest({
    query: z.object({
      activeOnly: z.coerce.boolean().optional().default("true"),
    }),
  }),
  async (req, res, next) => {
    try {
      const { activeOnly } = req.query as any;
      const endpoints = await ZupDriveWebhooksService.listWebhookEndpoints(activeOnly === "true");
      res.json(endpoints);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/zupdrive/admin/webhooks/endpoints/:endpointId
 * Mettre à jour un endpoint de webhook
 */
router.patch(
  "/admin/endpoints/:endpointId",
  adminAuth,
  validateRequest({
    body: z.object({
      url: z.string().url().optional(),
      events: z.array(z.string()).optional(),
      active: z.boolean().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const { endpointId } = req.params;
      await ZupDriveWebhooksService.updateWebhookEndpoint(endpointId, req.body);
      res.json({ success: true, message: "Endpoint mis à jour" });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/zupdrive/admin/webhooks/endpoints/:endpointId
 * Supprimer un endpoint de webhook
 */
router.delete("/admin/endpoints/:endpointId", adminAuth, async (req, res, next) => {
  try {
    const { endpointId } = req.params;
    await ZupDriveWebhooksService.deleteWebhookEndpoint(endpointId);
    res.json({ success: true, message: "Endpoint supprimé" });
  } catch (error) {
    next(error);
  }
});

/**
 * Webhook Events
 */

/**
 * POST /api/zupdrive/admin/webhooks/events
 * Déclencher un événement webhook (admin only)
 */
router.post(
  "/admin/events",
  adminAuth,
  validateRequest({
    body: z.object({
      eventType: z.string(),
      resourceType: z.enum(["DRIVER", "DOCUMENT", "INFRACTION", "PAYMENT", "ALERT"]),
      resourceId: z.string(),
      data: z.record(z.any()),
    }),
  }),
  async (req, res, next) => {
    try {
      const event = await ZupDriveWebhooksService.triggerWebhookEvent(req.body);
      res.status(201).json(event);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Webhook Delivery History
 */

/**
 * GET /api/zupdrive/admin/webhooks/deliveries
 * Récupérer l'historique des livraisons de webhooks
 */
router.get(
  "/admin/deliveries",
  adminAuth,
  validateRequest({
    query: z.object({
      webhookId: z.string().optional(),
      status: z.string().optional(),
      limit: z.coerce.number().min(1).max(100).optional().default("50"),
      offset: z.coerce.number().min(0).optional().default("0"),
    }),
  }),
  async (req, res, next) => {
    try {
      const result = await ZupDriveWebhooksService.getWebhookDeliveryHistory(req.query as any);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Provider Integrations
 */

/**
 * POST /api/zupdrive/admin/webhooks/providers
 * Créer une intégration de provider
 */
router.post(
  "/admin/providers",
  adminAuth,
  validateRequest({
    body: z.object({
      provider: z.enum(["SENDGRID", "TWILIO", "MAILGUN", "AWS_SES", "STRIPE", "CUSTOM"]),
      type: z.enum(["EMAIL", "SMS", "PAYMENT", "CUSTOM"]),
      apiKey: z.string().min(5),
      webhookSigningKey: z.string().optional(),
      config: z.record(z.any()).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const integration = await ZupDriveWebhooksService.createProviderIntegration(req.body);
      res.status(201).json(integration);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/zupdrive/admin/webhooks/providers
 * Lister les intégrations de providers
 */
router.get(
  "/admin/providers",
  adminAuth,
  validateRequest({
    query: z.object({
      activeOnly: z.coerce.boolean().optional().default("true"),
    }),
  }),
  async (req, res, next) => {
    try {
      const { activeOnly } = req.query as any;
      const integrations = await ZupDriveWebhooksService.listProviderIntegrations(activeOnly === "true");
      res.json(integrations);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/zupdrive/admin/webhooks/providers/:integrationId
 * Mettre à jour une intégration de provider
 */
router.patch(
  "/admin/providers/:integrationId",
  adminAuth,
  validateRequest({
    body: z.object({
      apiKey: z.string().optional(),
      webhookSigningKey: z.string().optional(),
      active: z.boolean().optional(),
      config: z.record(z.any()).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const { integrationId } = req.params;
      await ZupDriveWebhooksService.updateProviderIntegration(integrationId, req.body);
      res.json({ success: true, message: "Intégration mise à jour" });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Webhook Statistics
 */

/**
 * GET /api/zupdrive/admin/webhooks/stats
 * Récupérer les statistiques des webhooks
 */
router.get("/admin/stats", adminAuth, async (req, res, next) => {
  try {
    const stats = await ZupDriveWebhooksService.getWebhookStats();
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

export default router;
