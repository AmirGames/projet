import { createHash } from "crypto";
import type { NotificationAlert as AlerteDb, NotificationLog as JournalDb, NotificationTemplate as GabaritDb, Prisma } from "@prisma/client";
import { db } from "../../services/db";
import { logger } from "../../config/logger";
import { ApiError } from "../../middleware/api-error";
import { Outbox } from "../jobs/outbox.service";
import { EmailService } from "../notifications/email.service";
import { Notifier } from "../notifications/notifier.service";
import { TYPE_EMAIL_NOTIFICATION_ZUPDRIVE } from "../notifications/outbox-handlers";

/** Ordre des statuts d'une notification : un accusé ne peut que faire avancer. */
const RANG_STATUT: Record<string, number> = { PENDING: 0, SENT: 1, FAILED: 2, BOUNCED: 3 };

/**
 * Interpole les `{{variable}}` d'un gabarit, toutes les occurrences, en un seul
 * passage : une valeur qui contient elle-même `{{autre}}` n'est pas réinterprétée,
 * et la valeur est insérée telle quelle (une fonction de remplacement évite les
 * motifs spéciaux `$&`, `$1`… de String.replace). Variable inconnue : laissée telle quelle.
 */
export function interpoler(modele: string, variables: Record<string, string>): string {
  return modele.replaceAll(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (brut, nom: string) =>
    Object.hasOwn(variables, nom) ? String(variables[nom]) : brut
  );
}

const echapperHtml = (texte: string) =>
  texte.replaceAll(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** Message d'erreur borné, sans détail inutile, pour le journal. */
const resume = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 300);

const empreinte = (texte: string) => createHash("sha256").update(texte).digest("hex").slice(0, 32);

/** JSON à clés triées : le même contenu donne toujours la même clé d'idempotence. */
const jsonStable = (valeur: Record<string, string>) =>
  JSON.stringify(Object.fromEntries(Object.entries(valeur).sort(([a], [b]) => a.localeCompare(b))));

/**
 * Système de notifications pour ZupDrive.
 * Email, SMS, push notifications avec templates configurables et historique.
 *
 * Le journal (NotificationLog) dit la réalité : PENDING à la création, SENT
 * seulement après un envoi réussi, FAILED avec le motif sinon. L'e-mail passe
 * par l'outbox (durable, rejoué avec délai croissant) : il reste PENDING tant
 * qu'il n'est pas parti, et devient FAILED si l'outbox l'abandonne. SMS et push
 * partent aussitôt par le notifier. Un échec d'envoi ne lève jamais d'erreur :
 * la notification ne défait pas l'opération métier qui l'a déclenchée.
 */

export interface NotificationTemplate {
  id: string;
  key: string; // DOCUMENT_EXPIRED, INFRACTION_REPORTED, SUSPENSION_NOTICE, etc
  name: string;
  type: "EMAIL" | "SMS" | "PUSH";
  subject?: string; // Pour EMAIL
  body: string;
  variables: string[]; // ["driverName", "documentType", "expiryDate"]
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationLog {
  id: string;
  recipientId: string;
  recipientType: "CHAUFFEUR" | "PASSAGER" | "ADMIN";
  type: "EMAIL" | "SMS" | "PUSH";
  templateKey: string;
  status: "PENDING" | "SENT" | "FAILED" | "BOUNCED";
  recipient: string; // email, phone, or push token
  subject?: string;
  body: string;
  variables: Record<string, string>;
  errorMessage?: string;
  sentAt?: Date;
  failedAt?: Date;
  createdAt: Date;
}

export interface NotificationAlert {
  id: string;
  chauffeurId: string;
  type: "DOCUMENT_EXPIRY" | "INFRACTION_REPORTED" | "SUSPENSION" | "PAYMENT_ISSUE" | "RATING_LOW" | "CUSTOM";
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  message: string;
  triggerAction?: string; // URL ou action à prendre
  read: boolean;
  readAt?: Date;
  createdAt: Date;
}

export class ZupDriveNotificationsService {
  /**
   * Créer ou mettre à jour un template de notification.
   */
  static async upsertTemplate(data: {
    key: string;
    name: string;
    type: "EMAIL" | "SMS" | "PUSH";
    subject?: string;
    body: string;
    variables: string[];
    active: boolean;
  }): Promise<NotificationTemplate> {
    if (data.type === "EMAIL" && !data.subject) {
      throw new ApiError(400, "Subject requis pour templates EMAIL");
    }

    const template = await db.notificationTemplate.upsert({
      where: { key: data.key },
      update: {
        name: data.name,
        type: data.type,
        subject: data.subject,
        body: data.body,
        variables: JSON.stringify(data.variables),
        active: data.active,
      },
      create: {
        key: data.key,
        name: data.name,
        type: data.type,
        subject: data.subject,
        body: data.body,
        variables: JSON.stringify(data.variables),
        active: data.active,
      },
    });

    logger.info(`Notification template created/updated: ${data.key}`);
    return this.formatTemplate(template);
  }

