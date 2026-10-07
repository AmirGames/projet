import type {
  AuditLog as AuditLogRow,
  ComplianceCheck as ComplianceCheckRow,
  ComplianceReport as ComplianceReportRow,
  DocumentVerificationWorkflow as DocumentVerificationWorkflowRow,
  Prisma,
} from "@prisma/client";
import { db } from "../../services/db";
import { logger } from "../../config/logger";

/**
 * Compliance et Audit pour ZupDrive.
 * Audit logs, document verification workflows, compliance checks, expiry tracking.
 */

export interface AuditLog {
  id: string;
  action: string;
  actorId: string;
  actorType: "ADMIN" | "SYSTEM" | "DRIVER" | "PASSAGER";
  resourceId: string;
  resourceType: "DRIVER" | "DOCUMENT" | "INFRACTION" | "ALERT" | "SETTING" | "PAYMENT";
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

export interface ComplianceCheck {
  id: string;
  chauffeurId: string;
  type: "DOCUMENT_VALIDATION" | "BACKGROUND_CHECK" | "FINANCIAL_VERIFICATION" | "PERIODIC_REVIEW";
  status: "PENDING" | "IN_PROGRESS" | "PASSED" | "FAILED" | "MANUAL_REVIEW_NEEDED";
  findings: string[]; // problèmes identifiés
  expiresAt: Date;
  completedAt?: Date;
  completedBy?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentVerificationWorkflow {
  id: string;
  chauffeurId: string;
  documentType: "PERMIS" | "ASSURANCE" | "INSPECTION" | "IDENTITE";
  status: "PENDING_UPLOAD" | "UPLOADED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "EXPIRED";
  uploadedAt?: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  rejectionReason?: string;
  nextReviewDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/** Une pièce du chauffeur (DocumentChauffeurDrive) dont l'échéance approche ou est dépassée. */
export interface ExpiringDocument {
  id: string;
  chauffeurId: string | null;
  type: string;
  statut: string;
  dateExpiration: Date;
}

export interface ComplianceReport {
  id: string;
  reportType: "MONTHLY" | "QUARTERLY" | "ANNUAL" | "AD_HOC";
  generatedAt: Date;
  generatedBy: string;
  totalDrivers: number;
  driversWithValidDocuments: number;
  driversWithExpiringDocuments: number;
  driversWithInfractions: number;
  driversWithLowRating: number;
  complianceRate: number; // %
  riskScore: number; // 0-100
  recommendations: string[];
}

export class ZupDriveComplianceService {
  /**
   * Créer une entrée dans l'audit log.
   */
  static async logAction(data: {
    action: string;
    actorId: string;
    actorType: "ADMIN" | "SYSTEM" | "DRIVER" | "PASSAGER";
    resourceId: string;
    resourceType: "DRIVER" | "DOCUMENT" | "INFRACTION" | "ALERT" | "SETTING" | "PAYMENT";
    oldValue?: Record<string, unknown>;
    newValue?: Record<string, unknown>;
    reason?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<AuditLog> {
    const auditLog = await db.auditLog.create({
      data: {
        action: data.action,
        actorId: data.actorId,
        actorType: data.actorType,
        resourceId: data.resourceId,
        resourceType: data.resourceType,
        oldValue: data.oldValue ? JSON.stringify(data.oldValue) : null,
        newValue: data.newValue ? JSON.stringify(data.newValue) : null,
        reason: data.reason,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      },
    });

    logger.info(`Audit log created: ${data.action} on ${data.resourceType}`);
    return this.formatAuditLog(auditLog);
  }

  /**
   * Récupérer l'historique d'audit avec filtres.
   */
  static async getAuditHistory(filters: {
    resourceId?: string;
    resourceType?: string;
    actorId?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ logs: AuditLog[]; total: number }> {
    const limit = Math.min(filters.limit || 100, 500);
    const offset = filters.offset || 0;

    const where: Prisma.AuditLogWhereInput = {};
    if (filters.resourceId) where.resourceId = filters.resourceId;
    if (filters.resourceType) where.resourceType = filters.resourceType;
    if (filters.actorId) where.actorId = filters.actorId;
    if (filters.action) where.action = { contains: filters.action };
    if (filters.startDate || filters.endDate) {
      where.createdAt = {
        ...(filters.startDate ? { gte: filters.startDate } : {}),
        ...(filters.endDate ? { lte: filters.endDate } : {}),
      };
    }

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.auditLog.count({ where }),
    ]);

    return {
      logs: logs.map((l) => this.formatAuditLog(l)),
      total,
    };
  }

  /**
   * Créer un compliance check.
   */
  static async createComplianceCheck(data: {
    chauffeurId: string;
    type: "DOCUMENT_VALIDATION" | "BACKGROUND_CHECK" | "FINANCIAL_VERIFICATION" | "PERIODIC_REVIEW";
    expiresAt: Date;
    notes?: string;
  }): Promise<ComplianceCheck> {
    const check = await db.complianceCheck.create({
      data: {
        chauffeurId: data.chauffeurId,
        type: data.type,
        status: "PENDING",
        findings: [],
        expiresAt: data.expiresAt,
        notes: data.notes,
      },
    });

    logger.info(`Compliance check created for chauffeur ${data.chauffeurId}: ${data.type}`);
    return this.formatComplianceCheck(check);
  }

  /**
   * Lister les compliance checks d'un chauffeur.
   */
  static async getDriverComplianceChecks(chauffeurId: string): Promise<ComplianceCheck[]> {
    const checks = await db.complianceCheck.findMany({
      where: { chauffeurId },
      orderBy: { createdAt: "desc" },
    });

    return checks.map((c) => this.formatComplianceCheck(c));
  }

  /**
   * Mettre à jour le statut d'un compliance check.
   */
  static async updateComplianceCheckStatus(
    checkId: string,
    status: "IN_PROGRESS" | "PASSED" | "FAILED" | "MANUAL_REVIEW_NEEDED",
    findings?: string[],
    completedBy?: string,
    notes?: string
  ): Promise<void> {
    await db.complianceCheck.update({
      where: { id: checkId },
      data: {
        status,
        findings,
        completedAt: ["PASSED", "FAILED", "MANUAL_REVIEW_NEEDED"].includes(status) ? new Date() : undefined,
        completedBy,
        notes,
      },
    });

    logger.info(`Compliance check ${checkId} updated to ${status}`);
  }

  /**
   * Créer un workflow de vérification de document.
   */
  static async initiateDocumentVerification(data: {
    chauffeurId: string;
    documentType: "PERMIS" | "ASSURANCE" | "INSPECTION" | "IDENTITE";
  }): Promise<DocumentVerificationWorkflow> {
    const workflow = await db.documentVerificationWorkflow.upsert({
      where: {
        chauffeurId_documentType: {
          chauffeurId: data.chauffeurId,
          documentType: data.documentType,
        },
      },
      update: {
        status: "PENDING_UPLOAD",
      },
      create: {
        chauffeurId: data.chauffeurId,
        documentType: data.documentType,
        status: "PENDING_UPLOAD",
      },
    });

    return this.formatDocumentVerificationWorkflow(workflow);
  }

  /**
   * Mettre à jour le statut d'un workflow de vérification.
   */
  static async updateDocumentVerificationStatus(
    workflowId: string,
    status: "UPLOADED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "EXPIRED",
    reviewedBy?: string,
    rejectionReason?: string
  ): Promise<void> {
    const updateData: Prisma.DocumentVerificationWorkflowUpdateInput = {
      status,
    };

    if (status === "UNDER_REVIEW") {
      updateData.uploadedAt = new Date();
    }

    if (status === "APPROVED" || status === "REJECTED") {
      updateData.reviewedAt = new Date();
      updateData.reviewedBy = reviewedBy;
    }

    if (status === "REJECTED") {
      updateData.rejectionReason = rejectionReason;
    }

    if (status === "APPROVED") {
      updateData.nextReviewDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 an
    }

    await db.documentVerificationWorkflow.update({
      where: { id: workflowId },
      data: updateData,
    });

    logger.info(`Document verification workflow ${workflowId} updated to ${status}`);
  }

  /**
   * Récupérer les pièces approuvées expirées ou bientôt expirées.
   * La référence est DocumentChauffeurDrive (versions non archivées).
   */
  static async getExpiringDocuments(daysThreshold = 30): Promise<ExpiringDocument[]> {
    const threshold = new Date(Date.now() + daysThreshold * 24 * 60 * 60 * 1000);

    const documents = await db.documentChauffeurDrive.findMany({
      where: {
        statut: "APPROVED",
        archiveeLe: null,
        dateExpiration: { not: null, lte: threshold },
      },
      orderBy: { dateExpiration: "asc" },
      select: { id: true, chauffeurId: true, type: true, statut: true, dateExpiration: true },
    });

    return documents.flatMap((d) =>
      d.dateExpiration ? [{ ...d, dateExpiration: d.dateExpiration }] : []
    );
  }

  /**
   * Générer un compliance report.
   */
  static async generateComplianceReport(data: {
    reportType: "MONTHLY" | "QUARTERLY" | "ANNUAL" | "AD_HOC";
    generatedBy: string;
  }): Promise<ComplianceReport> {
    const drivers = await db.chauffeurDrive.findMany({
      select: {
        id: true,
        statut: true,
        documents: {
          where: { archiveeLe: null },
          select: { statut: true, dateExpiration: true },
        },
        infractions: { select: { severity: true } },
        // Notes reçues : celles que les passagers donnent au chauffeur.
        notes: { where: { auteur: "PASSAGER" }, select: { note: true } },
      },
    });

    // Calculer les métriques
    const now = new Date();
    const totalDrivers = drivers.length;
    const driversWithValidDocuments = drivers.filter((d) =>
      d.documents.every((doc) => doc.statut === "APPROVED" && (!doc.dateExpiration || doc.dateExpiration > now))
    ).length;

    const thirtyDaysAhead = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const driversWithExpiringDocuments = drivers.filter((d) =>
      d.documents.some((doc) => doc.dateExpiration && doc.dateExpiration > now && doc.dateExpiration < thirtyDaysAhead)
    ).length;

    const driversWithInfractions = drivers.filter((d) => d.infractions.length > 0).length;
    const driversWithLowRating = drivers.filter(
      (d) => d.notes.length > 0 && d.notes.reduce((somme, n) => somme + n.note, 0) / d.notes.length < 4
    ).length;

    const complianceRate = totalDrivers > 0 ? (driversWithValidDocuments / totalDrivers) * 100 : 0;

    // Risk score : 0-100 basé sur plusieurs facteurs
    const riskScore = Math.min(
      100,
      (driversWithInfractions / Math.max(totalDrivers, 1)) * 40 +
        (driversWithLowRating / Math.max(totalDrivers, 1)) * 30 +
        ((totalDrivers - driversWithValidDocuments) / Math.max(totalDrivers, 1)) * 30
    );

    // Recommendations
    const recommendations: string[] = [];
    if (complianceRate < 80) recommendations.push("Document compliance below 80% - urgent review needed");
    if (driversWithInfractions > totalDrivers * 0.1) recommendations.push("High infraction rate detected");
    if (driversWithLowRating > totalDrivers * 0.05) recommendations.push("Multiple low-rated drivers");
    if (driversWithExpiringDocuments > totalDrivers * 0.2) recommendations.push("Many documents expiring soon");

    const report = await db.complianceReport.create({
      data: {
        reportType: data.reportType,
        generatedBy: data.generatedBy,
        totalDrivers,
        driversWithValidDocuments,
        driversWithExpiringDocuments,
        driversWithInfractions,
        driversWithLowRating,
        complianceRate,
        riskScore,
        recommendations,
      },
    });

    logger.info(`Compliance report generated: ${data.reportType}`);
    return this.formatComplianceReport(report);
  }

  /**
   * Récupérer les compliance reports.
   */
  static async getComplianceReports(limit = 50, offset = 0): Promise<{ reports: ComplianceReport[]; total: number }> {
    const [reports, total] = await Promise.all([
      db.complianceReport.findMany({
        orderBy: { generatedAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.complianceReport.count(),
    ]);

    return {
      reports: reports.map((r) => this.formatComplianceReport(r)),
      total,
    };
  }

  // Formatters

  /** Les colonnes Json « findings » et « recommendations » sont des listes de textes. */
  private static listeDeTextes(valeur: Prisma.JsonValue): string[] {
    return Array.isArray(valeur) ? valeur.filter((v): v is string => typeof v === "string") : [];
  }

  private static formatAuditLog(log: AuditLogRow): AuditLog {
    return {
      id: log.id,
      action: log.action,
      actorId: log.actorId,
      actorType: log.actorType as AuditLog["actorType"],
      resourceId: log.resourceId,
      resourceType: log.resourceType as AuditLog["resourceType"],
      oldValue: log.oldValue ? (JSON.parse(log.oldValue) as Record<string, unknown>) : undefined,
      newValue: log.newValue ? (JSON.parse(log.newValue) as Record<string, unknown>) : undefined,
      reason: log.reason || undefined,
      ipAddress: log.ipAddress || undefined,
      userAgent: log.userAgent || undefined,
      createdAt: log.createdAt,
    };
  }

  private static formatComplianceCheck(check: ComplianceCheckRow): ComplianceCheck {
    return {
      id: check.id,
      chauffeurId: check.chauffeurId,
      type: check.type as ComplianceCheck["type"],
      status: check.status as ComplianceCheck["status"],
      findings: ZupDriveComplianceService.listeDeTextes(check.findings),
      expiresAt: check.expiresAt,
      completedAt: check.completedAt || undefined,
      completedBy: check.completedBy || undefined,
      notes: check.notes || undefined,
      createdAt: check.createdAt,
      updatedAt: check.updatedAt,
    };
  }

  private static formatDocumentVerificationWorkflow(workflow: DocumentVerificationWorkflowRow): DocumentVerificationWorkflow {
    return {
      id: workflow.id,
      chauffeurId: workflow.chauffeurId,
      documentType: workflow.documentType as DocumentVerificationWorkflow["documentType"],
      status: workflow.status as DocumentVerificationWorkflow["status"],
      uploadedAt: workflow.uploadedAt || undefined,
      reviewedAt: workflow.reviewedAt || undefined,
      reviewedBy: workflow.reviewedBy || undefined,
      rejectionReason: workflow.rejectionReason || undefined,
      nextReviewDate: workflow.nextReviewDate || undefined,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
    };
  }

  private static formatComplianceReport(report: ComplianceReportRow): ComplianceReport {
    return {
      id: report.id,
      reportType: report.reportType as ComplianceReport["reportType"],
      generatedAt: report.generatedAt,
      generatedBy: report.generatedBy,
      totalDrivers: report.totalDrivers,
      driversWithValidDocuments: report.driversWithValidDocuments,
      driversWithExpiringDocuments: report.driversWithExpiringDocuments,
      driversWithInfractions: report.driversWithInfractions,
      driversWithLowRating: report.driversWithLowRating,
      complianceRate: report.complianceRate,
      riskScore: report.riskScore,
      recommendations: ZupDriveComplianceService.listeDeTextes(report.recommendations),
    };
  }
}
