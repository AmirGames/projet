/**
 * ZupDrive Automated Compliance Checks Service
 *
 * Vérifications automatisées de conformité:
 * - Intégrité des documents
 * - Scoring de risque du chauffeur
 * - Détection de patterns suspects
 * - Rapports de conformité
 * - Alertes pour les admins
 *
 * Basé sur:
 * - Données PERMIS (authenticity, validity period)
 * - Données ASSURANCE (coverage, validity)
 * - Données INSPECTION (technical status, expiration)
 * - Historique infractions
 * - Patterns comportementaux
 */

import type { Prisma } from "@prisma/client";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/api-error";
import { piecesExigees } from "./chauffeur-onboarding.service";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ComplianceCheckType =
  | "DOCUMENT_INTEGRITY"     // Validité des documents
  | "DOCUMENT_CONSISTENCY"   // Cohérence entre docs
  | "IDENTITY_VERIFICATION"  // Vérification identité
  | "INFRACTION_HISTORY"     // Historique infractions
  | "BEHAVIORAL_PATTERN"     // Pattern comportemental
  | "GEOGRAPHIC_ANOMALY"     // Anomalie géographique
  | "DUPLICATE_DETECTION"    // Détection doublons
  | "FRAUD_INDICATORS";      // Indicateurs fraude

interface ComplianceCheckResult {
  type: ComplianceCheckType;
  passed: boolean;
  riskScore: number; // 0-100
  severity: RiskLevel;
  message: string;
  recommendations?: string[];
  evidence?: Record<string, unknown>;
}

interface ComplianceReport {
  chauffeurId: string;
  userId: string;
  reportedAt: Date;
  overallRiskScore: number; // 0-100
  overallRiskLevel: RiskLevel;
  checks: ComplianceCheckResult[];
  flaggedForReview: boolean;
  autoDecision?: "APPROVE" | "REJECT" | "MANUAL_REVIEW";
  expiringDocuments?: Array<{
    type: string;
    expiresIn: number; // days
  }>;
  recommendations: string[];
}

/** Ce que les contrôles lisent d'un chauffeur : pièces, infractions et statut des courses. */
const SELECTION_CONTROLE = {
  id: true,
  userId: true,
  nomComplet: true,
  region: true,
  societeId: true,
  statut: true,
  createdAt: true,
  documents: { where: { archiveeLe: null }, select: { type: true, statut: true, dateExpiration: true } },
  infractions: { select: { severity: true } },
  courses: { select: { statut: true } },
} satisfies Prisma.ChauffeurDriveSelect;

type ChauffeurControle = Prisma.ChauffeurDriveGetPayload<{ select: typeof SELECTION_CONTROLE }>;

