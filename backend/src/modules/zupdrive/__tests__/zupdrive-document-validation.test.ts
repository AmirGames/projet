/**
 * Tests: Document Validation Service
 *
 * Valide le workflow de vérification des documents:
 * - Upload documents
 * - Admin validation
 * - Expiration detection
 * - Readiness check
 */

import { ZupDriveDocumentValidationService } from "../zupdrive-document-validation.service";
import { db } from "../../../services/db";

jest.mock("../../../services/db", () => ({
  db: {
    chauffeurDrive: {
      findUnique: jest.fn(),
    },
    documentChauffeurDrive: {
      upsert: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

describe("ZupDriveDocumentValidationService", () => {
  const mockChauffeurId = "chauffeur-123";
  const mockUserId = "user-123";
  const adminId = "admin-123";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("uploadDocument", () => {
    it("devrait uploader un document en statut PENDING", async () => {
      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce({
        statut: "BROUILLON",
      } as any);

      jest.mocked(db.documentChauffeurDrive.upsert).mockResolvedValueOnce({
        id: "doc-1",
        chauffeurId: mockChauffeurId,
        type: "PERMIS",
        url: "https://example.com/permis.pdf",
        statut: "PENDING",
        dateExpiration: new Date("2028-10-07"),
      } as any);

      const result = await ZupDriveDocumentValidationService.uploadDocument({
        chauffeurId: mockChauffeurId,
        type: "PERMIS",
        url: "https://example.com/permis.pdf",
        expiresAt: new Date("2028-10-07"),
      });

      expect(result.status).toBe("PENDING");
      expect(result.type).toBe("PERMIS");
      expect(result.url).toBe("https://example.com/permis.pdf");
    });

    it("devrait rejeter si chauffeur n'existe pas", async () => {
      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce(null);

      await expect(
        ZupDriveDocumentValidationService.uploadDocument({
          chauffeurId: "invalid-id",
          type: "PERMIS",
          url: "https://example.com/permis.pdf",
        })
      ).rejects.toThrow("Chauffeur non trouvé");
    });

    it("devrait rejeter si chauffeur est en statut SOUMIS", async () => {
      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce({
        statut: "SOUMIS",
      } as any);

      await expect(
        ZupDriveDocumentValidationService.uploadDocument({
          chauffeurId: mockChauffeurId,
          type: "PERMIS",
          url: "https://example.com/permis.pdf",
        })
      ).rejects.toThrow("Impossible d'uploader des documents");
    });
  });

  describe("approveDocument", () => {
    it("devrait changer PENDING → APPROVED", async () => {
      jest.mocked(db.documentChauffeurDrive.update).mockResolvedValueOnce({
        id: "doc-1",
        type: "PERMIS",
        statut: "APPROVED",
        examineLe: new Date(),
        url: "https://example.com/permis.pdf",
      } as any);

      const result = await ZupDriveDocumentValidationService.approveDocument({
        documentId: "doc-1",
        approvedBy: adminId,
      });

      expect(result.status).toBe("APPROVED");
      expect(result.verifiedAt).toBeDefined();
    });
  });

  describe("rejectDocument", () => {
    it("devrait changer PENDING → REJECTED avec raison", async () => {
      jest.mocked(db.documentChauffeurDrive.update).mockResolvedValueOnce({
        id: "doc-1",
        type: "PERMIS",
        statut: "REJECTED",
        noteExamen: "Permis expiré",
        examineLe: new Date(),
        url: "https://example.com/permis.pdf",
      } as any);

      const result = await ZupDriveDocumentValidationService.rejectDocument({
        documentId: "doc-1",
        reason: "Permis expiré",
        rejectedBy: adminId,
      });

      expect(result.status).toBe("REJECTED");
      expect(result.rejectionReason).toBe("Permis expiré");
    });
  });

  describe("getChauffeurDocuments", () => {
    it("devrait retourner le résumé des documents avec statuts", async () => {
      const now = new Date();
      const inFuture = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 jours

      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce({
        region: "BRUXELLES",
      } as any);

      jest.mocked(db.documentChauffeurDrive.findMany).mockResolvedValueOnce([
        {
          id: "doc-1",
          type: "PERMIS",
          statut: "APPROVED",
          url: "https://example.com/permis.pdf",
          dateExpiration: inFuture,
        },
        {
          id: "doc-2",
          type: "ASSURANCE",
          statut: "PENDING",
          url: "https://example.com/assurance.pdf",
          dateExpiration: inFuture,
        },
        {
          id: "doc-3",
          type: "INSPECTION",
          statut: "REJECTED",
          url: "https://example.com/inspection.pdf",
          dateExpiration: inFuture,
        },
      ] as any);

      const summary = await ZupDriveDocumentValidationService.getChauffeurDocuments(
        mockChauffeurId
      );

      expect(summary.totalRequired).toBe(4); // BRUXELLES requires 4 docs
      expect(summary.approved).toBe(1);
      expect(summary.pending).toBe(1);
      expect(summary.rejected).toBe(1);
      expect(summary.allValidated).toBe(false);
      expect(summary.nextActionRequired).toContain("Missing documents");
    });

    it("devrait détecter les documents expirés", async () => {
      const now = new Date();
      const inPast = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 jours passés

      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce({
        region: "BRUXELLES",
      } as any);

      jest.mocked(db.documentChauffeurDrive.findMany).mockResolvedValueOnce([
        {
          id: "doc-1",
          type: "PERMIS",
          statut: "APPROVED",
          url: "https://example.com/permis.pdf",
          dateExpiration: inPast,
        },
      ] as any);

      const summary = await ZupDriveDocumentValidationService.getChauffeurDocuments(
        mockChauffeurId
      );

      expect(summary.expired).toBe(1);
      expect(summary.allValidated).toBe(false);
      expect(summary.nextActionRequired).toContain("expired");
    });

    it("devrait marquer allValidated=true si tous les docs requis sont APPROVED", async () => {
      const inFuture = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce({
        region: "BRUXELLES",
      } as any);

      jest.mocked(db.documentChauffeurDrive.findMany).mockResolvedValueOnce([
        {
          id: "doc-1",
          type: "PERMIS",
          statut: "APPROVED",
          dateExpiration: inFuture,
        },
        {
          id: "doc-2",
          type: "ASSURANCE",
          statut: "APPROVED",
          dateExpiration: inFuture,
        },
        {
          id: "doc-3",
          type: "INSPECTION",
          statut: "APPROVED",
          dateExpiration: inFuture,
        },
        {
          id: "doc-4",
          type: "IDENTITE",
          statut: "APPROVED",
          dateExpiration: inFuture,
        },
      ] as any);

      const summary = await ZupDriveDocumentValidationService.getChauffeurDocuments(
        mockChauffeurId
      );

      expect(summary.allValidated).toBe(true);
      expect(summary.nextActionRequired).toBeUndefined();
    });
  });

  describe("canApproveChauffeur", () => {
    it("devrait retourner canApprove=true si tous docs APPROVED", async () => {
      const inFuture = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce({
        region: "BRUXELLES",
      } as any);

      jest.mocked(db.documentChauffeurDrive.findMany).mockResolvedValueOnce([
        { id: "doc-1", type: "PERMIS", statut: "APPROVED", dateExpiration: inFuture },
        { id: "doc-2", type: "ASSURANCE", statut: "APPROVED", dateExpiration: inFuture },
        { id: "doc-3", type: "INSPECTION", statut: "APPROVED", dateExpiration: inFuture },
        { id: "doc-4", type: "IDENTITE", statut: "APPROVED", dateExpiration: inFuture },
      ] as any);

      const result = await ZupDriveDocumentValidationService.canApproveChauffeur(
        mockChauffeurId
      );

      expect(result.canApprove).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("devrait retourner canApprove=false si docs REJECTED", async () => {
      const inFuture = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce({
        region: "BRUXELLES",
      } as any);

      jest.mocked(db.documentChauffeurDrive.findMany).mockResolvedValueOnce([
        { id: "doc-1", type: "PERMIS", statut: "REJECTED", dateExpiration: inFuture },
        { id: "doc-2", type: "ASSURANCE", statut: "APPROVED", dateExpiration: inFuture },
      ] as any);

      const result = await ZupDriveDocumentValidationService.canApproveChauffeur(
        mockChauffeurId
      );

      expect(result.canApprove).toBe(false);
      expect(result.reason).toContain("rejected");
    });

    it("devrait retourner canApprove=false si docs PENDING", async () => {
      const inFuture = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce({
        region: "BRUXELLES",
      } as any);

      jest.mocked(db.documentChauffeurDrive.findMany).mockResolvedValueOnce([
        { id: "doc-1", type: "PERMIS", statut: "APPROVED", dateExpiration: inFuture },
        { id: "doc-2", type: "ASSURANCE", statut: "PENDING", dateExpiration: inFuture },
      ] as any);

      const result = await ZupDriveDocumentValidationService.canApproveChauffeur(
        mockChauffeurId
      );

      expect(result.canApprove).toBe(false);
      expect(result.reason).toContain("pending");
    });
  });

  describe("checkExpirations", () => {
    it("devrait marquer les docs expirés", async () => {
      const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

      jest.mocked(db.documentChauffeurDrive.findMany).mockResolvedValueOnce([
        { id: "doc-1", type: "PERMIS", statut: "APPROVED" },
        { id: "doc-2", type: "ASSURANCE", statut: "APPROVED" },
      ] as any);

      jest.mocked(db.documentChauffeurDrive.update)
        .mockResolvedValueOnce({ statut: "EXPIRED" })
        .mockResolvedValueOnce({ statut: "EXPIRED" });

      const updated = await ZupDriveDocumentValidationService.checkExpirations(
        mockChauffeurId
      );

      expect(updated).toBe(2);
    });
  });

  describe("scheduleExpirationReminders", () => {
    it("devrait envoyer rappel 30 jours avant expiration", async () => {
      const in25Days = new Date(Date.now() + 25 * 24 * 60 * 60 * 1000);

      jest.mocked(db.documentChauffeurDrive.findMany).mockResolvedValueOnce([
        {
          id: "doc-1",
          chauffeurId: mockChauffeurId,
          type: "PERMIS",
          dateExpiration: in25Days,
          rappel30JoursLe: null,
          rappel10JoursLe: null,
        },
      ] as any);

      jest.mocked(db.documentChauffeurDrive.update).mockResolvedValueOnce({
        id: "doc-1",
      } as any);

      const reminders = await ZupDriveDocumentValidationService.scheduleExpirationReminders();

      expect(reminders).toBe(1);
    });
  });

  describe("Integration: Full validation workflow", () => {
    it("flow: upload → admin review → approve → ready for chauffeur approval", async () => {
      // 1. Upload
      jest.mocked(db.chauffeurDrive.findUnique)
        .mockResolvedValueOnce({ statut: "BROUILLON" } as any)
        .mockResolvedValueOnce({ region: "BRUXELLES" } as any);

      jest.mocked(db.documentChauffeurDrive.upsert).mockResolvedValueOnce({
        id: "doc-1",
        type: "PERMIS",
        statut: "PENDING",
      } as any);

      const uploaded = await ZupDriveDocumentValidationService.uploadDocument({
        chauffeurId: mockChauffeurId,
        type: "PERMIS",
        url: "https://example.com/permis.pdf",
      });

      expect(uploaded.status).toBe("PENDING");

      // 2. Admin approves
      jest.mocked(db.documentChauffeurDrive.update).mockResolvedValueOnce({
        id: "doc-1",
        type: "PERMIS",
        statut: "APPROVED",
        examineLe: new Date(),
      } as any);

      const approved = await ZupDriveDocumentValidationService.approveDocument({
        documentId: "doc-1",
        approvedBy: adminId,
      });

      expect(approved.status).toBe("APPROVED");

      // 3. Check readiness
      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce({
        region: "BRUXELLES",
      } as any);

      jest.mocked(db.documentChauffeurDrive.findMany).mockResolvedValueOnce([
        approved as any, // This one approved
        {
          id: "doc-2",
          type: "ASSURANCE",
          statut: "APPROVED",
          dateExpiration: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        },
        {
          id: "doc-3",
          type: "INSPECTION",
          statut: "APPROVED",
          dateExpiration: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        },
        {
          id: "doc-4",
          type: "IDENTITE",
          statut: "APPROVED",
          dateExpiration: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        },
      ] as any);

      const readiness = await ZupDriveDocumentValidationService.canApproveChauffeur(
        mockChauffeurId
      );

      expect(readiness.canApprove).toBe(true);
    });
  });
});
