import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";

import { db } from "../services/db";
import { ApiError } from "../middleware/errorHandler";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../config/logger";
import { PlanService } from "../services/plan.service";
import { TicketMessageService } from "../services/ticket-message.service";
import { emitWebhook } from "../services/webhook.service";

const router = Router();

/**
 * La formule du commerçant, vue de son côté.
 *
 * Il ne savait pas à quoi il avait souscrit : la barre latérale affichait une
 * pastille, et la page des boutiques un quota, sans jamais dire ce que
 * contenait la formule ni comment en changer.
 */

/** Un membre ne consulte que la formule de son organisation. */
async function verifierAppartenance(orgId: string, req: Request) {
  const appartenance = await db.membership.findFirst({
    where: { userId: req.userId, orgId },
    select: { id: true },
  });

  if (!appartenance) {
    throw new ApiError(403, "Accès refusé à ce commerçant", "FORBIDDEN");
  }
}

// GET /plans/:orgId - La grille et la formule en cours
router.get("/:orgId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId as string;
    await verifierAppartenance(orgId, req);

    const [grille, quota] = await Promise.all([
      PlanService.grille(),
      PlanService.quotaBoutiques(orgId),
    ]);

    // Une demande déjà déposée : sans cela le commerçant la renvoie chaque
    // fois qu'il revient sur la page.
    const demandeEnCours = await db.merchantTicket.findFirst({
      where: {
        orgId,
        category: "BILLING",
        status: { in: ["OPEN", "IN_PROGRESS"] },
        title: { startsWith: "Demande de formule" },
      },
      select: { id: true, title: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      success: true,
      data: { grille, quota, demandeEnCours },
    });
  } catch (err) {
    next(err);
  }
});

// POST /plans/:orgId/demande - Demander un changement de formule
//
// Le paiement en ligne n'est pas branché : la demande part au support, qui
// applique la formule. Mieux vaut un circuit lent qui aboutit qu'un bouton
// qui ne fait rien.
router.post("/:orgId/demande", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId as string;
    await verifierAppartenance(orgId, req);

    const schema = z.object({
      tier: z.enum(["FREE", "PREMIUM", "PRO"]),
      message: z.string().max(1000).optional(),
    });
    const body = schema.parse(req.body);

    const quota = await PlanService.quotaBoutiques(orgId);

    if (body.tier === quota.tier) {
      throw new ApiError(400, "C'est déjà votre formule", "SAME_TIER");
    }

    const visee = await PlanService.formule(body.tier);

    // Redescendre sous le nombre de boutiques ouvertes ne pourra pas être
    // appliqué : autant le dire tout de suite.
    if (visee.maxBoutiques < quota.used) {
      throw new ApiError(
        400,
        `Vous exploitez ${quota.used} boutique${quota.used > 1 ? "s" : ""} ; la formule ${
          visee.libelle
        } en autorise ${visee.maxBoutiques}. Fermez d'abord les boutiques en trop.`,
        "TIER_BELOW_USAGE"
      );
    }

    const enCours = await db.merchantTicket.findFirst({
      where: {
        orgId,
        category: "BILLING",
        status: { in: ["OPEN", "IN_PROGRESS"] },
        title: { startsWith: "Demande de formule" },
      },
      select: { id: true, title: true },
    });

    if (enCours) {
      throw new ApiError(
        409,
        "Une demande est déjà en cours de traitement",
        "REQUEST_PENDING"
      );
    }

    const ticket = await db.merchantTicket.create({
      data: {
        orgId,
        title: `Demande de formule ${visee.libelle}`,
        description: [
          `Formule actuelle : ${quota.tierLabel} (${quota.used}/${quota.max} boutiques).`,
          `Formule demandée : ${visee.libelle} — ${visee.maxBoutiques} boutiques, ${visee.prixMensuel} € / mois.`,
          body.message ? `\nMessage du commerçant :\n${body.message}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        priority: "MEDIUM",
        category: "BILLING",
        status: "OPEN",
      },
    });

    await TicketMessageService.notifierOuvertureDeTicket(ticket.id);

    // Une demande de formule est un ticket comme un autre : l'événement ne doit
    // pas dépendre de la porte par laquelle le ticket est entré.
    emitWebhook("ticket.created", {
      ticketId: ticket.id,
      orgId,
      title: ticket.title,
      priority: "MEDIUM",
      category: "BILLING",
    });

    logger.info("Demande de changement de formule", { orgId, de: quota.tier, vers: body.tier });

    res.status(201).json({
      message: `Demande envoyée. Le support vous répondra pour le passage en ${visee.libelle}.`,
      data: { id: ticket.id, title: ticket.title, status: ticket.status },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
