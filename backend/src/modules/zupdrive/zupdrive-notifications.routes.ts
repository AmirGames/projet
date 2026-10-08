import { Router } from "express";
import { z } from "zod";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/api-error";
import { authMiddleware } from "../auth/auth.middleware";
import { journaliser } from "../superowner/shared";
import { adminAuthSection, validateRequest } from "./zupdrive-garde";
import { ZupDriveNotificationsService } from "./zupdrive-notifications.service";

const router = Router();

/** Notifications et alertes : section « courses-drive » de la plateforme DRIVE. */
const adminAuth = adminAuthSection("courses-drive");

/** Le dossier chauffeur du compte connecté : l'identité vient du jeton, jamais de la requête. */
async function chauffeurDuJeton(userId: string | undefined): Promise<string> {
  const chauffeur = userId ? await db.chauffeurDrive.findUnique({ where: { userId }, select: { id: true } }) : null;
  if (!chauffeur) throw new ApiError(403, "Réservé aux chauffeurs ZupDrive", "NOT_A_CHAUFFEUR");
  return chauffeur.id;
}

const idSchema = z.string().min(1);

/** Un booléen de query-string : « false » reste faux (z.coerce.boolean() le lirait vrai). */
const booleenQuery = z
  .enum(["true", "false"])
  .default("true")
  .transform((valeur) => valeur === "true");

const historiqueSchema = z.object({
  recipientId: z.string().optional(),
  type: z.enum(["EMAIL", "SMS", "PUSH"]).optional(),
  status: z.enum(["PENDING", "SENT", "FAILED", "BOUNCED"]).optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

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
      await journaliser(req, "ZUPDRIVE_UPSERT_NOTIFICATION_TEMPLATE", template.key, {
        type: template.type,
        active: template.active,
      });
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
      activeOnly: booleenQuery,
    }),
  }),
  async (req, res, next) => {
    try {
      const { activeOnly } = req.query as unknown as { activeOnly: boolean };
      const templates = await ZupDriveNotificationsService.listTemplates(activeOnly);
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
router.get("/admin/templates/:key", ...adminAuth, async (req, res, next) => {
  try {
    const key = idSchema.parse(req.params.key);
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
      variables: z.record(z.string(), z.string()).optional(),
      dedupeKey: z.string().min(1).max(200).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const log = await ZupDriveNotificationsService.sendNotification(req.body);
      await journaliser(req, "ZUPDRIVE_SEND_NOTIFICATION", log.id, {
        recipientId: req.body.recipientId,
        recipientType: req.body.recipientType,
        templateKey: req.body.templateKey,
        type: req.body.type,
      });
      // Clé d'idempotence déjà vue : le journal existant, sans nouvel envoi.
      res.status(log.deduplicated ? 200 : 201).json(log);
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
      variables: z.record(z.string(), z.string()),
      dedupeKey: z.string().min(1).max(200).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const { driverId, ...reste } = req.body;
      const { logs, ignores } = await ZupDriveNotificationsService.triggerEventNotification({ ...reste, chauffeurId: driverId });
      await journaliser(req, "ZUPDRIVE_TRIGGER_NOTIFICATION_EVENT", driverId, { type: reste.type });
      res.json({ success: true, message: "Notification déclenché", notifications: logs.map((l) => ({ id: l.id, type: l.type, status: l.status })), ignores });
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
      const { driverId, ...reste } = req.body;
      const alert = await ZupDriveNotificationsService.createAlert({ ...reste, chauffeurId: driverId });
      await journaliser(req, "ZUPDRIVE_CREATE_ALERT", alert.id, {
        chauffeurId: driverId,
        type: reste.type,
        severity: reste.severity,
      });
      res.status(201).json(alert);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/zupdrive/notifications/alerts/unread
 * Alertes non lues du chauffeur connecté (le chauffeur vient du jeton ; un
 * éventuel ?driverId= envoyé par d'anciennes apps est ignoré).
 */
router.get("/alerts/unread", authMiddleware, async (req, res, next) => {
  try {
    const chauffeurId = await chauffeurDuJeton(req.userId);
    res.json(await ZupDriveNotificationsService.getUnreadAlerts(chauffeurId));
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/zupdrive/notifications/alerts/read-all
 * Marquer toutes les alertes du chauffeur connecté comme lues.
 * Déclarée avant « /alerts/:id/read » : « read-all » ne doit pas être pris pour un id.
 */
router.patch("/alerts/read-all", authMiddleware, async (req, res, next) => {
  try {
    const chauffeurId = await chauffeurDuJeton(req.userId);
    await ZupDriveNotificationsService.markAllAlertsAsRead(chauffeurId);
    res.json({ success: true, message: "Toutes les alertes marquées comme lues" });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/zupdrive/notifications/alerts/:id/read
 * Marquer une de ses alertes comme lue (404 si elle appartient à un autre chauffeur).
 */
router.patch("/alerts/:id/read", authMiddleware, async (req, res, next) => {
  try {
    const chauffeurId = await chauffeurDuJeton(req.userId);
    const id = idSchema.parse(req.params.id);
    await ZupDriveNotificationsService.markAlertAsRead(id, chauffeurId);
    res.json({ success: true, message: "Alerte marquée comme lue" });
  } catch (error) {
    next(error);
  }
});

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
  validateRequest({ query: historiqueSchema }),
  async (req, res, next) => {
    try {
      const result = await ZupDriveNotificationsService.getNotificationHistory(req.query as unknown as z.infer<typeof historiqueSchema>);
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
router.get("/admin/stats", ...adminAuth, async (_req, res, next) => {
  try {
    const stats = await ZupDriveNotificationsService.getNotificationStats();
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

/*
 * Le webhook d'accusés du fournisseur (POST /webhooks/status) n'est pas ici : il
 * lit le corps brut pour vérifier la signature et se monte avant le lecteur JSON
 * (voir zupdrive-notifications-webhook.ts et app.ts).
 */

export default router;
