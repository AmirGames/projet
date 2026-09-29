import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { authMiddleware } from "../auth/auth.middleware";
import { TicketMessageService } from "../support/ticket-message.service";
import { isSuperOwner, journaliser } from "./shared";

const router = Router();

const LIBELLES_STATUT: Record<string, string> = {
  OPEN: "rouvert",
  IN_PROGRESS: "pris en charge par le support",
  RESOLVED: "résolu",
  CLOSED: "clôturé",
};

const LIBELLES_PRIORITE: Record<string, string> = {
  LOW: "basse",
  MEDIUM: "normale",
  HIGH: "haute",
  CRITICAL: "urgente",
};

// PATCH /superowner/support-tickets/:ticketId/priority - Changer la priorité
router.patch("/support-tickets/:ticketId/priority", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticketId = req.params.ticketId as string;
    // La page affiche URGENT là où la base stocke CRITICAL.
    const schema = z.object({ priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT", "CRITICAL"]) });
    const body = schema.parse(req.body);
    const priorite = body.priority === "URGENT" ? "CRITICAL" : body.priority;

    const existant = await db.merchantTicket.findUnique({ where: { id: ticketId } });

    if (!existant) {
      throw new ApiError(404, "Ticket introuvable", "NOT_FOUND");
    }

    const ticket = await db.merchantTicket.update({
      where: { id: ticketId },
      data: { priority: priorite },
    });

    await journaliser(req, "TICKET_PRIORITY_CHANGED", ticketId, {
      avant: existant.priority,
      apres: priorite,
    });

    if (existant.priority !== priorite) {
      await TicketMessageService.notifierChangementEtat(
        ticketId,
        "Priorité de votre ticket modifiée",
        `Ticket « ${ticket.title} » : priorité ${LIBELLES_PRIORITE[priorite] || priorite}.`
      );
    }

    res.json({
      message: "Priorité mise à jour",
      ticket: { ...ticket, priority: ticket.priority === "CRITICAL" ? "URGENT" : ticket.priority },
    });
  } catch (err) {
    next(err);
  }
});

// GET /superowner/support-tickets/:ticketId/messages - Fil de discussion
router.get("/support-tickets/:ticketId/messages", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const messages = await TicketMessageService.list(req.params.ticketId as string);
    res.json({ data: messages });
  } catch (err) {
    next(err);
  }
});

// POST /superowner/support-tickets/:ticketId/messages - Répondre au commerçant
router.post("/support-tickets/:ticketId/messages", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({ body: z.string().min(1, "Message requis") });
    const body = schema.parse(req.body);

    const message = await TicketMessageService.add({
      ticketId: req.params.ticketId as string,
      authorId: (req as any).userId,
      authorRole: "ADMIN",
      body: body.body,
    });

    res.status(201).json({ message: "Réponse envoyée", data: message });
  } catch (err) {
    next(err);
  }
});

// L'interface parle d'URGENT là où la base stocke CRITICAL.
const versPrioriteAffichee = (p: string) => (p === "CRITICAL" ? "URGENT" : p);

const versPrioriteStockee = (p: string) => (p === "URGENT" ? "CRITICAL" : p);

// GET /superowner/support-tickets - Tickets de tous les commerçants
router.get("/support-tickets", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string;
    const priority = req.query.priority as string;
    /**
     * Les tickets archivés, sur demande.
     *
     * Clore un ticket l'archive : la liste, qui excluait les archivés sans
     * alternative, le faisait donc disparaître pour de bon. La plateforme ne
     * pouvait plus ni le relire ni le rouvrir.
     */
    const archives = req.query.archived === "true";

    const where: any = { archivedAt: archives ? { not: null } : null };
    if (status) where.status = status;
    if (priority) where.priority = versPrioriteStockee(priority);

    const [tickets, total] = await Promise.all([
      db.merchantTicket.findMany({
        where,
        skip: offset,
        take: limit,
        include: {
          org: {
            select: {
              name: true,
              email: true,
              memberships: {
                take: 1,
                include: { user: { select: { email: true } } },
              },
            },
          },
          _count: { select: { messages: true } },
        },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      }),
      db.merchantTicket.count({ where }),
    ]);

    res.json({
      tickets: tickets.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: versPrioriteAffichee(t.priority),
        userEmail: t.org.email || t.org.memberships[0]?.user.email || t.org.name,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        // Pour que l'écran sache lequel est archivé, et depuis quand.
        archivedAt: t.archivedAt,
        organization: t.org.name,
        messageCount: t._count.messages,
      })),
      pagination: { total, limit, offset },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /superowner/support-tickets/:ticketId/status - Changer le statut
router.patch("/support-tickets/:ticketId/status", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticketId = req.params.ticketId as string;
    const schema = z.object({
      status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
    });
    const body = schema.parse(req.body);

    // Clore archive le ticket : sans cela, le commerçant le voyait encore actif
    // et sa réponse le rouvrait aussitôt.
    const { ticket, precedent } = await TicketMessageService.changerEtat(ticketId, body.status);

    await db.systemAuditLog.create({
      data: {
        adminId: req.userId as string,
        action: "UPDATE_TICKET_STATUS",
        target: ticketId,
        changes: { status: body.status } as any,
      },
    });

    if (precedent !== body.status) {
      await TicketMessageService.notifierChangementEtat(
        ticketId,
        "Votre ticket a changé d'état",
        `Ticket « ${ticket.title} » : ${LIBELLES_STATUT[body.status] || body.status}.`
      );
    }

    res.json({ success: true, ticket });
  } catch (err) {
    next(err);
  }
});

export default router;