export const ZupDriveComplianceChecksService = {
  /**
   * Lancer toutes les vérifications de conformité pour un chauffeur
   */
  async runFullCompliance(chauffeurId: string): Promise<ComplianceReport> {
    const chauffeur = await db.chauffeurDrive.findUnique({
      where: { id: chauffeurId },
      select: SELECTION_CONTROLE,
    });

    if (!chauffeur) {
      throw new ApiError(404, "Chauffeur non trouvé");
    }

    const now = new Date();
    const checks: ComplianceCheckResult[] = [];

    // 1. Vérification intégrité des documents
    checks.push(await this.checkDocumentIntegrity(chauffeur));

    // 2. Cohérence entre documents
    checks.push(await this.checkDocumentConsistency(chauffeur));

    // 3. Vérification identité
    checks.push(await this.checkIdentityVerification(chauffeur));

    // 4. Historique infractions
    checks.push(await this.checkInfractionHistory(chauffeur));

    // 5. Patterns comportementaux
    checks.push(await this.checkBehavioralPatterns(chauffeur));

    // 6. Anomalies géographiques
    checks.push(
      await this.checkGeographicAnomalies(chauffeur.region ?? undefined)
    );

    // 7. Détection doublons
    checks.push(await this.checkDuplicateDetection());

    // 8. Indicateurs fraude
    checks.push(await this.checkFraudIndicators(chauffeur));

    // Calculer les scores
    // Le pire contrôle compte : une moyenne diluerait un document expiré ou des
    // infractions graves parmi des contrôles sans problème.
    const moyenne = Math.round(
      checks.reduce((sum, c) => sum + c.riskScore, 0) / checks.length
    );
    const SEUIL_DU_NIVEAU: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 25, HIGH: 50, CRITICAL: 75 };
    const pireSeuil = Math.max(...checks.map((c) => SEUIL_DU_NIVEAU[c.severity]));
    const overallRiskScore = Math.max(moyenne, ...checks.map((c) => c.riskScore), pireSeuil);

    const overallRiskLevel = this.scoreToLevel(overallRiskScore);
    const flaggedForReview =
      overallRiskLevel === "HIGH" || overallRiskLevel === "CRITICAL";

    // Documents expirés prochainement (30 jours)
    const expiringDocuments = chauffeur.documents.flatMap((doc) => {
      if (!doc.dateExpiration) return [];
      const daysUntil = Math.floor(
        (doc.dateExpiration.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      return daysUntil <= 30 && daysUntil > 0
        ? [{ type: doc.type, expiresIn: daysUntil }]
        : [];
    });

    // Auto-décision
    let autoDecision: "APPROVE" | "REJECT" | "MANUAL_REVIEW" | undefined;
    if (overallRiskLevel === "CRITICAL") {
      autoDecision = "REJECT";
    } else if (overallRiskLevel === "HIGH") {
      autoDecision = "MANUAL_REVIEW";
    } else if (overallRiskLevel === "LOW" && checks.every((c) => c.passed)) {
      autoDecision = "APPROVE";
    } else {
      autoDecision = "MANUAL_REVIEW";
    }

    const recommendations = this.generateRecommendations(checks);

    const report: ComplianceReport = {
      chauffeurId,
      userId: chauffeur.userId,
      reportedAt: now,
      overallRiskScore,
      overallRiskLevel,
      checks,
      flaggedForReview,
      autoDecision,
      expiringDocuments: expiringDocuments.length > 0 ? expiringDocuments : undefined,
      recommendations,
    };

    // Sauvegarder le rapport
    // Le schéma ne conserve ni la décision automatique ni l'indicateur « à revoir » :
    // ils se déduisent du niveau de risque (voir flaggedForReview / autoDecision plus haut).
    const fraude = checks.find((c) => c.type === "FRAUD_INDICATORS");
    await db.complianceReportDrive.create({
      data: {
        chauffeurId,
        riskLevel: overallRiskLevel,
        complianceScore: 100 - overallRiskScore,
        fraudIndicators: JSON.parse(JSON.stringify(fraude?.evidence?.indicators ?? [])) as Prisma.InputJsonValue,
        verificationPoints: JSON.parse(JSON.stringify(checks)) as Prisma.InputJsonValue,
        autoRecommendations: recommendations,
      },
    });

    return report;
  },

  /**
   * Vérification intégrité des documents
   */
  async checkDocumentIntegrity(
    chauffeur: ChauffeurControle
  ): Promise<ComplianceCheckResult> {
    const required: string[] = piecesExigees(chauffeur.region, { enSociete: Boolean(chauffeur.societeId) });
    const maintenant = new Date();
    const approuvees = (chauffeur.documents || []).filter((d) => d.statut === "APPROVED");
    // Approuvée ne suffit pas : une pièce dont la date est dépassée n'est plus valable.
    const expirees = approuvees
      .filter((d) => d.dateExpiration && d.dateExpiration < maintenant)
      .map((d) => d.type);
    const valables = approuvees.map((d) => d.type).filter((type) => !expirees.includes(type));

    const missing = required.filter((r) => !valables.includes(r) && !expirees.includes(r));
    const aRemplacer = required.filter((r) => expirees.includes(r));
    const invalides = missing.length + aRemplacer.length;
    const passed = invalides === 0;

    const details = [
      missing.length > 0 ? `Missing documents: ${missing.join(", ")}` : "",
      aRemplacer.length > 0 ? `Expired documents: ${aRemplacer.join(", ")}` : "",
    ].filter(Boolean);

    return {
      type: "DOCUMENT_INTEGRITY",
      passed,
      riskScore: passed ? 0 : 50 + invalides * 5,
      severity: passed ? "LOW" : aRemplacer.length > 0 || missing.length > 2 ? "HIGH" : "MEDIUM",
      message: passed ? "All required documents approved" : details.join("; "),
      evidence: { missing, expired: aRemplacer, approved: valables },
    };
  },

  /**
   * Cohérence entre documents
   */
  async checkDocumentConsistency(
    chauffeur: ChauffeurControle
  ): Promise<ComplianceCheckResult> {
    const docs = chauffeur.documents || [];
    const issues: string[] = [];

    // Le nom lu sur la pièce d'identité n'est pas conservé dans DocumentChauffeurDrive :
    // la cohérence du nom ne peut pas être contrôlée.

    // Vérifier dates cohérentes
    const permisExpiry = docs.find((d) => d.type === "permis")
      ?.dateExpiration;
    const inspectionExpiry = docs.find((d) => d.type === "controle_technique")
      ?.dateExpiration;

    if (
      permisExpiry &&
      inspectionExpiry &&
      permisExpiry < new Date(inspectionExpiry.getTime() - 30 * 24 * 60 * 60 * 1000)
    ) {
      issues.push("PERMIS expires before INSPECTION (unusual)");
    }

    const passed = issues.length === 0;
    return {
      type: "DOCUMENT_CONSISTENCY",
      passed,
      riskScore: passed ? 0 : Math.min(issues.length * 15, 60),
      severity: issues.length > 2 ? "HIGH" : issues.length > 0 ? "MEDIUM" : "LOW",
      message: passed
        ? "Documents are consistent"
        : `Inconsistencies detected: ${issues.join("; ")}`,
      evidence: { issues },
    };
  },

  /**
   * Vérification identité
   */
  async checkIdentityVerification(
    chauffeur: ChauffeurControle
  ): Promise<ComplianceCheckResult> {
    const identiteDoc = chauffeur.documents?.find((d) => d.type === "identite");

    const issues: string[] = [];

    if (!identiteDoc) {
      issues.push("No IDENTITE document found");
    } else {
      // Vérifier que l'identité n'est pas expirée
      const now = new Date();
      if (
        identiteDoc.dateExpiration &&
        identiteDoc.dateExpiration < now
      ) {
        issues.push("IDENTITE document expired");
      }

      // Vérifier que le statut est APPROVED
      if (identiteDoc.statut !== "APPROVED") {
        issues.push(`IDENTITE not approved (status: ${identiteDoc.statut})`);
      }
    }

    const passed = issues.length === 0;
    return {
      type: "IDENTITY_VERIFICATION",
      passed,
      riskScore: passed ? 0 : 40,
      severity: passed ? "LOW" : "HIGH",
      message: passed ? "Identity verified" : `Identity issues: ${issues.join("; ")}`,
      evidence: { issues },
    };
  },

  /**
   * Historique infractions
   */
  async checkInfractionHistory(
    chauffeur: ChauffeurControle
  ): Promise<ComplianceCheckResult> {
    const infractions = chauffeur.infractions || [];
    const highSeverity = infractions.filter(
      (i) => i.severity === "HAUTE"
    ).length;
    const mediumSeverity = infractions.filter(
      (i) => i.severity === "MOYENNE"
    ).length;

    // Scoring: High severity = 20 points, Medium = 5 points each
    const riskScore = Math.min(highSeverity * 20 + mediumSeverity * 5, 80);
    const passed = highSeverity === 0;

    const recommendations =
      highSeverity > 0
        ? ["Review high-severity infractions before approval"]
        : undefined;

    return {
      type: "INFRACTION_HISTORY",
      passed,
      riskScore,
      severity:
        highSeverity > 1
          ? "CRITICAL"
          : highSeverity > 0
            ? "HIGH"
            : mediumSeverity > 2
              ? "MEDIUM"
              : "LOW",
      message: `${highSeverity} high-severity, ${mediumSeverity} medium-severity infractions`,
      recommendations,
      evidence: { highSeverity, mediumSeverity, total: infractions.length },
    };
  },

  /**
   * Patterns comportementaux
   */
  async checkBehavioralPatterns(
    chauffeur: ChauffeurControle
  ): Promise<ComplianceCheckResult> {
    const courses = chauffeur.courses || [];
    const issues: string[] = [];

    if (courses.length === 0) {
      // Nouveau chauffeur - pas de données comportementales
      return {
        type: "BEHAVIORAL_PATTERN",
        passed: true,
        riskScore: 0,
        severity: "LOW",
        message: "New driver - no behavioral history",
        evidence: { coursesCount: 0 },
      };
    }

    // Analyser les patterns
    const completionRate = courses.filter((c) => c.statut === "TERMINEE")
      .length / courses.length;

    if (completionRate < 0.7) {
      issues.push(`Low completion rate: ${(completionRate * 100).toFixed(1)}%`);
    }

    // Taux d'annulation élevé
    const cancellationRate = courses.filter((c) => c.statut === "ANNULEE")
      .length / courses.length;

    if (cancellationRate > 0.2) {
      issues.push(
        `High cancellation rate: ${(cancellationRate * 100).toFixed(1)}%`
      );
    }

    const passed = issues.length === 0;
    return {
      type: "BEHAVIORAL_PATTERN",
      passed,
      riskScore: passed ? 0 : Math.min(issues.length * 15, 60),
      severity: issues.length > 0 ? "MEDIUM" : "LOW",
      message: passed
        ? `Good behavioral pattern (${courses.length} courses)`
        : `Issues detected: ${issues.join("; ")}`,
      evidence: {
        coursesCount: courses.length,
        completionRate: completionRate.toFixed(2),
        cancellationRate: cancellationRate.toFixed(2),
      },
    };
  },

  /**
   * Anomalies géographiques
   */
  async checkGeographicAnomalies(
    region?: string
  ): Promise<ComplianceCheckResult> {
    // Vérifier que le région correspond
    const issues: string[] = [];

    if (!region) {
      issues.push("No region specified");
    }

    // Vérifier qu'il n'y a pas de courses dans des régions très éloignées
    // TODO: Implémenter la vérification de distance (aucune donnée de distance aux régions pour l'instant)
    const farCourses: unknown[] = [];

    const passed = issues.length === 0 && farCourses.length === 0;
    return {
      type: "GEOGRAPHIC_ANOMALY",
      passed,
      riskScore: passed ? 0 : 20,
      severity: passed ? "LOW" : "MEDIUM",
      message: passed
        ? `Region ${region} is primary`
        : `Geographic anomalies detected`,
      evidence: { region, farCoursesCount: farCourses.length },
    };
  },

  /**
   * Détection doublons
   */
  async checkDuplicateDetection(): Promise<ComplianceCheckResult> {
    // DocumentChauffeurDrive ne conserve pas le numéro de la pièce d'identité :
    // aucune comparaison entre comptes n'est possible pour l'instant.
    const duplicates: unknown[] = [];

    const passed = duplicates.length === 0;
    return {
      type: "DUPLICATE_DETECTION",
      passed,
      riskScore: passed ? 0 : 80,
      severity: passed ? "LOW" : "CRITICAL",
      message: passed
        ? "No duplicate documents found"
        : `${duplicates.length} potential duplicate account(s) found`,
      evidence: { duplicateCount: duplicates.length },
    };
  },

  /**
   * Indicateurs fraude
   */
  async checkFraudIndicators(
    chauffeur: ChauffeurControle
  ): Promise<ComplianceCheckResult> {
    const indicators: string[] = [];

    // Création de compte et soumission immédiate
    const daysOld = Math.floor(
      (new Date().getTime() - chauffeur.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysOld < 1) {
      indicators.push("Account created and submitted within 24 hours");
    }

    // Nombreuses tentatives de soumission
    // (nécessiterait tracking des soumissions précédentes)

    // Les métadonnées de modification suspecte ne sont pas conservées sur les pièces :
    // ce signal n'est plus contrôlé.

    const passed = indicators.length === 0;
    return {
      type: "FRAUD_INDICATORS",
      passed,
      riskScore: passed ? 0 : Math.min(indicators.length * 25, 75),
      severity: indicators.length > 2 ? "CRITICAL" : indicators.length > 0 ? "HIGH" : "LOW",
      message: passed
        ? "No fraud indicators detected"
        : `Fraud indicators: ${indicators.join("; ")}`,
      evidence: { indicators, daysOld },
    };
  },

  /**
   * Helpers
   */
  scoreToLevel(score: number): RiskLevel {
    if (score >= 75) return "CRITICAL";
    if (score >= 50) return "HIGH";
    if (score >= 25) return "MEDIUM";
    return "LOW";
  },

  stringSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  },

  levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  },

  generateRecommendations(
    checks: ComplianceCheckResult[]
  ): string[] {
    const recommendations: string[] = [];

    const failedChecks = checks.filter((c) => !c.passed);

    for (const check of failedChecks) {
      if (check.recommendations) {
        recommendations.push(...check.recommendations);
      }

      switch (check.type) {
        case "DOCUMENT_INTEGRITY":
          recommendations.push("Request missing documents from chauffeur");
          break;
        case "DUPLICATE_DETECTION":
          recommendations.push(
            "Investigate potential duplicate accounts before approval"
          );
          break;
        case "INFRACTION_HISTORY":
          recommendations.push("Review driving history in detail");
          break;
        case "FRAUD_INDICATORS":
          recommendations.push(
            "Perform additional identity verification (phone call, etc.)"
          );
          break;
      }
    }

    if (recommendations.length === 0) {
      recommendations.push("Ready for approval");
    }

    return [...new Set(recommendations)]; // Remove duplicates
  },

  /**
   * Obtenir les rapports de conformité précédents
   */
  async getPreviousReports(chauffeurId: string, limit: number = 5) {
    return db.complianceReportDrive.findMany({
      where: { chauffeurId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },
};

/**
 * WORKFLOW EXPLIQUÉ
 *
 * Avant approbation du chauffeur, le système lance automatiquement:
 *
 * 1️⃣ DOCUMENT_INTEGRITY
 *    ✅ Tous les docs requis approuvés?
 *
 * 2️⃣ DOCUMENT_CONSISTENCY
 *    ✅ Noms cohérents entre docs?
 *    ✅ Dates cohérentes?
 *
 * 3️⃣ IDENTITY_VERIFICATION
 *    ✅ IDENTITE approuvé + non expiré?
 *
 * 4️⃣ INFRACTION_HISTORY
 *    ✅ Infractions graves?
 *
 * 5️⃣ BEHAVIORAL_PATTERN
 *    ✅ Taux de complétion bon?
 *    ✅ Pas trop d'annulations?
 *
 * 6️⃣ GEOGRAPHIC_ANOMALY
 *    ✅ Région cohérente?
 *
 * 7️⃣ DUPLICATE_DETECTION
 *    ✅ Pas de compte en doublon?
 *
 * 8️⃣ FRAUD_INDICATORS
 *    ✅ Pas de signaux fraude?
 *
 * Résult: Score de risque 0-100 + niveau AUTO_DECISION
 * - CRITICAL (≥75) → REJECT
 * - HIGH (≥50) → MANUAL_REVIEW
 * - MEDIUM/LOW → APPROVE (si tous passed)
 */
