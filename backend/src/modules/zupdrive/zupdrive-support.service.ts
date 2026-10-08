import type { Prisma } from "@prisma/client";
import { db } from "../../services/db";
import { logger } from "../../config/logger";
import { ApiError } from "../../middleware/api-error";

/**
 * Système de support pour ZupDrive.
 * Gestion des tickets de support, catégories, priorités, assignation d'agents.
 */

import type { SupportMessage as SupportMessageRow, SupportTicket as SupportTicketRow } from "@prisma/client";

export interface SupportTicket {
  id: string;
  ticketNumber: string;
  /** TECHNIQUE, PAIEMENT, INFRACTION, DOCUMENT ou AUTRE (colonne texte). */
  category: string;
  /** BASSE, MOYENNE, HAUTE ou CRITIQUE. */
  priority: string;
  subject: string;
  description: string;
  /** OUVERT, EN_COURS, EN_ATTENTE_CLIENT, RESOLU ou FERME. */
  status: string;
  reporterId: string;
  reporterType: string;
  assignedTo?: string; // Agent de support ID
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
  resolution?: string;
}

export interface SupportMessage {
  id: string;
  ticketId: string;
  authorId: string;
  authorType: string;
  message: string;
  attachmentUrl?: string;
  createdAt: Date;
}

export interface SupportMetrics {
  totalTickets: number;
  openTickets: number;
  avgResolutionTime: number; // heures
  avgFirstResponseTime: number; // heures
  resolutionRate: number; // %
  satisfactionScore?: number; // 1-5
}

