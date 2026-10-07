import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { authMiddleware } from "../auth/auth.middleware";
import { AnnouncementService, PUBLICS_CONNUS } from "../marketing/announcement.service";
import { isSystemAdmin } from "./shared";
import { limiteBornee, decalage } from "../../utils/pagination";

const router = Router();

// GET /admin/notifications - Annonces diffusées par la plateforme
router.get("/notifications", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = limiteBornee(req.query.limit, 50, 200);
    const offset = decalage(req.query.offset);

    const where = { type: "PLATFORM_ANNOUNCEMENT" as const };

    const [annonces, total] = await Promise.all([
      db.notification.findMany({ where, take: limit, skip: offset, orderBy: { createdAt: "desc" } }),
      db.notification.count({ where }),
    ]);

    res.json({
      notifications: annonces.map((n) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        type: n.priority === "CRITICAL" ? "ALERT" : n.priority === "HIGH" ? "WARNING" : "INFO",
        priority: n.priority,
        read: n.isRead,
        createdAt: n.createdAt,
        targetAudience: n.targetAudience,
        actionUrl: n.link || undefined,
      })),
      pagination: { total, limit, offset },
    });
  } catch (err) {
    next(err);
  }
});

const annonceSchema = z.object({
  title: z.string().min(3, "Titre : 3 caractères minimum"),
  message: z.string().min(3, "Message : 3 caractères minimum"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  // La liste vient du service : l'écran et le serveur ne proposaient pas les
  // mêmes valeurs, et trois choix sur quatre étaient refusés en 400.
  targetAudience: z.enum(PUBLICS_CONNUS as [string, ...string[]]).optional(),
  actionUrl: z.string().optional(),
});

// POST /admin/notifications - Diffuser une annonce
router.post("/notifications", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = annonceSchema.parse(req.body);
    const auteur = (req as any).actorEmail || "plateforme";

    // Une seule ligne était créée, adressée à son auteur : l'annonce
    // n'atteignait personne. Elle est maintenant recopiée dans la boîte de
    // chaque destinataire du public visé.
    const { annonce, destinataires } = await AnnouncementService.diffuser({
      title: body.title,
      message: body.message,
      priority: body.priority,
      targetAudience: body.targetAudience,
      link: body.actionUrl,
      auteur,
    });

    // Une annonce atteint les boîtes de tous les destinataires : qui l'a envoyée,
    // et à quel public, doit rester traçable.
    await db.systemAuditLog.create({
      data: {
        adminId: req.userId as string,
        action: "BROADCAST_ANNOUNCEMENT",
        target: annonce.id,
        changes: { title: body.title, targetAudience: body.targetAudience ?? null, destinataires },
      },
    });

    res.status(201).json({
      message: destinataires
        ? `Annonce diffusée à ${destinataires} destinataire${destinataires > 1 ? "s" : ""}`
        : "Annonce enregistrée, mais personne ne correspond à ce public",
      notification: annonce,
      destinataires,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /admin/notifications/:notificationId/read - Marquer comme lue
router.patch("/notifications/:notificationId/read", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const notificationId = req.params.notificationId as string;

    const existante = await db.notification.findUnique({ where: { id: notificationId } });
    if (!existante) {
      throw new ApiError(404, "Annonce introuvable", "NOT_FOUND");
    }

    const annonce = await db.notification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
    });

    res.json({ message: "Annonce marquée comme lue", notification: annonce });
  } catch (err) {
    next(err);
  }
});

// DELETE /admin/notifications/:notificationId - Retirer une annonce
router.delete("/notifications/:notificationId", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const notificationId = req.params.notificationId as string;

    const existante = await db.notification.findUnique({ where: { id: notificationId } });
    if (!existante) {
      throw new ApiError(404, "Annonce introuvable", "NOT_FOUND");
    }

    await db.notification.delete({ where: { id: notificationId } });

    res.json({ message: "Annonce supprimée" });
  } catch (err) {
    next(err);
  }
});

export default router;