  /**
   * Lister tous les templates.
   */
  static async listTemplates(activeOnly = true): Promise<NotificationTemplate[]> {
    const templates = await db.notificationTemplate.findMany({
      where: activeOnly ? { active: true } : {},
      orderBy: { createdAt: "desc" },
    });

    return templates.map((t) => this.formatTemplate(t));
  }

  /**
   * Obtenir un template spécifique.
   */
  static async getTemplate(key: string): Promise<NotificationTemplate> {
    const template = await db.notificationTemplate.findUnique({
      where: { key },
    });

    if (!template) throw new ApiError(404, `Template ${key} non trouvé`);
    return this.formatTemplate(template);
  }

  /**
   * Envoyer une notification (e-mail, SMS ou push).
   *
   * `dedupeKey` : le même événement demandé deux fois (rejeu, double appel) ne
   * produit qu'un journal et qu'un envoi ; le second appel rend le journal
   * existant, marqué `deduplicated`. Sans clé, chaque appel envoie.
   */
  static async sendNotification(data: {
    recipientId: string;
    recipientType: "CHAUFFEUR" | "PASSAGER" | "ADMIN";
    templateKey: string;
    type: "EMAIL" | "SMS" | "PUSH";
    recipient: string; // email, phone, or push token
    variables?: Record<string, string>;
    dedupeKey?: string;
  }): Promise<NotificationLog & { deduplicated?: boolean }> {
    const template = await db.notificationTemplate.findUnique({
      where: { key: data.templateKey },
    });

    if (!template || !template.active) {
      throw new ApiError(400, `Template ${data.templateKey} non trouvé ou inactif`);
    }

    const variables = data.variables || {};
    const body = interpoler(template.body, variables);
    const subject = template.subject ? interpoler(template.subject, variables) : "";

    const donnees = {
      recipientId: data.recipientId,
      recipientType: data.recipientType,
      type: data.type,
      templateKey: data.templateKey,
      status: "PENDING",
      recipient: data.recipient,
      subject,
      body,
      variables: JSON.stringify(variables),
      dedupeKey: data.dedupeKey ?? null,
    };

    let journal: JournalDb;
    try {
      if (data.type === "EMAIL") {
        // Le journal et l'intention d'envoi naissent ensemble : jamais de journal sans message à envoyer.
        journal = await db.$transaction(async (tx) => {
          const cree = await tx.notificationLog.create({ data: donnees });
          await Outbox.enregistrer(
            TYPE_EMAIL_NOTIFICATION_ZUPDRIVE,
            { logId: cree.id },
            { dedupeKey: `${TYPE_EMAIL_NOTIFICATION_ZUPDRIVE}:${cree.id}`, tx }
          );
          return cree;
        });
        logger.info(`Notification queued for ${data.recipientId} (EMAIL)`);
        return this.formatNotificationLog(journal);
      }
      journal = await db.notificationLog.create({ data: donnees });
    } catch (err) {
      if ((err as { code?: string })?.code === "P2002" && data.dedupeKey) {
        const existant = await db.notificationLog.findUnique({ where: { dedupeKey: data.dedupeKey } });
        if (existant) {
          logger.info(`Notification ${existant.id} déjà enregistrée (clé d'idempotence) : aucun nouvel envoi`);
          return { ...this.formatNotificationLog(existant), deduplicated: true };
        }
      }
      throw err;
    }

    // SMS et push : envoi immédiat. Le journal est posé avant, la clé d'idempotence tient donc même si
    // le processus s'arrête en plein envoi (au plus un envoi, jamais deux SMS facturés).
    let echec: string | null = null;
    try {
      if (data.type === "SMS") {
        if (!Notifier.canaux.sms) echec = "Canal SMS non configuré";
        else if (!(await Notifier.sms(data.recipient, body))) echec = "SMS refusé par le fournisseur ou numéro invalide";
      } else if ((await Notifier.expoPush([data.recipient], { title: subject || template.name, body, data: { tag: "zupdrive-notification", templateKey: data.templateKey } })) === 0) {
        echec = "Push refusé : jeton invalide ou appareil désinscrit";
      }
    } catch (err) {
      echec = resume(err);
    }

    const resultat = await this.marquerResultat(journal.id, echec);
    logger.info(`Notification ${echec ? "failed" : "sent"} to ${data.recipientId} (${data.type})`);
    return this.formatNotificationLog({ ...journal, ...resultat });
  }