export class ZupDriveSupportService {
  /**
   * Créer un nouveau ticket de support.
   */
  static async createTicket(data: {
    category: "TECHNIQUE" | "PAIEMENT" | "INFRACTION" | "DOCUMENT" | "AUTRE";
    priority: "BASSE" | "MOYENNE" | "HAUTE" | "CRITIQUE";
    subject: string;
    description: string;
    reporterId: string;
    reporterType: "CHAUFFEUR" | "PASSAGER" | "ADMIN";
  }): Promise<SupportTicket> {
    // Générer un numéro de ticket unique
    const ticketNumber = `SUP-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    const ticket = await db.supportTicket.create({
      data: {
        ticketNumber,
        category: data.category,
        priority: data.priority,
        subject: data.subject,
        description: data.description,
        reporterId: data.reporterId,
        reporterType: data.reporterType,
        status: "OUVERT",
      },
    });

    logger.info(`Support ticket created: ${ticketNumber} by ${data.reporterType}`);
    return this.formatTicket(ticket);
  }

  /**
   * Lister les tickets avec filtres et pagination.
   */
  static async listTickets(filters: {
    status?: "OUVERT" | "EN_COURS" | "EN_ATTENTE_CLIENT" | "RESOLU" | "FERME";
    priority?: "BASSE" | "MOYENNE" | "HAUTE" | "CRITIQUE";
    category?: "TECHNIQUE" | "PAIEMENT" | "INFRACTION" | "DOCUMENT" | "AUTRE";
    assignedTo?: string;
    reporterId?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ tickets: SupportTicket[]; total: number }> {
    const limit = Math.min(filters.limit || 50, 100);
    const offset = filters.offset || 0;

    const where: Prisma.SupportTicketWhereInput = {};
    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;
    if (filters.category) where.category = filters.category;
    if (filters.assignedTo) where.assignedTo = filters.assignedTo;
    if (filters.reporterId) where.reporterId = filters.reporterId;

    const [tickets, total] = await Promise.all([
      db.supportTicket.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.supportTicket.count({ where }),
    ]);

    return {
      tickets: tickets.map((t) => this.formatTicket(t)),
      total,
    };
  }

  /**
   * Récupérer un ticket avec ses messages.
   */
  static async getTicketWithMessages(ticketId: string) {
    const ticket = await db.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) throw new ApiError(404, "Ticket non trouvé");

    const messages = await db.supportMessage.findMany({
      where: { ticketId },
      orderBy: { createdAt: "asc" },
    });

    return {
      ...this.formatTicket(ticket),
      messages: messages.map((m) => this.formatMessage(m)),
    };
  }

  /**
   * Les tickets d'un compte, les plus récents d'abord. Le compte vient du jeton :
   * on ne lit jamais que ce qu'il a lui-même ouvert.
   */
  static async listMyTickets(userId: string, limit = 50, offset = 0) {
    const where = { reporterId: userId };
    const [tickets, total] = await Promise.all([
      db.supportTicket.findMany({ where, orderBy: { createdAt: "desc" }, take: limit, skip: offset }),
      db.supportTicket.count({ where }),
    ]);
    return { tickets: tickets.map((t) => this.formatTicket(t)), total };
  }

  /** Un ticket du compte avec ses messages ; celui d'un autre compte est introuvable. */
  static async getMyTicket(userId: string, ticketId: string) {
    const ticket = await db.supportTicket.findFirst({ where: { id: ticketId, reporterId: userId } });
    if (!ticket) throw new ApiError(404, "Ticket non trouvé");

    const messages = await db.supportMessage.findMany({ where: { ticketId }, orderBy: { createdAt: "asc" } });
    return { ...this.formatTicket(ticket), messages: messages.map((m) => this.formatMessage(m)) };
  }

  /**
   * Ajouter un message à son propre ticket. Le ticket d'un autre compte est
   * introuvable ; l'auteur est le compte du jeton, avec le type du ticket.
   */
  static async addReporterMessage(data: {
    userId: string;
    ticketId: string;
    message: string;
    attachmentUrl?: string;
  }): Promise<SupportMessage> {
    const ticket = await db.supportTicket.findFirst({ where: { id: data.ticketId, reporterId: data.userId } });
    if (!ticket) throw new ApiError(404, "Ticket non trouvé");

    const authorType = (["CHAUFFEUR", "PASSAGER", "AGENT", "ADMIN"] as const).find((type) => type === ticket.reporterType);
    if (!authorType) throw new ApiError(422, "Type d'auteur du ticket inconnu");

    return this.addMessage({
      ticketId: ticket.id,
      authorId: data.userId,
      authorType,
      message: data.message,
      attachmentUrl: data.attachmentUrl,
    });
  }

  /**
   * Assigner un ticket à un agent de support.
   */
  static async assignTicket(ticketId: string, agentId: string): Promise<void> {
    const ticket = await db.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new ApiError(404, "Ticket non trouvé");

    await db.supportTicket.update({
      where: { id: ticketId },
      data: {
        assignedTo: agentId,
        status: "EN_COURS",
      },
    });

    logger.info(`Ticket ${ticketId} assigned to agent ${agentId}`);
  }

  /**
   * Ajouter un message à un ticket.
   */
  static async addMessage(data: {
    ticketId: string;
    authorId: string;
    authorType: "CHAUFFEUR" | "PASSAGER" | "AGENT" | "ADMIN";
    message: string;
    attachmentUrl?: string;
  }): Promise<SupportMessage> {
    const ticket = await db.supportTicket.findUnique({ where: { id: data.ticketId } });
    if (!ticket) throw new ApiError(404, "Ticket non trouvé");

    const supportMessage = await db.supportMessage.create({
      data: {
        ticketId: data.ticketId,
        authorId: data.authorId,
        authorType: data.authorType,
        message: data.message,
        attachmentUrl: data.attachmentUrl,
      },
    });

    // Marquer le ticket comme mis à jour
    await db.supportTicket.update({
      where: { id: data.ticketId },
      data: { updatedAt: new Date() },
    });

    logger.info(`Message added to ticket ${data.ticketId}`);
    return this.formatMessage(supportMessage);
  }

  /**
   * Mettre à jour le statut d'un ticket.
   */
  static async updateTicketStatus(
    ticketId: string,
    status: "OUVERT" | "EN_COURS" | "EN_ATTENTE_CLIENT" | "RESOLU" | "FERME",
    resolution?: string
  ): Promise<void> {
    const ticket = await db.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new ApiError(404, "Ticket non trouvé");

    const data: Prisma.SupportTicketUpdateInput = { status };
    if (status === "RESOLU" || status === "FERME") {
      data.resolvedAt = new Date();
      data.resolution = resolution;
    }

    await db.supportTicket.update({
      where: { id: ticketId },
      data,
    });

    logger.info(`Ticket ${ticketId} status updated to ${status}`);
  }

  /**
   * Escalade d'un ticket (augmenter la priorité).
   */
  static async escalateTicket(ticketId: string, newPriority: "MOYENNE" | "HAUTE" | "CRITIQUE"): Promise<void> {
    const ticket = await db.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new ApiError(404, "Ticket non trouvé");

    const priorityLevels = { BASSE: 0, MOYENNE: 1, HAUTE: 2, CRITIQUE: 3 };
    const currentLevel = priorityLevels[ticket.priority as "BASSE" | "MOYENNE" | "HAUTE" | "CRITIQUE"];
    const newLevel = priorityLevels[newPriority];

    if (newLevel <= currentLevel) {
      throw new ApiError(400, "La nouvelle priorité doit être plus élevée");
    }

    await db.supportTicket.update({
      where: { id: ticketId },
      data: { priority: newPriority },
    });

    logger.info(`Ticket ${ticketId} escalated to priority ${newPriority}`);
  }

  /**
   * Fermer un ticket avec résolution.
   */
  static async closeTicket(ticketId: string, resolution: string): Promise<void> {
    const ticket = await db.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new ApiError(404, "Ticket non trouvé");

    await db.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: "FERME",
        resolvedAt: new Date(),
        resolution,
      },
    });

    logger.info(`Ticket ${ticketId} closed with resolution`);
  }

  /**
   * Récupérer les métriques de support.
   */
  static async getSupportMetrics(): Promise<SupportMetrics> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const allTickets = await db.supportTicket.findMany({
      where: {
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    const openTickets = allTickets.filter((t) => t.status === "OUVERT" || t.status === "EN_COURS").length;
    const resolvedTickets = allTickets.filter((t) => t.status === "RESOLU" || t.status === "FERME");

    // Calculer le temps moyen de résolution
    const resolutionTimes = resolvedTickets
      .filter((t) => t.resolvedAt)
      .map((t) => (t.resolvedAt!.getTime() - t.createdAt.getTime()) / (1000 * 60 * 60)); // en heures
    const avgResolutionTime = resolutionTimes.length > 0 ? resolutionTimes.reduce((a, b) => a + b) / resolutionTimes.length : 0;

    // TODO: Calculer firstResponseTime depuis les messages
    const avgFirstResponseTime = 2; // placeholder

    return {
      totalTickets: allTickets.length,
      openTickets,
      avgResolutionTime,
      avgFirstResponseTime,
      resolutionRate: allTickets.length > 0 ? (resolvedTickets.length / allTickets.length) * 100 : 0,
    };
  }

  /**
   * Formater un ticket pour la réponse.
   */
  private static formatTicket(ticket: SupportTicketRow): SupportTicket {
    return {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      category: ticket.category,
      priority: ticket.priority,
      subject: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      reporterId: ticket.reporterId,
      reporterType: ticket.reporterType,
      assignedTo: ticket.assignedTo || undefined,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      resolvedAt: ticket.resolvedAt || undefined,
      resolution: ticket.resolution || undefined,
    };
  }

  /**
   * Formater un message pour la réponse.
   */
  private static formatMessage(message: SupportMessageRow): SupportMessage {
    return {
      id: message.id,
      ticketId: message.ticketId,
      authorId: message.authorId,
      authorType: message.authorType,
      message: message.message,
      attachmentUrl: message.attachmentUrl || undefined,
      createdAt: message.createdAt,
    };
  }
}
