import { Router } from "express";
import { z } from "zod";
import { adminAuth, validateRequest } from "./zupdrive-garde";
import { ZupDriveNotificationsService } from "./zupdrive-notifications.service";

const router = Router();

/**
 * Notification Templates
 */

/**
 * POST /api/zupdrive/admin/notifications/templates
 * Créer ou mettre à jour un template de notification
 */
router.post(
  "/admin/templates",
  ...adminAuth,
  validateRequest({
    body: z.object({
      key: z.string().min(3).max(100),
      name: z.string().min(3).max(200),
      type: z.enum(["EMAIL", "SMS", "PUSH"]),
      subject: z.string().max(200).optional(),
      body: z.string().min(10).max(5000),
      variables: z.array(z.string()),
      active: z.boolean(),
    }),
  }),
  async (req, res, next) => {
    try {
      const template = await ZupDriveNotificationsService.upsertTemplate(req.body);
      res.status(201).json(template);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/zupdrive/admin/notifications/templates
 * Lister les templates
 */
router.get(
  "/admin/templates",
  ...adminAuth,
  validateRequest({
    query: z.object({
      activeOnly: z.coerce.boolean().optional().default("true"),
    }),
  }),
  async (req, res, next) => {
    try {
      const { activeOnly } = req.query as any;
      const templates = await ZupDriveNotificationsService.listTemplates(activeOnly === "true");
      res.json(templates);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/zupdrive/admin/notifications/templates/:key
 * Récupérer un template spécifique
 */
router.get("/admin/templates/:key", adminAuth, async (req, res, next) => {
  try {
    const { key } = req.params;
    const template = await ZupDriveNotificationsService.getTemplate(key);
    res.json(template);
  } catch (error) {
    next(error);
  }
});

/**
 * Sending Notifications
 */

/**
 * POST /api/zupdrive/admin/notifications/send
 * Envoyer une notification manuelle
 */
router.post(
  "/admin/send",
  ...adminAuth,
  validateRequest({
    body: z.object({
      recipientId: z.string(),
      recipientType: z.enum(["CHAUFFEUR", "PASSAGER", "ADMIN"]),
      templateKey: z.string(),
      type: z.enum(["EMAIL", "SMS", "PUSH"]),
      recipient: z.string(),
      variables: z.record(z.string()).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const log = await ZupDriveNotificationsService.sendNotification(req.body);
      res.status(201).json(log);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/zupdrive/admin/notifications/trigger-event
 * Déclencher une notification basée sur un événement
 */
router.post(
  "/admin/trigger-event",
  ...adminAuth,
  validateRequest({
    body: z.object({
      type: z.enum(["DOCUMENT_EXPIRY", "INFRACTION_REPORTED", "SUSPENSION", "PAYMENT_ISSUE"]),
      driverId: z.string(),
      variables: z.record(z.string()),
    }),
  }),
  async (req, res, next) => {
    try {
      await ZupDriveNotificationsService.triggerEventNotification(req.body);
      res.json({ success: true, message: "Notification déclenché" });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Alerts Management
 */

/**
 * POST /api/zupdrive/admin/notifications/alerts
 * Créer une alerte
 */
router.post(
  "/admin/alerts",
  ...adminAuth,
  validateRequest({
    body: z.object({
      driverId: z.string(),
      type: z.enum(["DOCUMENT_EXPIRY", "INFRACTION_REPORTED", "SUSPENSION", "PAYMENT_ISSUE", "RATING_LOW", "CUSTOM"]),
      severity: z.enum(["INFO", "WARNING", "CRITICAL"]),
      title: z.string().min(5).max(200),
      message: z.string().min(10).max(2000),
      triggerAction: z.string().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const alert = await ZupDriveNotificationsService.createAlert(req.body);
      res.status(201).json(alert);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/zupdrive/notifications/alerts/unread
 * Récupérer les alertes non lues (pour drivers)
 */
router.get("/alerts/unread", validateRequest({ query: z.object({ driverId: z.string() }) }), async (req, res, next) => {
  try {
    const { driverId } = req.query as any;
    const alerts = await ZupDriveNotificationsService.getUnreadAlerts(driverId);
    res.json(alerts);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/zupdrive/notifications/alerts/:id/read
 * Marquer une alerte comme lue
 */
router.patch("/alerts/:id/read", async (req, res, next) => {
  try {
    const { id } = req.params;
    await ZupDriveNotificationsService.markAlertAsRead(id);
    res.json({ success: true, message: "Alerte marquée comme lue" });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/zupdrive/notifications/alerts/read-all
 * Marquer toutes les alertes comme lues
 */
router.patch(
  "/alerts/read-all",
  validateRequest({
    body: z.object({
      driverId: z.string(),
    }),
  }),
  async (req, res, next) => {
    try {
      const { driverId } = req.body;
      await ZupDriveNotificationsService.markAllAlertsAsRead(driverId);
      res.json({ success: true, message: "Toutes les alertes marquées comme lues" });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Notification History & Statistics
 */

/**
 * GET /api/zupdrive/admin/notifications/history
 * Récupérer l'historique des notifications
 */
router.get(
  "/admin/history",
  ...adminAuth,
  validateRequest({
    query: z.object({
      recipientId: z.string().optional(),
      type: z.enum(["EMAIL", "SMS", "PUSH"]).optional(),
      status: z.enum(["PENDING", "SENT", "FAILED", "BOUNCED"]).optional(),
      limit: z.coerce.number().min(1).max(100).optional().default("50"),
      offset: z.coerce.number().min(0).optional().default("0"),
    }),
  }),
  async (req, res, next) => {
    try {
      const result = await ZupDriveNotificationsService.getNotificationHistory(req.query as any);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/zupdrive/admin/notifications/stats
 * Récupérer les statistiques de notifications (derniers 30 jours)
 */
router.get("/admin/stats", adminAuth, async (req, res, next) => {
  try {
    const stats = await ZupDriveNotificationsService.getNotificationStats();
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

/**
 * Webhook for Provider Status Updates
 */

/**
 * POST /api/zupdrive/webhooks/notifications/status
 * Webhook pour mettre à jour le statut des notifications (depuis providers)
 */
router.post(
  "/webhooks/status",
  validateRequest({
    body: z.object({
      notificationLogId: z.string(),
      status: z.enum(["SENT", "FAILED", "BOUNCED"]),
      errorMessage: z.string().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const { notificationLogId, status, errorMessage } = req.body;
      await ZupDriveNotificationsService.updateNotificationStatus(notificationLogId, status, errorMessage);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