  /**
   * PENDING → SENT (envoi réussi) ou FAILED (motif). Ne touche qu'un journal encore PENDING :
   * un accusé du fournisseur déjà arrivé (BOUNCED…) n'est jamais écrasé.
   */
  private static async marquerResultat(logId: string, echec: string | null) {
    const maintenant = new Date();
    const resultat = echec
      ? { status: "FAILED", failedAt: maintenant, errorMessage: echec }
      : { status: "SENT", sentAt: maintenant };
    await db.notificationLog.updateMany({ where: { id: logId, status: "PENDING" }, data: resultat });
    return resultat;
  }

  /**
   * Exécuté par l'outbox : envoie l'e-mail d'un journal PENDING.
   * Rejouable : un journal déjà SENT (ou clos) n'est jamais renvoyé. En cas
   * d'échec, le motif est noté et l'erreur relancée pour que l'outbox rejoue.
   */
  static async envoyerEmailDuJournal(logId: string): Promise<void> {
    const journal = await db.notificationLog.findUnique({ where: { id: logId } });
    if (!journal || journal.status !== "PENDING") return;

    try {
      await EmailService.sendEmail({
        to: journal.recipient,
        subject: journal.subject || "ZupDrive",
        text: journal.body,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1f2937"><p>${echapperHtml(journal.body).replaceAll("\n", "<br>")}</p></div>`,
      });
    } catch (err) {
      await db.notificationLog.updateMany({
        where: { id: logId, status: "PENDING" },
        data: { errorMessage: resume(err) },
      });
      throw err;
    }
    await this.marquerResultat(logId, null);
  }

  /** Appelé par l'outbox quand l'e-mail est abandonné après ses dernières tentatives. */
  static async marquerEmailEchoue(logId: string, motif: string): Promise<void> {
    await this.marquerResultat(logId, `E-mail non envoyé après plusieurs tentatives : ${motif}`.slice(0, 500));
  }

