import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";
import { logger } from "../config/logger";
import { emitWebhook } from "./webhook.service";
import { emitNotification } from "../config/socket";

export type TicketAuthorRole = "MERCHANT" | "ADMIN";

export class TicketMessageService {
  static async list(ticketId: string) {
    const ticket = await db.merchantTicket.findUnique({ where: { id: ticketId } });

    if (!ticket) {
      throw new ApiError(404, "Ticket non trouvé", "NOT_FOUND");
    }

    return db.ticketMessage.findMany({
      where: { ticketId },
      orderBy: { createdAt: "asc" },
    });
  }

  static async add(params: {
    ticketId: string;
    authorId: string;
    authorRole: TicketAuthorRole;
    body: string;
  }) {
    const ticket = await db.merchantTicket.findUnique({
      where: { id: params.ticketId },
      include: { org: { select: { id: true, name: true } } },
    });

    if (!ticket) {
      throw new ApiError(404, "Ticket non trouvé", "NOT_FOUND");
    }

    // Un ticket clos est archivé : il n'accepte plus de message. Répondre le
    // rouvrait, et il ne restait jamais clos.
    if (ticket.status === "CLOSED" || ticket.archivedAt) {
      throw new ApiError(
        400,
        "Ce ticket est clos. Ouvrez-en un nouveau pour poursuivre l'échange.",
        "TICKET_ARCHIVED"
      );
    }

    const author = await db.user.findUnique({
      where: { id: params.authorId },
      select: { id: true, name: true, email: true },
    });

    if (!author) {
      throw new ApiError(404, "Auteur non trouvé", "NOT_FOUND");
    }

    const message = await db.ticketMessage.create({
      data: {
        ticketId: params.ticketId,
        authorId: author.id,
        authorName: author.name || author.email,
        authorRole: params.authorRole,
        body: params.body,
      },
    });

    // Une réponse rouvre un ticket résolu : « ça ne marche toujours pas » doit
    // pouvoir relancer l'échange. Un ticket clos, lui, n'arrive jamais ici.
    if (ticket.status === "RESOLVED") {
      await db.merchantTicket.update({
        where: { id: ticket.id },
        data: { status: "IN_PROGRESS", resolvedAt: null },
      });
    }

    await this.notifyCounterpart(ticket, params.authorRole, author.email);

    emitWebhook("ticket.message", {
      ticketId: ticket.id,
      title: ticket.title,
      orgId: ticket.orgId,
      authorRole: params.authorRole,
    });

    logger.info("Ticket message added", {
      ticketId: params.ticketId,
      authorRole: params.authorRole,
    });

    return message;
  }

  /**
   * Prévient le commerçant qu'un de ses tickets a changé d'état.
   *
   * Un changement de statut ou de priorité est une information qu'il attend :
   * sans notification, il doit rouvrir la page pour s'en apercevoir.
   */
  static async notifierChangementEtat(
    ticketId: string,
    titreNotification: string,
    corps: string
  ) {
    const ticket = await db.merchantTicket.findUnique({
      where: { id: ticketId },
      select: { id: true, title: true, orgId: true },
    });

    if (!ticket) return;

    const memberships = await db.membership.findMany({
      where: { orgId: ticket.orgId },
      include: { user: { select: { email: true } } },
    });

    const destinataires = [...new Set(memberships.map((m) => m.user.email))];

    if (destinataires.length === 0) return;

    const lien = `/merchant/${ticket.orgId}/support`;

    await db.notification.createMany({
      data: destinataires.map((email) => ({
        type: "TICKET_MESSAGE" as const,
        title: titreNotification,
        message: corps,
        recipientEmail: email,
        link: lien,
      })),
    });

    const creees = await db.notification.findMany({
      where: { recipientEmail: { in: destinataires }, type: "TICKET_MESSAGE", isRead: false },
      orderBy: { createdAt: "desc" },
      take: destinataires.length,
    });

    for (const notification of creees) {
      emitNotification(notification.recipientEmail, notification);
    }
  }


