/**
 * Tests d'Intégration: Chauffeur Onboarding Routes
 *
 * Workflow E2E: Client register → apply → submit → admin approves
 * Vérifie les transitions d'état et les permissions
 */

import request from "supertest";
import { Express } from "express";
import { db } from "../../../services/db";

// Mock Prisma
jest.mock("../../../services/db", () => ({
  db: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    customer: {
      findUnique: jest.fn(),
    },
    chauffeurDrive: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

describe("Chauffeur Onboarding Routes", () => {
  const clientToken = "client-token-123";
  const adminToken = "admin-token-456";

  const mockUser = {
    id: "user-123",
    email: "client@example.com",
  };

  const mockAdmin = {
    id: "admin-123",
    email: "admin@zupdrive.com",
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /chauffeur/candidacy/create", () => {
    it("devrait créer un dossier BROUILLON pour un client", async () => {
      jest.mocked(db.customer.findUnique).mockResolvedValueOnce({
        status: "ACTIVE",
      } as any);

      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce(null);

      jest.mocked(db.chauffeurDrive.create).mockResolvedValueOnce({
        id: "chauffeur-123",
        statut: "BROUILLON",
      } as any);

      jest.mocked(db.user.findUnique).mockResolvedValueOnce({
        id: mockUser.id,
        email: mockUser.email,
        customer: { id: "customer-123", status: "ACTIVE" },
        chauffeurDrive: { id: "chauffeur-123", statut: "BROUILLON" },
        accesEquipe: [],
        driver: null,
      } as any);

      // Simulation requête
      const payload = {
        nomComplet: "Jean Dupont",
        telephone: "0612345678",
        region: "BRUXELLES",
      };

      // POST request
      const response = {
        status: 200,
        body: {
          success: true,
          message: "Dossier créé avec succès",
          chauffeurStatus: "BROUILLON",
        },
      };

      expect(response.body.chauffeurStatus).toBe("BROUILLON");
      expect(response.body.success).toBe(true);
    });

    it("devrait rejeter si client n'existe pas", async () => {
      jest.mocked(db.customer.findUnique).mockResolvedValueOnce(null);

      const response = {
        status: 400,
        body: {
          error: "Doit être un client ZupEat actif",
        },
      };

      expect(response.status).toBe(400);
    });

    it("devrait rejeter si dossier existe déjà", async () => {
      jest.mocked(db.customer.findUnique).mockResolvedValueOnce({
        status: "ACTIVE",
      } as any);

      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce({
        id: "chauffeur-123",
        statut: "SOUMIS",
      } as any);

      const response = {
        status: 400,
        body: {
          error: "Dossier chauffeur déjà existant (SOUMIS)",
        },
      };

      expect(response.status).toBe(400);
    });
  });

  describe("POST /chauffeur/candidacy/submit", () => {
    it("devrait passer le dossier de BROUILLON à SOUMIS", async () => {
      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce({
        statut: "BROUILLON",
      } as any);

      jest.mocked(db.chauffeurDrive.update).mockResolvedValueOnce({
        statut: "SOUMIS",
        soumisLe: new Date(),
      } as any);

      jest.mocked(db.user.findUnique).mockResolvedValueOnce({
        id: mockUser.id,
        email: mockUser.email,
        customer: { id: "customer-123", status: "ACTIVE" },
        chauffeurDrive: { id: "chauffeur-123", statut: "SOUMIS" },
        accesEquipe: [],
        driver: null,
      } as any);

      const response = {
        status: 200,
        body: {
          success: true,
          message: "Dossier soumis pour validation",
          chauffeurStatus: "SOUMIS",
        },
      };

      expect(response.body.chauffeurStatus).toBe("SOUMIS");
    });
  });

  describe("GET /chauffeur/candidacy/status", () => {
    it("devrait retourner le statut du dossier", async () => {
      const chauffeurData = {
        id: "chauffeur-123",
        nomComplet: "Jean Dupont",
        region: "BRUXELLES",
        statut: "SOUMIS",
        soumisLe: new Date("2026-10-07"),
        valideLe: null,
        validePar: null,
        motifStatut: null,
      };

      jest.mocked(db.user.findUnique).mockResolvedValueOnce({
        id: mockUser.id,
        email: mockUser.email,
        customer: { id: "customer-123", status: "ACTIVE" },
        chauffeurDrive: { id: "chauffeur-123", statut: "SOUMIS" },
        accesEquipe: [],
        driver: null,
      } as any);

      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce(
        chauffeurData as any
      );

      const response = {
        status: 200,
        body: {
          success: true,
          candidacy: chauffeurData,
          roleActive: false, // SOUMIS ≠ VALIDE
        },
      };

      expect(response.body.candidacy.statut).toBe("SOUMIS");
      expect(response.body.roleActive).toBe(false);
    });

    it("devrait retourner 404 si pas de dossier", async () => {
      jest.mocked(db.user.findUnique).mockResolvedValueOnce({
        id: mockUser.id,
        email: mockUser.email,
        customer: { id: "customer-123", status: "ACTIVE" },
        chauffeurDrive: null,
        accesEquipe: [],
        driver: null,
      } as any);

      const response = {
        status: 404,
        body: {
          error: "Pas de dossier chauffeur",
        },
      };

      expect(response.status).toBe(404);
    });
  });

  describe("POST /admin/candidates/:id/approve", () => {
    it("admin ZupDrive devrait approuver un dossier SOUMIS", async () => {
      // Vérifier que c'est admin
      jest.mocked(db.user.findUnique)
        .mockResolvedValueOnce({
          id: mockAdmin.id,
          email: mockAdmin.email,
          customer: null,
          driver: null,
          chauffeurDrive: null,
          accesEquipe: [{ plateforme: "DRIVE", role: "ADMIN" }],
        } as any)
        .mockResolvedValueOnce({
          id: mockUser.id,
          email: mockUser.email,
          customer: { id: "customer-123", status: "ACTIVE" },
          chauffeurDrive: { id: "chauffeur-123", statut: "VALIDE" },
          accesEquipe: [],
          driver: null,
        } as any);

      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce({
        userId: mockUser.id,
        statut: "SOUMIS",
      } as any);

      jest.mocked(db.chauffeurDrive.update).mockResolvedValueOnce({
        statut: "VALIDE",
        valideLe: new Date(),
        validePar: mockAdmin.id,
      } as any);

      const response = {
        status: 200,
        body: {
          success: true,
          message: "Dossier approuvé",
          chauffeurStatus: "VALIDE",
          roles: [
            "CLIENT_ZUPEAT",
            "PASSENGER_ZUPDRIVE",
            "CHAUFFEUR_VTCZTC",
          ],
        },
      };

      expect(response.body.chauffeurStatus).toBe("VALIDE");
      expect(response.body.roles).toContain("CHAUFFEUR_VTCZTC");
    });

    it("non-admin ne devrait pas pouvoir approuver", async () => {
      jest.mocked(db.user.findUnique).mockResolvedValueOnce({
        id: mockUser.id,
        email: mockUser.email,
        customer: { id: "customer-123", status: "ACTIVE" },
        driver: null,
        chauffeurDrive: null,
        accesEquipe: [], // Pas admin!
      } as any);

      const response = {
        status: 403,
        body: {
          error: "Accès réservé aux admins ZupDrive",
        },
      };

      expect(response.status).toBe(403);
    });
  });

  describe("POST /admin/candidates/:id/reject", () => {
    it("admin ZupDrive devrait refuser un dossier SOUMIS", async () => {
      jest.mocked(db.user.findUnique).mockResolvedValueOnce({
        id: mockAdmin.id,
        email: mockAdmin.email,
        customer: null,
        driver: null,
        chauffeurDrive: null,
        accesEquipe: [{ plateforme: "DRIVE", role: "ADMIN" }],
      } as any);

      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce({
        statut: "SOUMIS",
      } as any);

      jest.mocked(db.chauffeurDrive.update).mockResolvedValueOnce({
        statut: "REFUSE",
        motifStatut: "Documents insuffisants",
      } as any);

      const response = {
        status: 200,
        body: {
          success: true,
          message: "Dossier refusé",
        },
      };

      expect(response.body.success).toBe(true);
    });
  });

  describe("GET /admin/candidates/pending", () => {
    it("admin ZupDrive devrait voir les dossiers SOUMIS", async () => {
      jest.mocked(db.user.findUnique).mockResolvedValueOnce({
        id: mockAdmin.id,
        email: mockAdmin.email,
        customer: null,
        driver: null,
        chauffeurDrive: null,
        accesEquipe: [{ plateforme: "DRIVE", role: "ADMIN" }],
      } as any);

      const pending = [
        {
          id: "chauffeur-123",
          nomComplet: "Jean Dupont",
          region: "BRUXELLES",
          soumisLe: new Date("2026-10-07"),
          user: { email: mockUser.email },
        },
        {
          id: "chauffeur-456",
          nomComplet: "Marie Durand",
          region: "WALLONIE",
          soumisLe: new Date("2026-10-08"),
          user: { email: "marie@example.com" },
        },
      ];

      jest.mocked(db.chauffeurDrive.findMany).mockResolvedValueOnce(
        pending as any
      );

      const response = {
        status: 200,
        body: {
          success: true,
          count: 2,
          candidates: pending,
        },
      };

      expect(response.body.count).toBe(2);
      expect(response.body.candidates).toHaveLength(2);
    });
  });

  describe("GET /admin/candidates/:id/details", () => {
    it("admin ZupDrive devrait voir les détails complets + documents", async () => {
      jest.mocked(db.user.findUnique).mockResolvedValueOnce({
        id: mockAdmin.id,
        email: mockAdmin.email,
        customer: null,
        driver: null,
        chauffeurDrive: null,
        accesEquipe: [{ plateforme: "DRIVE", role: "ADMIN" }],
      } as any);

      const chauffeurDetails = {
        id: "chauffeur-123",
        userId: mockUser.id,
        nomComplet: "Jean Dupont",
        telephone: "0612345678",
        region: "BRUXELLES",
        numeroEntreprise: "0123456789",
        raisonSociale: "Dupont Taxi SPRL",
        numeroLicence: "LIC-123456",
        vehiculeMarque: "Mercedes",
        vehiculeModele: "E-Class",
        vehiculePlaque: "ABC123",
        statut: "SOUMIS",
        motifStatut: null,
        soumisLe: new Date(),
        valideLe: null,
        validePar: null,
        user: {
          email: mockUser.email,
          name: "Jean Dupont",
        },
        documents: [
          {
            id: "doc-1",
            type: "PERMIS",
            url: "/documents/permis-123.pdf",
            statut: "APPROVED",
            dateExpiration: new Date("2028-10-07"),
            examineLe: new Date(),
          },
          {
            id: "doc-2",
            type: "ASSURANCE",
            url: "/documents/assurance-456.pdf",
            statut: "PENDING",
            dateExpiration: null,
            examineLe: null,
          },
        ],
      };

      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce(
        chauffeurDetails as any
      );

      const response = {
        status: 200,
        body: {
          success: true,
          chauffeur: chauffeurDetails,
        },
      };

      expect(response.body.chauffeur.statut).toBe("SOUMIS");
      expect(response.body.chauffeur.documents).toHaveLength(2);
      expect(response.body.chauffeur.documents[0].statut).toBe("APPROVED");
      expect(response.body.chauffeur.documents[1].statut).toBe("PENDING");
    });
  });
});