  /**
   * Envoyer une notification basée sur un événement métier.
   *
   * Canaux : e-mail (gabarit `KEY`), SMS (gabarit `KEY_SMS`) et push (gabarit
   * `KEY_PUSH`), chacun seulement s'il est utilisable (adresse, numéro + canal
   * configuré, appareil enregistré, gabarit actif). Un canal ignoré est rendu
   * dans `ignores`, avec son motif.
   *
   * Idempotence : la clé est dérivée de l'événement (type, chauffeur, variables)
   * ou fournie par l'appelant (`dedupeKey`). Le même document qui expire, avec
   * la même date, ne prévient qu'une fois ; un document renouvelé (autre date) prévient à nouveau.
   * Deux événements distincts aux variables identiques doivent porter des clés différentes.
   */
  static async triggerEventNotification(event: {
    type: "DOCUMENT_EXPIRY" | "INFRACTION_REPORTED" | "SUSPENSION" | "PAYMENT_ISSUE";
    chauffeurId: string;
    variables: Record<string, string>;
    dedupeKey?: string;
  }): Promise<{ logs: NotificationLog[]; ignores: Array<{ type: "EMAIL" | "SMS" | "PUSH"; motif: string }> }> {
    // L'email est porté par le compte utilisateur, pas par la fiche chauffeur.
    const chauffeur = await db.chauffeurDrive.findUnique({
      where: { id: event.chauffeurId },
      select: { userId: true, telephone: true, user: { select: { email: true } } },
    });

    if (!chauffeur) throw new ApiError(404, "Chauffeur non trouvé");

    // Mapper l'événement à un template
    const templateMap: Record<string, string> = {
      DOCUMENT_EXPIRY: "DOCUMENT_EXPIRED",
      INFRACTION_REPORTED: "INFRACTION_REPORTED",
      SUSPENSION: "SUSPENSION_NOTICE",
      PAYMENT_ISSUE: "PAYMENT_ISSUE_ALERT",
    };

    const templateKey = templateMap[event.type];
    const resultat: { logs: NotificationLog[]; ignores: Array<{ type: "EMAIL" | "SMS" | "PUSH"; motif: string }> } = {
      logs: [],
      ignores: [],
    };
    if (!templateKey) return resultat;

    const base = event.dedupeKey ?? `${event.type}:${event.chauffeurId}:${empreinte(jsonStable(event.variables))}`;
    const envoyer = async (type: "EMAIL" | "SMS" | "PUSH", cle: string, recipient: string, gabarit: string) => {
      const journal = await this.sendNotification({
        recipientId: event.chauffeurId,
        recipientType: "CHAUFFEUR",
        templateKey: gabarit,
        type,
        recipient,
        variables: event.variables,
        dedupeKey: `event:${base}:${cle}`,
      });
      resultat.logs.push(journal);
    };

    // E-mail : le canal de référence (gabarit obligatoire, comme avant).
    if (chauffeur.user.email) {
      await envoyer("EMAIL", "EMAIL", chauffeur.user.email, templateKey);
    } else {
      resultat.ignores.push({ type: "EMAIL", motif: "Aucune adresse e-mail sur le compte" });
    }

    // SMS et push : facultatifs, jamais bloquants pour l'e-mail ni pour l'opération qui déclenche.
    const gabarits = new Set(
      (
        await db.notificationTemplate.findMany({
          where: { key: { in: [`${templateKey}_SMS`, `${templateKey}_PUSH`] }, active: true },
          select: { key: true },
        })
      ).map((g) => g.key)
    );

    try {
      if (!gabarits.has(`${templateKey}_SMS`)) resultat.ignores.push({ type: "SMS", motif: "Aucun gabarit SMS actif" });
      else if (!chauffeur.telephone) resultat.ignores.push({ type: "SMS", motif: "Aucun numéro de téléphone" });
      else if (!Notifier.canaux.sms) resultat.ignores.push({ type: "SMS", motif: "Canal SMS non configuré" });
      else await envoyer("SMS", "SMS", chauffeur.telephone, `${templateKey}_SMS`);
    } catch (err) {
      logger.warn("ZupDrive notification SMS impossible", { chauffeurId: event.chauffeurId, error: resume(err) });
      resultat.ignores.push({ type: "SMS", motif: resume(err) });
    }

    try {
      if (!gabarits.has(`${templateKey}_PUSH`)) {
        resultat.ignores.push({ type: "PUSH", motif: "Aucun gabarit push actif" });
      } else {
        const appareils = await db.pushDevice.findMany({ where: { userId: chauffeur.userId }, select: { token: true } });
        if (appareils.length === 0) resultat.ignores.push({ type: "PUSH", motif: "Aucun appareil enregistré" });
        for (const { token } of appareils) await envoyer("PUSH", `PUSH:${empreinte(token)}`, token, `${templateKey}_PUSH`);
      }
    } catch (err) {
      logger.warn("ZupDrive notification push impossible", { chauffeurId: event.chauffeurId, error: resume(err) });
      resultat.ignores.push({ type: "PUSH", motif: resume(err) });
    }

    return resultat;
  }

