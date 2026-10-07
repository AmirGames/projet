import { Router } from "express";
import { z } from "zod";
import { db } from "../../services/db";
import { limiterCadence } from "../../middleware/throttle";
import { authMiddleware } from "../auth/auth.middleware";
import { journaliser } from "../superowner/shared";
import { adminAuthSection, validateRequest } from "./zupdrive-garde";
import { ZupDriveSupportService } from "./zupdrive-support.service";

const router = Router();

/** Administration du support : section « courses-drive » de la plateforme DRIVE. */
const adminAuth = adminAuthSection("courses-drive");

// Création de tickets et messages : par compte, pour qu'un compte ne noie pas le support.
const limiterTickets = limiterCadence({ nom: "zupdrive-support-tickets", max: 10, fenetreMs: 3_600_000, cle: (req) => `${req.userId}` });
const limiterMessages = limiterCadence({ nom: "zupdrive-support-messages", max: 30, fenetreMs: 60_000, cle: (req) => `${req.userId}` });

/** Une pièce jointe se charge depuis une adresse https, jamais un autre schéma. */
const urlHttps = z.string().url().max(2000).refine((u) => u.startsWith("https://"), "https requis");

const idSchema = z.string().min(1);

const filtresTicketsSchema = z.object({
  status: z.enum(["OUVERT", "EN_COURS", "EN_ATTENTE_CLIENT", "RESOLU", "FERME"]).optional(),
  priority: z.enum(["BASSE", "MOYENNE", "HAUTE", "CRITIQUE"]).optional(),
  category: z.enum(["TECHNIQUE", "PAIEMENT", "INFRACTION", "DOCUMENT", "AUTRE"]).optional(),
  assignedTo: z.string().optional(),
  reporterId: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

/**
 * POST /api/zupdrive/support/tickets
 * Ouvrir un ticket de support. Authentification : jeton de tout compte.
 * Le déclarant est le compte du jeton ; son type est CHAUFFEUR s'il a un dossier
 * chauffeur, PASSAGER sinon (jamais lu dans le corps).
 */
router.post(
  "/tickets",
  authMiddleware,
  limiterTickets,
  validateRequest({
    body: z.object({
      category: z.enum(["TECHNIQUE", "PAIEMENT", "INFRACTION", "DOCUMENT", "AUTRE"]),
      priority: z.enum(["BASSE", "MOYENNE", "HAUTE", "CRITIQUE"]),
      subject: z.string().min(5).max(200),
      description: z.string().min(10).max(2000),
    }),
  }),
  async (req, res, next) => {
    try {
      const userId = req.userId as string;
      const chauffeur = await db.chauffeurDrive.findUnique({ where: { userId }, select: { id: true } });
      const ticket = await ZupDriveSupportService.createTicket({
        ...req.body,
        reporterId: userId,
        reporterType: chauffeur ? "CHAUFFEUR" : "PASSAGER",
      });
      res.status(201).json(ticket);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/zupdrive/support/tickets
 * Mes tickets (ceux que le compte du jeton a ouverts).
 */
router.get(
  "/tickets",
  authMiddleware,
  validateRequest({
    query: z.object({
      limit: z.coerce.number().int().min(1).max(100).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    }),
  }),
  async (req, res, next) => {
    try {
      const { limit, offset } = req.query as unknown as { limit: number; offset: number };
      res.json(await ZupDriveSupportService.listMyTickets(req.userId as string, limit, offset));
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/zupdrive/support/tickets/:id
 * Un de mes tickets avec ses messages (404 si le ticket est celui d'un autre).
 */
router.get("/tickets/:id", authMiddleware, async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    res.json(await ZupDriveSupportService.getMyTicket(req.userId as string, id));
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/zupdrive/admin/support/tickets
 * Lister tous les tickets avec filtres (admin uniquement)
 */
router.get(
  "/admin/tickets",
  ...adminAuth,
  validateRequest({ query: filtresTicketsSchema }),
  async (req, res, next) => {
    try {
      const result = await ZupDriveSupportService.listTickets(req.query as unknown as z.infer<typeof filtresTicketsSchema>);
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
router.get("/admin/tickets/:id", ...adminAuth, async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
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
  ...adminAuth,
  validateRequest({
    body: z.object({
      agentId: z.string(),
    }),
  }),
  async (req, res, next) => {
    try {
      const id = idSchema.parse(req.params.id);
      const { agentId } = req.body;
      await ZupDriveSupportService.assignTicket(id, agentId);
      await journaliser(req, "ZUPDRIVE_SUPPORT_ASSIGN", id, { agentId });
      res.json({ success: true, message: "Ticket assigné" });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/zupdrive/support/tickets/:id/messages
 * Ajouter un message à mon ticket. L'auteur est le compte du jeton (jamais le
 * corps) ; le ticket d'un autre compte répond 404.
 */
router.post(
  "/tickets/:id/messages",
  authMiddleware,
  limiterMessages,
  validateRequest({
    body: z.object({
      message: z.string().min(1).max(5000),
      attachmentUrl: urlHttps.optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const id = idSchema.parse(req.params.id);
      const { message, attachmentUrl } = req.body;

      const supportMessage = await ZupDriveSupportService.addReporterMessage({
        userId: req.userId as string,
        ticketId: id,
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
 * POST /api/zupdrive/support/admin/tickets/:id/messages
 * Réponse de l'équipe (section « courses-drive »). Auteur = le compte du jeton, type AGENT.
 */
router.post(
  "/admin/tickets/:id/messages",
  ...adminAuth,
  validateRequest({
    body: z.object({
      message: z.string().min(1).max(5000),
      attachmentUrl: urlHttps.optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const id = idSchema.parse(req.params.id);
      const { message, attachmentUrl } = req.body;

      const supportMessage = await ZupDriveSupportService.addMessage({
        ticketId: id,
        authorId: req.userId as string,
        authorType: "AGENT",
        message,
        attachmentUrl,
      });
      await journaliser(req, "ZUPDRIVE_SUPPORT_REPLY", id, { messageId: supportMessage.id });

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
  ...adminAuth,
  validateRequest({
    body: z.object({
      status: z.enum(["OUVERT", "EN_COURS", "EN_ATTENTE_CLIENT", "RESOLU", "FERME"]),
      resolution: z.string().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const id = idSchema.parse(req.params.id);
      const { status, resolution } = req.body;
      await ZupDriveSupportService.updateTicketStatus(id, status, resolution);
      await journaliser(req, "ZUPDRIVE_SUPPORT_SET_STATUS", id, { apres: status, resolution });
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
  ...adminAuth,
  validateRequest({
    body: z.object({
      newPriority: z.enum(["MOYENNE", "HAUTE", "CRITIQUE"]),
    }),
  }),
  async (req, res, next) => {
    try {
      const id = idSchema.parse(req.params.id);
      const { newPriority } = req.body;
      await ZupDriveSupportService.escalateTicket(id, newPriority);
      await journaliser(req, "ZUPDRIVE_SUPPORT_ESCALATE", id, { apres: newPriority });
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
  ...adminAuth,
  validateRequest({
    body: z.object({
      resolution: z.string().min(10).max(2000),
    }),
  }),
  async (req, res, next) => {
    try {
      const id = idSchema.parse(req.params.id);
      const { resolution } = req.body;
      await ZupDriveSupportService.closeTicket(id, resolution);
      await journaliser(req, "ZUPDRIVE_SUPPORT_CLOSE", id, { apres: "FERME", resolution });
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
router.get("/admin/metrics", ...adminAuth, async (_req, res, next) => {
  try {
    const metrics = await ZupDriveSupportService.getSupportMetrics();
    res.json(metrics);
  } catch (error) {
    next(error);
  }
});

export default router;
