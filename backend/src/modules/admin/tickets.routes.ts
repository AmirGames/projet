import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { authMiddleware } from "../auth/auth.middleware";
import { TicketMessageService } from "../support/ticket-message.service";
import { getQueryString, isSystemAdmin } from "./shared";
import { limiteBornee, decalage } from "../../utils/pagination";

const router = Router();

const LIBELLES_STATUT_TICKET: Record<string, string> = {
  OPEN: "rouvert",
  IN_PROGRESS: "pris en charge par le support",
  RESOLVED: "résolu",
  CLOSED: "clôturé",
};

const LIBELLES_PRIORITE_TICKET: Record<string, string> = {
  LOW: "basse",
  MEDIUM: "normale",
  HIGH: "haute",
  CRITICAL: "urgente",
};

router.get("/tickets", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = limiteBornee(req.query.limit, 20, 200);
    const offset = decalage(req.query.offset);
    const status = getQueryString(req.query.status, "");
    const priority = getQueryString(req.query.priority, "");

    const archived = getQueryString(req.query.archived, "") === "true";

    const where: any = { archivedAt: archived ? { not: null } : null };
    if (status) where.status = status;
    if (priority) where.priority = priority;

    const tickets = (await db.merchantTicket.findMany({
      where,
      skip: offset,
      take: limit,
      include: {
        org: { select: { id: true, name: true } },
        _count: { select: { messages: true } },
      },
      orderBy: [
        { priority: "desc" },
        { createdAt: "desc" },
      ],
    })) as any[];

    const total = await db.merchantTicket.count({ where });

    res.json({
      tickets,
      pagination: { total, limit, offset },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /admin/tickets/:ticketId - Update ticket
router.patch("/tickets/:ticketId", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticketId = req.params.ticketId as string;
    const schema = z.object({
      status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
      priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
    });

    const body = schema.parse(req.body);
    const adminId = (req as any).userId;

    const avant = await db.merchantTicket.findUnique({
      where: { id: ticketId },
      select: { status: true, priority: true },
    });

    if (!avant) {
      throw new ApiError(404, "Ticket introuvable", "NOT_FOUND");
    }

    const ticket = await db.merchantTicket.update({
      where: { id: ticketId },
      data: {
        ...body,
        resolvedAt: body.status === "RESOLVED" ? new Date() : undefined,
      },
      include: { org: true },
    });

    await db.systemAuditLog.create({
      data: {
        adminId,
        action: "UPDATE_TICKET",
        target: ticketId,
        changes: body as any,
      },
    });

    // Le commerçant est prévenu du changement, comme d'une réponse.
    const changements: string[] = [];
    if (body.status && body.status !== avant.status) {
      changements.push(LIBELLES_STATUT_TICKET[body.status] || body.status);
    }
    if (body.priority && body.priority !== avant.priority) {
      changements.push(`priorité ${LIBELLES_PRIORITE_TICKET[body.priority] || body.priority}`);
    }

    if (changements.length > 0) {
      await TicketMessageService.notifierChangementEtat(
        ticketId,
        "Votre ticket a changé d'état",
        `Ticket « ${ticket.title} » : ${changements.join(", ")}.`
      );
    }

    res.json(ticket);
  } catch (err) {
    next(err);
  }
});

// GET /admin/tickets/:ticketId/messages - Conversation du ticket
router.get("/tickets/:ticketId/messages", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticketId = req.params.ticketId as string;
    const messages = await TicketMessageService.list(ticketId);

    res.json({ data: messages, count: messages.length });
  } catch (err) {
    next(err);
  }
});

// POST /admin/tickets/:ticketId/messages - Répondre au commerçant
router.post("/tickets/:ticketId/messages", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticketId = req.params.ticketId as string;
    const schema = z.object({ body: z.string().min(1, "Message requis") });
    const body = schema.parse(req.body);

    const message = await TicketMessageService.add({
      ticketId,
      authorId: (req as any).userId,
      authorRole: "ADMIN",
      body: body.body,
    });

    res.status(201).json({ message: "Réponse envoyée", data: message });
  } catch (err) {
    next(err);
  }
});

// POST /admin/tickets/:ticketId/archive - Archiver un ticket fermé
router.post("/tickets/:ticketId/archive", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticketId = req.params.ticketId as string;
    const adminId = (req as any).userId;

    const ticket = await TicketMessageService.archive(ticketId);

    await db.systemAuditLog.create({
      data: {
        adminId,
        action: "ARCHIVE_TICKET",
        target: ticketId,
        changes: {} as any,
      },
    });

    res.json({ message: "Ticket archivé", data: ticket });
  } catch (err) {
    next(err);
  }
});

// POST /admin/tickets/:ticketId/unarchive - Sortir un ticket des archives
router.post("/tickets/:ticketId/unarchive", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticketId = req.params.ticketId as string;
    const ticket = await TicketMessageService.unarchive(ticketId);

    res.json({ message: "Ticket désarchivé", data: ticket });
  } catch (err) {
    next(err);
  }
});

// GET /admin/tickets/:ticketId - Détail d'un ticket
router.get("/tickets/:ticketId", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticketId = req.params.ticketId as string;

    const ticket = await db.merchantTicket.findUnique({
      where: { id: ticketId },
      include: {
        org: { select: { id: true, name: true, email: true, status: true } },
        messages: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!ticket) {
      throw new ApiError(404, "Ticket introuvable", "NOT_FOUND");
    }

    res.json({ ticket });
  } catch (err) {
    next(err);
  }
});

export default router;
