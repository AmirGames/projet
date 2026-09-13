import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../config/database";
import { ApiError } from "../middleware/errorHandler";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../config/logger";

const router = Router();

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

    const ticket = await prisma.merchantTicket.create({
      data: {
        orgId: body.orgId,
        title: body.subject,
        description: body.description,
        priority: body.priority,
        category: body.category,
        status: "OPEN",
      },
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

    const tickets = await prisma.merchantTicket.findMany({
      where: {
        orgId,
      },
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

    const ticket = await prisma.merchantTicket.findUnique({
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

    const ticket = await prisma.merchantTicket.update({
      where: { id },
      data: {
        status,
        resolvedAt: status === "RESOLVED" ? new Date() : null,
      },
    });

    res.json({
      message: "Statut du ticket mis à jour",
      data: ticket,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /support/tickets/:id - Delete ticket (protected)
router.delete("/tickets/:id", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const ticket = await prisma.merchantTicket.findUnique({
      where: { id },
    });

    if (!ticket) {
      throw new ApiError(404, "Ticket non trouvé", "NOT_FOUND");
    }

    logger.info("Deleting support ticket", { id });

    await prisma.merchantTicket.delete({
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