  /**
   * Prévient la plateforme qu'un commerçant vient d'ouvrir un ticket.
   *
   * Sans cela, un ticket créé n'apparaissait que pour qui pensait à ouvrir la
   * page du support : un commerçant bloqué pouvait attendre des jours sans que
   * personne ne le sache.
   */
  static async notifierOuvertureDeTicket(ticketId: string) {
    const ticket = await db.merchantTicket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        title: true,
        priority: true,
        orgId: true,
        org: { select: { name: true } },
      },
    });

    if (!ticket) return;

    const plateforme = await db.user.findMany({
      where: {
        OR: [{ isSuperOwner: true }, { isSystemAdmin: true }],
        status: "ACTIVE",
      },
      select: { email: true },
    });

    const destinataires = [...new Set(plateforme.map((u) => u.email))];
    if (destinataires.length === 0) return;

    const titre = `Nouveau ticket — ${ticket.org?.name || "un commerçant"}`;
    const corps = `${ticket.title} (priorité ${ticket.priority})`;
    const lien = `/superowner/support-tickets`;

    await db.notification.createMany({
      data: destinataires.map((email) => ({
        type: "TICKET_MESSAGE" as const,
        title: titre,
        message: corps,
        recipientEmail: email,
        link: lien,
        // Un ticket critique doit se distinguer dans la liste.
        priority: ticket.priority === "HIGH" ? "HIGH" : "MEDIUM",
      })),
    });

    const creees = await db.notification.findMany({
      where: { recipientEmail: { in: destinataires }, title: titre, isRead: false },
      orderBy: { createdAt: "desc" },
      take: destinataires.length,
    });

    for (const notification of creees) {
      emitNotification(notification.recipientEmail, notification);
    }
  }

  // Prévient l'autre partie : le marchand quand un admin répond, les admins sinon.
  private static async notifyCounterpart(
    ticket: { id: string; title: string; orgId: string },
    authorRole: TicketAuthorRole,
    authorEmail: string
  ) {
    let recipients: string[] = [];
    let link: string;

    if (authorRole === "ADMIN") {
      const memberships = await db.membership.findMany({
        where: { orgId: ticket.orgId },
        include: { user: { select: { email: true } } },
      });
      recipients = memberships.map((m) => m.user.email);
      link = `/merchant/${ticket.orgId}/support`;
    } else {
      const admins = await db.user.findMany({
        where: { OR: [{ isSystemAdmin: true }, { isSuperOwner: true }] },
        select: { email: true },
      });
      recipients = admins.map((a) => a.email);
      link = `/super-admin/tickets`;
    }

    const unique = [...new Set(recipients)].filter((email) => email !== authorEmail);

    if (unique.length === 0) return;

    // createMany ne renvoie pas les lignes créées : on les relit pour pouvoir
    // les pousser telles quelles aux destinataires connectés.
    await db.notification.createMany({
      data: unique.map((email) => ({
        type: "TICKET_MESSAGE" as const,
        title: "Nouvelle réponse à un ticket",
        message: `Ticket « ${ticket.title} » : nouveau message.`,
        recipientEmail: email,
        link,
      })),
    });

    const creees = await db.notification.findMany({
      where: { recipientEmail: { in: unique }, type: "TICKET_MESSAGE", isRead: false },
      orderBy: { createdAt: "desc" },
      take: unique.length,
    });

    for (const notification of creees) {
      emitNotification(notification.recipientEmail, notification);
    }
  }

  /**
   * Changer l'état d'un ticket.
   *
   * Clore un ticket l'archive. Sans cela, le commerçant continuait de le voir
   * parmi ses tickets actifs et pouvait y écrire — sa réponse le rouvrait
   * aussitôt, si bien qu'un ticket clos ne le restait jamais. Un échange fini
   * est fini : pour reprendre, on ouvre un nouveau ticket.
   *
   * « Résolu » reste distinct : le commerçant peut répondre « ça ne marche
   * toujours pas », et le ticket repart. C'est la clôture qui ferme la porte.
   */
  static async changerEtat(ticketId: string, statut: string) {
    const ticket = await db.merchantTicket.findUnique({ where: { id: ticketId } });

    if (!ticket) {
      throw new ApiError(404, "Ticket non trouvé", "NOT_FOUND");
    }

    const clos = statut === "CLOSED";

    const misAJour = await db.merchantTicket.update({
      where: { id: ticketId },
      data: {
        status: statut,
        resolvedAt: statut === "RESOLVED" ? new Date() : null,
        // Rouvrir un ticket archivé le sort de l'archive : sinon il resterait
        // muet, ouvert et sans réponse possible.
        archivedAt: clos ? ticket.archivedAt ?? new Date() : null,
      },
    });

    logger.info("Ticket status changed", { ticketId, statut, archive: clos });

    return { ticket: misAJour, precedent: ticket.status };
  }

  static async archive(ticketId: string) {
    const ticket = await db.merchantTicket.findUnique({ where: { id: ticketId } });

    if (!ticket) {
      throw new ApiError(404, "Ticket non trouvé", "NOT_FOUND");
    }

    if (ticket.status !== "CLOSED") {
      throw new ApiError(
        400,
        "Seul un ticket fermé peut être archivé",
        "TICKET_NOT_CLOSED"
      );
    }

    if (ticket.archivedAt) {
      throw new ApiError(400, "Ce ticket est déjà archivé", "ALREADY_ARCHIVED");
    }

    logger.info("Archiving ticket", { ticketId });

    return db.merchantTicket.update({
      where: { id: ticketId },
      data: { archivedAt: new Date() },
    });
  }

  static async unarchive(ticketId: string) {
    const ticket = await db.merchantTicket.findUnique({ where: { id: ticketId } });

    if (!ticket) {
      throw new ApiError(404, "Ticket non trouvé", "NOT_FOUND");
    }

    if (!ticket.archivedAt) {
      throw new ApiError(400, "Ce ticket n'est pas archivé", "NOT_ARCHIVED");
    }

    return db.merchantTicket.update({
      where: { id: ticketId },
      data: { archivedAt: null },
    });
  }
}
