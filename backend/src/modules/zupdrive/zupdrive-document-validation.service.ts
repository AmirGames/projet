/**
 * ZupDrive Document Validation Service
 *
 * Workflow de validation des pièces jointes chauffeur:
 * - Chauffeur uploade documents (PERMIS, ASSURANCE, etc.)
 * - Admin valide chaque document
 * - Système vérifie les expirations
 * - Dossier complet = tous les documents validés
 *
 * Types requis par région (Belgique):
 * BRUXELLES: PERMIS, ASSURANCE, INSPECTION, IDENTITE
 * WALLONIE: PERMIS, ASSURANCE, INSPECTION, IDENTITE
 * FLANDRE: PERMIS, ASSURANCE, INSPECTION, IDENTITE
 */

import { db } from "../../services/db";
import { ApiError } from "../../middleware/api-error";

export type DocumentType =
  | "PERMIS"     // Permis de conduire
  | "ASSURANCE"  // Assurance auto
  | "INSPECTION" // Contrôle technique
  | "IDENTITE"   // Carte d'identité
  | "CONTRAT"    // Contrat de travail (société)
  | "BCE"        // Document BCE (numéro entreprise)
  | "AUTRE";     // Autre document

export type DocumentStatus =
  | "PENDING"    // En attente de vérification
  | "APPROVED"   // Approuvé par admin
  | "REJECTED"   // Rejeté par admin
  | "EXPIRED";   // Expiré (auto-détecté)

interface DocumentValidationResult {
  id: string;
  type: DocumentType;
  status: DocumentStatus;
  url: string;
  expiresAt?: Date;
  verifiedAt?: Date;
  verifiedBy?: string;
  rejectionReason?: string;
  daysUntilExpiration?: number;
}

interface DocumentValidationSummary {
  chauffeurId: string;
  totalRequired: number;
  approved: number;
  pending: number;
  rejected: number;
  expired: number;
  allValidated: boolean;
  documents: DocumentValidationResult[];
  nextActionRequired?: string;
}

/**
 * Types de documents requis par région
 */
const REQUIRED_DOCUMENTS_BY_REGION: Record<string, DocumentType[]> = {
  BRUXELLES: ["PERMIS", "ASSURANCE", "INSPECTION", "IDENTITE"],
  WALLONIE: ["PERMIS", "ASSURANCE", "INSPECTION", "IDENTITE"],
  FLANDRE: ["PERMIS", "ASSURANCE", "INSPECTION", "IDENTITE"],
};

