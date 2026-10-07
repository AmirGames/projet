import { Router } from "express";
import { z } from "zod";
import { validateRequest } from "../../middleware/validation";
import { adminAuth } from "../../middleware/auth";
import { ZupDriveSupportService } from "./zupdrive-support.service";

const router = Router();

/**
 * POST /api/zupdrive/support/tickets
 * Créer un nouveau ticket de support
 */
router.post(
  "/tickets",
  validateRequest({
    body: z.object({
      category: z.enum(["TECHNIQUE", "PAIEMENT", "INFRACTION", "DOCUMENT", "AUTRE"]),
      priority: z.enum(["BASSE", "MOYENNE", "HAUTE", "CRITIQUE"]),
      subject: z.string().min(5).max(200),
      description: z.string().min(10).max(2000),
      reporterId: z.string(),
      reporterType: z.enum(["CHAUFFEUR", "PASSAGER", "ADMIN"]),
    }),
  }),
  async (req, res, next) => {
    try {
      const ticket = await ZupDriveSupportService.createTicket(req.body);
      res.status(201).json(ticket);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/zupdrive/admin/support/tickets
 * Lister tous les tickets avec filtres (admin uniquement)
 */
router.get(
  "/admin/tickets",
  adminAuth,
  validateRequest({
    query: z.object({
      status: z.enum(["OUVERT", "EN_COURS", "EN_ATTENTE_CLIENT", "RESOLU", "FERME"]).optional(),
      priority: z.enum(["BASSE", "MOYENNE", "HAUTE", "CRITIQUE"]).optional(),
      category: z.enum(["TECHNIQUE", "PAIEMENT", "INFRACTION", "DOCUMENT", "AUTRE"]).optional(),
      assignedTo: z.string().optional(),
      reporterId: z.string().optional(),
      limit: z.coerce.number().min(1).max(100).optional().default("50"),
      offset: z.coerce.number().min(0).optional().default("0"),
    }),
  }),
  async (req, res, next) => {
    try {
      const result = await ZupDriveSupportService.listTickets(req.query as any);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/zupdrive/admin/support/tickets/:id
 * Récupérer un ticket avec ses messages
 */
router.get("/admin/tickets/:id", adminAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const ticket = await ZupDriveSupportService.getTicketWithMessages(id);
    res.json(ticket);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/zupdrive/admin/support/tickets/:id/assign
 * Assigner un ticket à un agent
 */
router.post(
  "/admin/tickets/:id/assign",
  adminAuth,
  validateRequest({
    body: z.object({
      agentId: z.string(),
    }),
  }),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { agentId } = req.body;
      await ZupDriveSupportService.assignTicket(id, agentId);
      res.json({ success: true, message: "Ticket assigné" });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/zupdrive/support/tickets/:id/messages
 * Ajouter un message au ticket
 */
router.post(
  "/tickets/:id/messages",
  validateRequest({
    body: z.object({
      authorId: z.string(),
      authorType: z.enum(["CHAUFFEUR", "PASSAGER", "AGENT", "ADMIN"]),
      message: z.string().min(1).max(5000),
      attachmentUrl: z.string().url().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { authorId, authorType, message, attachmentUrl } = req.body;

      const supportMessage = await ZupDriveSupportService.addMessage({
        ticketId: id,
        authorId,
        authorType,
        message,
        attachmentUrl,
      });

      res.status(201).json(supportMessage);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/zupdrive/admin/support/tickets/:id/status
 * Mettre à jour le statut d'un ticket
 */
router.patch(
  "/admin/tickets/:id/status",
  adminAuth,
  validateRequest({
    body: z.object({
      status: z.enum(["OUVERT", "EN_COURS", "EN_ATTENTE_CLIENT", "RESOLU", "FERME"]),
      resolution: z.string().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { status, resolution } = req.body;
      await ZupDriveSupportService.updateTicketStatus(id, status, resolution);
      res.json({ success: true, message: "Statut mis à jour" });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/zupdrive/admin/support/tickets/:id/escalate
 * Escalader un ticket (augmenter la priorité)
 */
router.post(
  "/admin/tickets/:id/escalate",
  adminAuth,
  validateRequest({
    body: z.object({
      newPriority: z.enum(["MOYENNE", "HAUTE", "CRITIQUE"]),
    }),
  }),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { newPriority } = req.body;
      await ZupDriveSupportService.escalateTicket(id, newPriority);
      res.json({ success: true, message: "Ticket escaladé" });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/zupdrive/admin/support/tickets/:id/close
 * Fermer un ticket
 */
router.post(
  "/admin/tickets/:id/close",
  adminAuth,
  validateRequest({
    body: z.object({
      resolution: z.string().min(10).max(2000),
    }),
  }),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { resolution } = req.body;
      await ZupDriveSupportService.closeTicket(id, resolution);
      res.json({ success: true, message: "Ticket fermé" });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/zupdrive/admin/support/metrics
 * Récupérer les métriques de support (derniers 30 jours)
 */
router.get("/admin/metrics", adminAuth, async (req, res, next) => {
  try {
    const metrics = await ZupDriveSupportService.getSupportMetrics();
    res.json(metrics);
  } catch (error) {
    next(error);
  }
});

export default router;
