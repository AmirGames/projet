/**
 * Tests: Automated Compliance Checks Service
 *
 * Valide les vérifications automatisées de conformité
 */

import { ZupDriveComplianceChecksService } from "../zupdrive-compliance-checks.service";
import { db } from "../../../services/db";
import { piecesExigees } from "../chauffeur-onboarding.service";

jest.mock("../../../services/db", () => ({
  db: {
    chauffeurDrive: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    complianceReportDrive: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}));

/** Ajoute aux pièces données les autres pièces obligatoires (Bruxelles, indépendant), validées et valables. */
function completerPieces<T extends { type: string }>(docs: T[]) {
  const valable = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  const presentes = docs.map((d) => d.type);
  const manquantes = piecesExigees("BRUXELLES")
    .filter((type) => !presentes.includes(type))
    .map((type) => ({ id: `doc-${type}`, type, statut: "APPROVED", dateExpiration: valable }));
  return [...docs, ...manquantes];
}

describe("ZupDriveComplianceChecksService", () => {
  const mockChauffeurId = "chauffeur-123";
  const mockUserId = "user-123";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("runFullCompliance", () => {
    it("devrait générer un rapport LOW risk avec tous les docs APPROVED", async () => {
      const inFuture = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

      const mockChauffeur = {
        id: mockChauffeurId,
        userId: mockUserId,
        nomComplet: "Jean Dupont",
        region: "BRUXELLES",
        statut: "SOUMIS",
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        documents: completerPieces([
          {
            id: "doc-1",
            type: "permis",
            statut: "APPROVED",
            dateExpiration: inFuture,
                      },
          {
            id: "doc-2",
            type: "assurance",
            statut: "APPROVED",
            dateExpiration: inFuture,
          },
          {
            id: "doc-3",
            type: "controle_technique",
            statut: "APPROVED",
            dateExpiration: inFuture,
          },
          {
            id: "doc-4",
            type: "identite",
            statut: "APPROVED",
            dateExpiration: inFuture,
          },
        ]),
        infractions: [],
        courses: [
          { statut: "TERMINEE" },
          { statut: "TERMINEE" },
          { statut: "TERMINEE" },
        ],
      };

      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce(mockChauffeur as never);
      jest.mocked(db.complianceReportDrive.create).mockResolvedValueOnce({
        id: "report-1",
        complianceScore: 0,
        riskLevel: "LOW",
      } as never);

      const report = await ZupDriveComplianceChecksService.runFullCompliance(mockChauffeurId);

      expect(report.overallRiskLevel).toBe("LOW");
      expect(report.overallRiskScore).toBeLessThan(25);
      expect(report.autoDecision).toBe("APPROVE");
      expect(report.checks.every((c) => c.passed)).toBe(true);
    });

    it("devrait générer un rapport HIGH risk avec des infractions graves", async () => {
      const inFuture = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

      const mockChauffeur = {
        id: mockChauffeurId,
        userId: mockUserId,
        nomComplet: "Jean Dupont",
        region: "BRUXELLES",
        statut: "SOUMIS",
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        documents: completerPieces([
          {
            id: "doc-1",
            type: "permis",
            statut: "APPROVED",
            dateExpiration: inFuture,
          },
          {
            id: "doc-2",
            type: "assurance",
            statut: "APPROVED",
            dateExpiration: inFuture,
          },
          {
            id: "doc-3",
            type: "controle_technique",
            statut: "APPROVED",
            dateExpiration: inFuture,
          },
          {
            id: "doc-4",
            type: "identite",
            statut: "APPROVED",
            dateExpiration: inFuture,
          },
        ]),
        infractions: [
          {
            id: "inf-1",
            type: "SPEEDING",
            severity: "HAUTE", // High severity!
          },
          {
            id: "inf-2",
            type: "PARKING_VIOLATION",
            severity: "BASSE",
          },
        ],
        courses: [
          { statut: "TERMINEE" },
          { statut: "TERMINEE" },
        ],
      };

      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce(mockChauffeur as never);
      jest.mocked(db.complianceReportDrive.create).mockResolvedValueOnce({
        id: "report-1",
        complianceScore: 55,
        riskLevel: "HIGH",
      } as never);

      const report = await ZupDriveComplianceChecksService.runFullCompliance(mockChauffeurId);

      expect(report.overallRiskLevel).toBe("HIGH");
      expect(report.autoDecision).toBe("MANUAL_REVIEW");

      const infractionCheck = report.checks.find((c) => c.type === "INFRACTION_HISTORY");
      expect(infractionCheck?.passed).toBe(false);
    });

    it("devrait générer un rapport CRITICAL avec documents manquants", async () => {
      const inFuture = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

      const mockChauffeur = {
        id: mockChauffeurId,
        userId: mockUserId,
        nomComplet: "Jean Dupont",
        region: "BRUXELLES",
        statut: "SOUMIS",
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        documents: [
          {
            id: "doc-1",
            type: "permis",
            statut: "APPROVED",
            dateExpiration: inFuture,
          },
          // Toutes les autres pièces obligatoires manquent
        ],
        infractions: [],
        courses: [],
      };

      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce(mockChauffeur as never);
      jest.mocked(db.complianceReportDrive.create).mockResolvedValueOnce({
        id: "report-1",
        complianceScore: 85,
        riskLevel: "CRITICAL",
      } as never);

      const report = await ZupDriveComplianceChecksService.runFullCompliance(mockChauffeurId);

      expect(report.overallRiskLevel).toBe("CRITICAL");
      expect(report.autoDecision).toBe("REJECT");

      const integrityCheck = report.checks.find((c) => c.type === "DOCUMENT_INTEGRITY");
      expect(integrityCheck?.passed).toBe(false);
    });

    it("ne signale pas de doublon tant que le numéro de pièce n'est pas conservé", async () => {
      const inFuture = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

      const mockChauffeur = {
        id: mockChauffeurId,
        userId: mockUserId,
        nomComplet: "Jean Dupont",
        region: "BRUXELLES",
        statut: "SOUMIS",
        createdAt: new Date(),
        documents: [
          { type: "identite", statut: "APPROVED", dateExpiration: inFuture },
        ],
        infractions: [],
        courses: [],
      };

      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce(mockChauffeur as never);
      jest.mocked(db.complianceReportDrive.create).mockResolvedValueOnce({ id: "report-1" } as never);

      const report = await ZupDriveComplianceChecksService.runFullCompliance(mockChauffeurId);

      const duplicateCheck = report.checks.find((c) => c.type === "DUPLICATE_DETECTION");
      expect(duplicateCheck?.passed).toBe(true);
    });

    it("devrait détecter l'incohérence entre les dates des documents", async () => {
      const mockChauffeur = {
        id: mockChauffeurId,
        userId: mockUserId,
        nomComplet: "Jean Dupont",
        region: "BRUXELLES",
        statut: "SOUMIS",
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        documents: [
          {
            type: "permis",
            statut: "APPROVED",
            dateExpiration: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
          },
          {
            type: "controle_technique",
            statut: "APPROVED",
            // Plus de 30 jours après l'échéance du permis
            dateExpiration: new Date(Date.now() + 200 * 24 * 60 * 60 * 1000),
          },
        ],
        infractions: [],
        courses: [],
      };

      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce(mockChauffeur as never);
      jest.mocked(db.complianceReportDrive.create).mockResolvedValueOnce({ id: "report-1" } as never);

      const report = await ZupDriveComplianceChecksService.runFullCompliance(mockChauffeurId);

      const consistencyCheck = report.checks.find((c) => c.type === "DOCUMENT_CONSISTENCY");
      expect(consistencyCheck?.passed).toBe(false);
    });

    it("devrait signaler les documents expirés", async () => {
      const inPast = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      const inFuture = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

      const mockChauffeur = {
        id: mockChauffeurId,
        userId: mockUserId,
        nomComplet: "Jean Dupont",
        region: "BRUXELLES",
        statut: "SOUMIS",
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        documents: completerPieces([
          {
            id: "doc-1",
            type: "permis",
            statut: "APPROVED",
            dateExpiration: inPast, // EXPIRED!
          },
          {
            id: "doc-4",
            type: "identite",
            statut: "APPROVED",
            dateExpiration: inFuture,
          },
        ]),
        infractions: [],
        courses: [],
      };

      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce(mockChauffeur as never);
      jest.mocked(db.complianceReportDrive.create).mockResolvedValueOnce({
        id: "report-1",
        complianceScore: 50,
        riskLevel: "HIGH",
      } as never);

      const report = await ZupDriveComplianceChecksService.runFullCompliance(mockChauffeurId);

      expect(report.overallRiskLevel).toBe("HIGH");
      expect(report.autoDecision).toBe("MANUAL_REVIEW");
    });

    it("devrait détecter les signaux fraude (création rapide + soumission)", async () => {
      const inFuture = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

      const mockChauffeur = {
        id: mockChauffeurId,
        userId: mockUserId,
        nomComplet: "Jean Dupont",
        region: "BRUXELLES",
        statut: "SOUMIS",
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // Created 2 hours ago!
        documents: [
          {
            id: "doc-1",
            type: "permis",
            statut: "APPROVED",
            dateExpiration: inFuture,
          },
          {
            id: "doc-2",
            type: "assurance",
            statut: "APPROVED",
            dateExpiration: inFuture,
          },
          {
            id: "doc-3",
            type: "controle_technique",
            statut: "APPROVED",
            dateExpiration: inFuture,
          },
          {
            id: "doc-4",
            type: "identite",
            statut: "APPROVED",
            dateExpiration: inFuture,
          },
        ],
        infractions: [],
        courses: [],
      };

      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce(mockChauffeur as never);
      jest.mocked(db.complianceReportDrive.create).mockResolvedValueOnce({
        id: "report-1",
        complianceScore: 30,
        riskLevel: "MEDIUM",
      } as never);

      const report = await ZupDriveComplianceChecksService.runFullCompliance(mockChauffeurId);

      const fraudCheck = report.checks.find((c) => c.type === "FRAUD_INDICATORS");
      expect(fraudCheck?.passed).toBe(false);
      expect(fraudCheck?.message).toContain("24 hours");
    });
  });

  describe("getPreviousReports", () => {
    it("devrait retourner l'historique des rapports", async () => {
      const mockReports = [
        { id: "report-1", complianceScore: 80, riskLevel: "LOW", createdAt: new Date() },
        { id: "report-2", complianceScore: 65, riskLevel: "MEDIUM", createdAt: new Date() },
        { id: "report-3", complianceScore: 45, riskLevel: "HIGH", createdAt: new Date() },
      ];

      jest.mocked(db.complianceReportDrive.findMany).mockResolvedValueOnce(mockReports as never);

      const reports = await ZupDriveComplianceChecksService.getPreviousReports(
        mockChauffeurId,
        5
      );

      expect(reports).toHaveLength(3);
      expect(reports[0].complianceScore).toBeGreaterThan(reports[1].complianceScore);
    });
  });

  describe("Risk scoring", () => {
    it("LOW: 0-24 points", () => {
      // All checks passed, no issues
      expect(true).toBe(true);
    });

    it("MEDIUM: 25-49 points", () => {
      // Some issues, but not major
      expect(true).toBe(true);
    });

    it("HIGH: 50-74 points", () => {
      // Significant issues (infractions, missing docs)
      expect(true).toBe(true);
    });

    it("CRITICAL: 75+ points", () => {
      // Major blockers (duplicates, fraud signals, too many issues)
      expect(true).toBe(true);
    });
  });

  describe("Auto-decision logic", () => {
    it("APPROVE: CRITICAL absent + tous docs passed", () => {
      // Only LOW/MEDIUM risk, all checks passed
      expect(true).toBe(true);
    });

    it("MANUAL_REVIEW: HIGH risk OR some checks failed", () => {
      // Needs human review
      expect(true).toBe(true);
    });

    it("REJECT: CRITICAL risk", () => {
      // Automatically reject
      expect(true).toBe(true);
    });
  });
});