export const ZupDriveDocumentValidationService = {
  /**
   * Chauffeur uploade un document
   */
  async uploadDocument(data: {
    chauffeurId: string;
    type: DocumentType;
    url: string; // URL du fichier stocké (Cloudinary, etc.)
    expiresAt?: Date; // Date d'expiration du document
  }): Promise<DocumentValidationResult> {
    const chauffeur = await db.chauffeurDrive.findUnique({
      where: { id: data.chauffeurId },
      select: { statut: true },
    });

    if (!chauffeur) {
      throw new ApiError(404, "Chauffeur non trouvé");
    }

    // Vérifier que le chauffeur peut uploader (BROUILLON ou REFUSE)
    if (!["BROUILLON", "REFUSE"].includes(chauffeur.statut)) {
      throw new ApiError(
        400,
        `Impossible d'uploader des documents quand le statut est ${chauffeur.statut}`
      );
    }

    // Créer ou remplacer le document
    const document = await db.documentChauffeurDrive.upsert({
      where: {
        chauffeurId_type: {
          chauffeurId: data.chauffeurId,
          type: data.type,
        },
      },
      update: {
        url: data.url,
        dateExpiration: data.expiresAt || null,
        statut: "PENDING", // Reset to pending on re-upload
        noteExamen: null,
      },
      create: {
        chauffeurId: data.chauffeurId,
        type: data.type,
        url: data.url,
        dateExpiration: data.expiresAt || null,
        statut: "PENDING",
      },
    });

    return this.mapDocumentResult(document);
  },

  /**
   * Admin valide un document
   */
  async approveDocument(data: {
    documentId: string;
    approvedBy: string;
  }): Promise<DocumentValidationResult> {
    const document = await db.documentChauffeurDrive.update({
      where: { id: data.documentId },
      data: {
        statut: "APPROVED",
        examineLe: new Date(),
        noteExamen: null, // Clear any rejection reason
      },
    });

    return this.mapDocumentResult(document);
  },

  /**
   * Admin refuse un document
   */
  async rejectDocument(data: {
    documentId: string;
    reason: string;
    rejectedBy: string;
  }): Promise<DocumentValidationResult> {
    const document = await db.documentChauffeurDrive.update({
      where: { id: data.documentId },
      data: {
        statut: "REJECTED",
        examineLe: new Date(),
        noteExamen: data.reason,
      },
    });

    return this.mapDocumentResult(document);
  },

  /**
   * Obtenir tous les documents d'un chauffeur avec statut
   */
  async getChauffeurDocuments(
    chauffeurId: string
  ): Promise<DocumentValidationSummary> {
    const chauffeur = await db.chauffeurDrive.findUnique({
      where: { id: chauffeurId },
      select: { region: true },
    });

    if (!chauffeur) {
      throw new ApiError(404, "Chauffeur non trouvé");
    }

    const documents = await db.documentChauffeurDrive.findMany({
      where: { chauffeurId },
      orderBy: { type: "asc" },
    });

    const required = REQUIRED_DOCUMENTS_BY_REGION[chauffeur.region || "BRUXELLES"] || [];
    const mappedDocs = documents.map((d) => this.mapDocumentResult(d));

    // Vérifier l'expiration
    const withExpiration = mappedDocs.map((doc) => {
      if (doc.expiresAt) {
        const now = new Date();
        const daysUntil = Math.floor(
          (doc.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );
        return {
          ...doc,
          daysUntilExpiration: daysUntil,
          status: daysUntil < 0 ? "EXPIRED" : doc.status,
        };
      }
      return doc;
    });

    const summary = {
      chauffeurId,
      totalRequired: required.length,
      approved: withExpiration.filter((d) => d.status === "APPROVED").length,
      pending: withExpiration.filter((d) => d.status === "PENDING").length,
      rejected: withExpiration.filter((d) => d.status === "REJECTED").length,
      expired: withExpiration.filter((d) => d.status === "EXPIRED").length,
      documents: withExpiration,
      allValidated: false,
      nextActionRequired: undefined as string | undefined,
    };

    // Vérifier complétude
    const approvedTypes = withExpiration
      .filter((d) => d.status === "APPROVED")
      .map((d) => d.type);

    const missingTypes = required.filter((t) => !approvedTypes.includes(t));
    summary.allValidated = missingTypes.length === 0 && summary.rejected === 0;

    if (!summary.allValidated) {
      if (summary.rejected > 0) {
        summary.nextActionRequired = `${summary.rejected} document(s) rejected. Chauffeur must resubmit.`;
      } else if (missingTypes.length > 0) {
        summary.nextActionRequired = `Missing documents: ${missingTypes.join(", ")}`;
      } else if (summary.expired > 0) {
        summary.nextActionRequired = `${summary.expired} document(s) expired. Chauffeur must renew.`;
      }
    }

    return summary;
  },

  /**
   * Vérifier si un chauffeur peut être approuvé (tous docs validés)
   */
  async canApproveChauffeur(chauffeurId: string): Promise<{
    canApprove: boolean;
    reason?: string;
  }> {
    const summary = await this.getChauffeurDocuments(chauffeurId);

    if (summary.allValidated) {
      return { canApprove: true };
    }

    const reasons = [];
    if (summary.rejected > 0) {
      reasons.push(`${summary.rejected} document(s) rejected`);
    }
    if (summary.expired > 0) {
      reasons.push(`${summary.expired} document(s) expired`);
    }
    if (summary.pending > 0) {
      reasons.push(`${summary.pending} document(s) pending review`);
    }

    return {
      canApprove: false,
      reason: `Cannot approve: ${reasons.join(", ")}`,
    };
  },

  /**
   * Auto-détecter les documents expirés et les marquer
   */
  async checkExpirations(chauffeurId?: string): Promise<number> {
    const now = new Date();

    let updated = 0;

    const documentsToExpire = await db.documentChauffeurDrive.findMany({
      where: {
        ...(chauffeurId ? { chauffeurId } : {}),
        dateExpiration: {
          lt: now,
        },
        statut: {
          not: "EXPIRED",
        },
      },
    });

    for (const doc of documentsToExpire) {
      await db.documentChauffeurDrive.update({
        where: { id: doc.id },
        data: { statut: "EXPIRED" },
      });
      updated++;
    }

    // Envoyer notifications si expiré
    if (updated > 0 && chauffeurId) {
      // TODO: Notification au chauffeur - documents expirés
    }

    return updated;
  },

  /**
   * Préparer un rappel pour documents expirés bientôt
   */
  async scheduleExpirationReminders(): Promise<number> {
    const soon = new Date();
    soon.setDate(soon.getDate() + 30); // 30 jours

    const now = new Date();

    const expiringDocs = await db.documentChauffeurDrive.findMany({
      where: {
        dateExpiration: {
          lte: soon,
          gte: now,
        },
        statut: "APPROVED",
      },
      select: {
        id: true,
        chauffeurId: true,
        type: true,
        dateExpiration: true,
        rappel30JoursLe: true,
      },
    });

    let reminders = 0;

    for (const doc of expiringDocs) {
      const daysUntilExpiration = Math.floor(
        (doc.dateExpiration!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      // 30 jours
      if (daysUntilExpiration <= 30 && !doc.rappel30JoursLe) {
        await db.documentChauffeurDrive.update({
          where: { id: doc.id },
          data: { rappel30JoursLe: new Date() },
        });
        // TODO: Notification - 30 jours avant expiration
        reminders++;
      }

      // 10 jours
      if (daysUntilExpiration <= 10) {
        if (!doc.rappel10JoursLe) {
          await db.documentChauffeurDrive.update({
            where: { id: doc.id },
            data: { rappel10JoursLe: new Date() },
          });
          // TODO: Notification urgente - 10 jours
          reminders++;
        }
      }
    }

    return reminders;
  },

  /**
   * Helper: Mapper les données Prisma
   */
  mapDocumentResult(
    doc: any
  ): DocumentValidationResult {
    return {
      id: doc.id,
      type: doc.type as DocumentType,
      status: doc.statut as DocumentStatus,
      url: doc.url,
      expiresAt: doc.dateExpiration || undefined,
      verifiedAt: doc.examineLe || undefined,
      verifiedBy: doc.verifiedBy || undefined,
      rejectionReason: doc.noteExamen || undefined,
    };
  },
};

/**
 * WORKFLOW EXPLIQUÉ
 *
 * 1️⃣ Chauffeur crée candidacy (BROUILLON)
 *    → Peut uploader documents
 *
 * 2️⃣ Chauffeur upload chaque doc requis
 *    → DocumentChauffeurDrive.statut = PENDING
 *    → API retourne liste des docs manquants
 *
 * 3️⃣ Admin ZupDrive vérifie chaque doc
 *    → Approuve: PENDING → APPROVED
 *    → Rejette: PENDING → REJECTED
 *    → Stocke noteExamen (raison du rejet)
 *
 * 4️⃣ Admin consulte "Prêt pour approbation?"
 *    → Service vérifie: all docs APPROVED + none EXPIRED
 *    → Retourne: canApprove=true/false + raison
 *
 * 5️⃣ Quand all docs APPROVED
 *    → Admin peut approuver le dossier chauffeur
 *    → ChauffeurDrive.statut = VALIDE
 *    → User gains CHAUFFEUR_VTCZTC role
 *
 * 6️⃣ Job quotidien: checkExpirations()
 *    → Détecte docs expirés
 *    → Marque: APPROVED → EXPIRED
 *    → Chauffeur perd l'accès (auto)
 *
 * 7️⃣ Job: scheduleExpirationReminders()
 *    → Rappel 30 jours avant
 *    → Rappel 10 jours avant (urgent)
 *    → Prévient le chauffeur
 */