  /**
   * Créer une alerte pour un chauffeur.
   */
  static async createAlert(data: {
    chauffeurId: string;
    type: "DOCUMENT_EXPIRY" | "INFRACTION_REPORTED" | "SUSPENSION" | "PAYMENT_ISSUE" | "RATING_LOW" | "CUSTOM";
    severity: "INFO" | "WARNING" | "CRITICAL";
    title: string;
    message: string;
    triggerAction?: string;
  }): Promise<NotificationAlert> {
    const alert = await db.notificationAlert.create({
      data: {
        chauffeurId: data.chauffeurId,
        type: data.type,
        severity: data.severity,
        title: data.title,
        message: data.message,
        triggerAction: data.triggerAction,
        read: false,
      },
    });

    logger.info(`Alert created for chauffeur ${data.chauffeurId}: ${data.type}`);
    return this.formatAlert(alert);
  }

  /**
   * Récupérer les alertes non lues d'un chauffeur.
   */
  static async getUnreadAlerts(chauffeurId: string): Promise<NotificationAlert[]> {
    const alerts = await db.notificationAlert.findMany({
      where: {
        chauffeurId,
        read: false,
      },
      orderBy: { createdAt: "desc" },
    });

    return alerts.map((a) => this.formatAlert(a));
  }

  /**
   * Marquer une alerte comme lue — uniquement si elle appartient à ce chauffeur.
   * Une alerte d'un autre chauffeur est traitée comme inexistante.
   */
  static async markAlertAsRead(alertId: string, chauffeurId: string): Promise<void> {
    const { count } = await db.notificationAlert.updateMany({
      where: { id: alertId, chauffeurId },
      data: {
        read: true,
        readAt: new Date(),
      },
    });
    if (count === 0) throw new ApiError(404, "Alerte introuvable", "ALERT_NOT_FOUND");

    logger.info(`Alert ${alertId} marked as read`);
  }

  /**
   * Marquer toutes les alertes d'un chauffeur comme lues.
   */
  static async markAllAlertsAsRead(chauffeurId: string): Promise<void> {
    await db.notificationAlert.updateMany({
      where: {
        chauffeurId,
        read: false,
      },
      data: {
        read: true,
        readAt: new Date(),
      },
    });

    logger.info(`All alerts for chauffeur ${chauffeurId} marked as read`);
  }

  /**
   * Récupérer l'historique des notifications.
   */
  static async getNotificationHistory(filters: {
    recipientId?: string;
    type?: "EMAIL" | "SMS" | "PUSH";
    status?: "PENDING" | "SENT" | "FAILED" | "BOUNCED";
    limit?: number;
    offset?: number;
  } = {}): Promise<{ logs: NotificationLog[]; total: number }> {
    const limit = Math.min(filters.limit || 50, 100);
    const offset = filters.offset || 0;

    const where: Prisma.NotificationLogWhereInput = {};
    if (filters.recipientId) where.recipientId = filters.recipientId;
    if (filters.type) where.type = filters.type;
    if (filters.status) where.status = filters.status;

    const [logs, total] = await Promise.all([
      db.notificationLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.notificationLog.count({ where }),
    ]);

    return {
      logs: logs.map((l) => this.formatNotificationLog(l)),
      total,
    };
  }

