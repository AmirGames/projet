import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authMiddleware } from "../auth/auth.middleware";
import { WebhookService, EVENEMENTS_WEBHOOK } from "../webhooks/webhook.service";
import { SecurityEventService } from "../auth/security-event.service";
import { isSuperOwner, journaliser } from "./shared";
import { limiteBornee, decalage } from "../../utils/pagination";

const router = Router();

// GET /superowner/webhooks - Abonnements enregistrés
router.get("/webhooks", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = limiteBornee(req.query.limit, 20, 100);
    const offset = decalage(req.query.offset);

    res.json(await WebhookService.list(limit, offset));
  } catch (err) {
    next(err);
  }
});

// GET /superowner/webhooks/evenements - La liste des événements qui existent
// vraiment. L'écran proposait sa propre liste, qui avait divergé de celle du
// serveur : neuf des dix événements offerts n'étaient émis par personne.
router.get("/webhooks/evenements", authMiddleware, isSuperOwner, async (_req: Request, res: Response) => {
  res.json({ availableEvents: EVENEMENTS_WEBHOOK });
});

// POST /superowner/webhooks - Créer un abonnement
router.post("/webhooks", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      url: z.string().url("URL invalide"),
      events: z.array(z.string()).min(1, "Au moins un événement"),
    });
    const body = schema.parse(req.body);

    const abonnement = await WebhookService.create({
      url: body.url,
      events: body.events,
      createdById: req.userId,
    });

    SecurityEventService.record({
      action: "WEBHOOK_CREATED",
      actor: req.userId || "inconnu",
      target: abonnement.id,
      severity: "MEDIUM",
      details: `Webhook vers ${body.url}`,
    });
    // Le secret n'est jamais écrit au journal : seulement la cible et les événements.
    await journaliser(req, "CREATE_WEBHOOK", abonnement.id, { url: body.url, events: body.events });

    res.status(201).json({
      success: true,
      webhook: {
        id: abonnement.id,
        url: abonnement.url,
        events: abonnement.events,
        status: abonnement.status,
        // Le secret sert à vérifier la signature : il n'est montré qu'ici.
        secret: abonnement.secret,
        lastTriggered: abonnement.lastTriggered,
        retryCount: abonnement.retryCount,
        createdAt: abonnement.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /superowner/webhooks/:webhookId - Supprimer un abonnement
router.delete("/webhooks/:webhookId", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const webhookId = req.params.webhookId as string;
    await WebhookService.remove(webhookId);

    SecurityEventService.record({
      action: "WEBHOOK_DELETED",
      actor: req.userId || "inconnu",
      target: webhookId,
      severity: "MEDIUM",
    });
    await journaliser(req, "DELETE_WEBHOOK", webhookId);

    res.json({ success: true, message: "Webhook supprimé" });
  } catch (err) {
    next(err);
  }
});

// PATCH /superowner/webhooks/:webhookId - Mettre en pause, ou remettre en marche
// un abonnement coupé après cinq abandons. Sans cette route, il fallait le
// supprimer et le recréer — donc changer le secret chez le destinataire.
router.patch("/webhooks/:webhookId", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({ status: z.enum(["ACTIVE", "INACTIVE"]) });
    const body = schema.parse(req.body);
    const webhookId = req.params.webhookId as string;

    const abonnement = await WebhookService.setStatus(webhookId, body.status);
    await journaliser(req, "SET_WEBHOOK_STATUS", webhookId, { status: body.status });

    res.json({
      success: true,
      message: body.status === "ACTIVE" ? "Webhook réactivé" : "Webhook mis en pause",
      webhook: { id: abonnement.id, status: abonnement.status, retryCount: abonnement.retryCount },
    });
  } catch (err) {
    next(err);
  }
});

// POST /superowner/webhooks/:webhookId/essai - Envoi d'essai
// La seule façon de savoir si son destinataire répondait correctement était
// d'attendre un vrai événement — et de le manquer s'il ne répondait pas.
router.post("/webhooks/:webhookId/essai", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const webhookId = req.params.webhookId as string;
    const envoi = await WebhookService.essayer(webhookId);
    await journaliser(req, "TEST_WEBHOOK", webhookId, { success: envoi.success });

    res.json({
      success: true,
      envoi,
      message: envoi.success
        ? `Votre serveur a répondu ${envoi.statusCode}.`
        : `Échec : ${envoi.error}. Une relance est programmée.`,
    });
  } catch (err) {
    next(err);
  }
});

// GET /superowner/webhooks/:webhookId/deliveries - Historique des envois
router.get("/webhooks/:webhookId/deliveries", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const webhookId = req.params.webhookId as string;
    const envois = await WebhookService.deliveries(webhookId);

    res.json({ deliveries: envois, availableEvents: EVENEMENTS_WEBHOOK });
  } catch (err) {
    next(err);
  }
});

export default router;
