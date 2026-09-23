import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "../services/db";
import { ApiError } from "../middleware/errorHandler";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../config/logger";
import { TicketMessageService } from "../services/ticket-message.service";
import { emitWebhook } from "../services/webhook.service";
import { MerchantApprovalService } from "../services/merchant-approval.service";

const router = Router();

/**
 * GET /support/compte/:orgId - L'état du compte, toujours joignable
 *
 * L'espace commerçant lisait cet état sur /api/organizations/:orgId. Or cette
 * route est fermée à un compte suspendu : le bandeau qui explique la
 * suspension disparaissait au moment précis où il devient utile. Il vit donc
 * ici, sous le seul chemin qui reste ouvert.
 */
router.get("/compte/:orgId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId as string;

    const appartenance = await db.membership.findFirst({
      where: { userId: req.userId, orgId },
      select: { id: true },
    });

    if (!appartenance) {
      throw new ApiError(403, "Accès refusé à ce commerçant", "FORBIDDEN");
    }

    const organisation = await db.organization.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        name: true,
        tier: true,
        status: true,
        suspensionReason: true,
        suspensionDate: true,
        closureReason: true,
        closureDate: true,
        closedUntil: true,
        approvedAt: true,
      },
    });

    if (!organisation) {
      throw new ApiError(404, "Commerçant introuvable", "NOT_FOUND");
    }

    // La validation se lit ici aussi : le bandeau « en attente » doit rester
    // visible quel que soit l'état du compte.
    res.json({ ...organisation, validation: await MerchantApprovalService.etat(orgId) });
  } catch (err) {
    next(err);
  }
});

// Un membre ne peut agir que sur les tickets de son organisation.
async function assertTicketAccess(ticketId: string, req: Request) {
  const ticket = await db.merchantTicket.findUnique({ where: { id: ticketId } });

  if (!ticket) {
    throw new ApiError(404, "Ticket non trouvé", "NOT_FOUND");
  }

  const membership = await db.membership.findFirst({
    where: { userId: req.userId, orgId: ticket.orgId },
  });

  if (!membership) {
    throw new ApiError(403, "Accès refusé à ce ticket", "FORBIDDEN");
  }

  return ticket;
}

const createTicketSchema = z.object({
  orgId: z.string().min(1, "orgId requis"),
  subject: z.string().min(2, "Sujet minimum 2 caractères"),
  description: z.string().min(5, "Description minimum 5 caractères"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  category: z.enum(["TECHNICAL", "BILLING", "ACCOUNT", "OTHER"]).default("OTHER"),
});

// POST /support/tickets - Create ticket (protected)
router.post("/tickets", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createTicketSchema.parse(req.body);

    logger.info("Creating support ticket", {
      subject: body.subject,
      orgId: body.orgId,
      priority: body.priority
    });

    const ticket = await db.merchantTicket.create({
      data: {
        orgId: body.orgId,
        title: body.subject,
        description: body.description,
        priority: body.priority,
        category: body.category,
        status: "OPEN",
      },
    });

    // La plateforme doit savoir qu'un commerçant attend une réponse.
    await TicketMessageService.notifierOuvertureDeTicket(ticket.id);

    // Les réponses à un ticket étaient diffusées, son ouverture non : un outil
    // de support extérieur voyait la conversation commencer sans son début.
    emitWebhook("ticket.created", {
      ticketId: ticket.id,
      orgId: ticket.orgId,
      title: ticket.title,
      priority: ticket.priority,
      category: ticket.category,
    });

    res.status(201).json({
      message: "Ticket de support créé",
      data: ticket,
    });
  } catch (err) {
    next(err);
  }
});

// GET /support/tickets?orgId=:orgId - Get tickets by organization (protected)
router.get("/tickets", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.query.orgId as string;

    if (!orgId) {
      throw new ApiError(400, "Paramètre 'orgId' requis", "MISSING_PARAM");
    }

    logger.info("Fetching support tickets", { orgId });

    const archived = req.query.archived === "true";

    const tickets = await db.merchantTicket.findMany({
      where: {
        orgId,
        archivedAt: archived ? { not: null } : null,
      },
      include: { _count: { select: { messages: true } } },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json({
      data: tickets,
      count: tickets.length,
    });
  } catch (err) {
    next(err);
  }
});

// GET /support/tickets/:id - Get ticket by ID
router.get("/tickets/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const ticket = await db.merchantTicket.findUnique({
      where: { id },
    });

    if (!ticket) {
      throw new ApiError(404, "Ticket non trouvé", "NOT_FOUND");
    }

    res.json(ticket);
  } catch (err) {
    next(err);
  }
});

// PATCH /support/tickets/:id/status - Update ticket status (protected)
router.patch("/tickets/:id/status", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { status } = req.body;

    const validStatuses = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];
    if (!validStatuses.includes(status)) {
      throw new ApiError(400, "Statut invalide", "INVALID_INPUT");
    }

    logger.info("Updating ticket status", { id, status });

    // Clore archive le ticket, ici comme côté plateforme.
    const { ticket } = await TicketMessageService.changerEtat(id, status);

    res.json({
      message: "Statut du ticket mis à jour",
      data: ticket,
    });
  } catch (err) {
    next(err);
  }
});

// GET /support/tickets/:id/messages - Conversation du ticket (protected)
router.get("/tickets/:id/messages", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    await assertTicketAccess(id, req);

    const messages = await TicketMessageService.list(id);

    res.json({ data: messages, count: messages.length });
  } catch (err) {
    next(err);
  }
});

// POST /support/tickets/:id/messages - Répondre en tant que commerçant (protected)
router.post("/tickets/:id/messages", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const schema = z.object({ body: z.string().min(1, "Message requis") });
    const body = schema.parse(req.body);

    await assertTicketAccess(id, req);

    const message = await TicketMessageService.add({
      ticketId: id,
      authorId: req.userId as string,
      authorRole: "MERCHANT",
      body: body.body,
    });

    res.status(201).json({ message: "Réponse envoyée", data: message });
  } catch (err) {
    next(err);
  }
});

// DELETE /support/tickets/:id - Delete ticket (protected)
router.delete("/tickets/:id", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const ticket = await db.merchantTicket.findUnique({
      where: { id },
    });

    if (!ticket) {
      throw new ApiError(404, "Ticket non trouvé", "NOT_FOUND");
    }

    logger.info("Deleting support ticket", { id });

    await db.merchantTicket.delete({
      where: { id },
    });

    res.json({
      message: "Ticket supprimé",
    });
  } catch (err) {
    next(err);
  }
});

export default router;