  /**
   * Obtenir les statistiques de notifications.
   */
  static async getNotificationStats(): Promise<{
    totalSent: number;
    totalFailed: number;
    successRate: number;
    byType: Record<string, number>;
  }> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const allLogs = await db.notificationLog.findMany({
      where: {
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    const sentLogs = allLogs.filter((l) => l.status === "SENT");
    const failedLogs = allLogs.filter((l) => l.status === "FAILED");

    const byType: Record<string, number> = {};
    allLogs.forEach((l) => {
      byType[l.type] = (byType[l.type] || 0) + 1;
    });

    return {
      totalSent: sentLogs.length,
      totalFailed: failedLogs.length,
      successRate: allLogs.length > 0 ? (sentLogs.length / allLogs.length) * 100 : 0,
      byType,
    };
  }

  /**
   * Mettre à jour le statut d'une notification (pour webhooks de providers).
   *
   * Idempotent et résistant au désordre : un statut ne peut qu'avancer
   * (PENDING < SENT < FAILED < BOUNCED). Un doublon ou un accusé arrivé en
   * retard (SENT après un BOUNCED) est ignoré, sans erreur, pour que le
   * fournisseur cesse de rejouer.
   */
  static async updateNotificationStatus(
    notificationLogId: string,
    status: "SENT" | "FAILED" | "BOUNCED",
    errorMessage?: string
  ): Promise<{ applied: boolean }> {
    const courant = await db.notificationLog.findUnique({
      where: { id: notificationLogId },
      select: { status: true },
    });
    if (!courant) throw new ApiError(404, "Notification introuvable", "NOTIFICATION_NOT_FOUND");
    if ((RANG_STATUT[status] ?? 0) <= (RANG_STATUT[courant.status] ?? 0)) {
      logger.info(`Notification ${notificationLogId} : accusé ${status} ignoré (déjà ${courant.status})`);
      return { applied: false };
    }

    const data: Prisma.NotificationLogUpdateManyMutationInput = { status };
    if (status === "FAILED" || status === "BOUNCED") {
      data.failedAt = new Date();
      data.errorMessage = errorMessage;
    } else if (status === "SENT") {
      data.sentAt = new Date();
    }

    // Garde contre un accusé concurrent : la mise à jour ne passe que si le statut n'a pas bougé.
    const { count } = await db.notificationLog.updateMany({
      where: { id: notificationLogId, status: courant.status },
      data,
    });

    logger.info(`Notification ${notificationLogId} status updated to ${status}`);
    return { applied: count === 1 };
  }

  // Formatters

  private static formatTemplate(template: GabaritDb): NotificationTemplate {
    return {
      id: template.id,
      key: template.key,
      name: template.name,
      type: template.type as NotificationTemplate["type"],
      subject: template.subject || undefined,
      body: template.body,
      variables: JSON.parse(template.variables || "[]"),
      active: template.active,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    };
  }

  private static formatNotificationLog(log: JournalDb): NotificationLog {
    return {
      id: log.id,
      recipientId: log.recipientId,
      recipientType: log.recipientType as NotificationLog["recipientType"],
      type: log.type as NotificationLog["type"],
      templateKey: log.templateKey,
      status: log.status as NotificationLog["status"],
      recipient: log.recipient,
      subject: log.subject || undefined,
      body: log.body,
      variables: JSON.parse(log.variables || "{}"),
      errorMessage: log.errorMessage || undefined,
      sentAt: log.sentAt || undefined,
      failedAt: log.failedAt || undefined,
      createdAt: log.createdAt,
    };
  }

  private static formatAlert(alert: AlerteDb): NotificationAlert {
    return {
      id: alert.id,
      chauffeurId: alert.chauffeurId,
      type: alert.type as NotificationAlert["type"],
      severity: alert.severity as NotificationAlert["severity"],
      title: alert.title,
      message: alert.message,
      triggerAction: alert.triggerAction || undefined,
      read: alert.read,
      readAt: alert.readAt || undefined,
      createdAt: alert.createdAt,
    };
  }
}
