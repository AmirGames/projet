/**
 * Tests: Unified Roles Service
 *
 * Valide la progression Client → Chauffeur
 * et l'indépendance des rôles
 */

import { UnifiedRolesService } from "../unified-roles.service";
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
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

/** Résultat Prisma partiel : seuls les champs lus par le service testé sont fournis. */
function partiel<T>(valeur: object): T {
  return valeur as unknown as T;
}

type UserRoleContext = Parameters<typeof UnifiedRolesService.hasRole>[0];

describe("UnifiedRolesService", () => {
  const mockUserId = "user-123";
  const mockCustomerId = "customer-456";
  const mockChauffeurId = "chauffeur-789";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("loadUserRoleContext", () => {
    it("devrait charger un client avec rôles CLIENT_ZUPEAT + PASSENGER_ZUPDRIVE", async () => {
      jest.mocked(db.user.findUnique).mockResolvedValueOnce(partiel({
        id: mockUserId,
        email: "client@example.com",
        customer: { id: mockCustomerId, status: "ACTIVE" },
        driver: null,
        chauffeurDrive: null,
        accesEquipe: [],
      }));

      const context = await UnifiedRolesService.loadUserRoleContext(mockUserId);

      expect(context.roles).toContain("CLIENT_ZUPEAT");
      expect(context.roles).toContain("PASSENGER_ZUPDRIVE");
      expect(context.customerId).toBe(mockCustomerId);
    });

    it("devrait ajouter CHAUFFEUR_VTCZTC si statut=VALIDE", async () => {
      jest.mocked(db.user.findUnique).mockResolvedValueOnce(partiel({
        id: mockUserId,
        email: "chauffeur@example.com",
        customer: { id: mockCustomerId, status: "ACTIVE" },
        driver: null,
        chauffeurDrive: { id: mockChauffeurId, statut: "VALIDE" },
        accesEquipe: [],
      }));

      const context = await UnifiedRolesService.loadUserRoleContext(mockUserId);

      expect(context.roles).toContain("CLIENT_ZUPEAT");
      expect(context.roles).toContain("PASSENGER_ZUPDRIVE");
      expect(context.roles).toContain("CHAUFFEUR_VTCZTC");
      expect(context.chauffeurStatus).toBe("VALIDE");
    });

    it("ne devrait PAS ajouter CHAUFFEUR_VTCZTC si statut=BROUILLON", async () => {
      jest.mocked(db.user.findUnique).mockResolvedValueOnce(partiel({
        id: mockUserId,
        email: "candidate@example.com",
        customer: { id: mockCustomerId, status: "ACTIVE" },
        driver: null,
        chauffeurDrive: { id: mockChauffeurId, statut: "BROUILLON" },
        accesEquipe: [],
      }));

      const context = await UnifiedRolesService.loadUserRoleContext(mockUserId);

      expect(context.roles).toContain("CLIENT_ZUPEAT");
      expect(context.roles).not.toContain("CHAUFFEUR_VTCZTC");
      expect(context.chauffeurStatus).toBe("BROUILLON");
    });

    it("devrait gérer les admins ZupDrive avec rôle ADMIN_ZUPDRIVE", async () => {
      jest.mocked(db.user.findUnique).mockResolvedValueOnce(partiel({
        id: mockUserId,
        email: "admin@zupdrive.com",
        customer: null,
        driver: null,
        chauffeurDrive: null,
        accesEquipe: [{ plateforme: "DRIVE", role: "ADMIN" }],
      }));

      const context = await UnifiedRolesService.loadUserRoleContext(mockUserId);

      expect(context.roles).toContain("ADMIN_ZUPDRIVE");
      expect(context.platformAdmin).toEqual([
        { plateforme: "DRIVE", role: "ADMIN" },
      ]);
    });
  });

  describe("hasRole", () => {
    it("devrait détecter les rôles présents", () => {
      const context: UserRoleContext = {
        userId: mockUserId,
        email: "test@example.com",
        roles: ["CLIENT_ZUPEAT", "PASSENGER_ZUPDRIVE"],
        customerId: mockCustomerId,
      };

      expect(UnifiedRolesService.hasRole(context, "CLIENT_ZUPEAT")).toBe(true);
      expect(UnifiedRolesService.hasRole(context, "CHAUFFEUR_VTCZTC")).toBe(
        false
      );
    });
  });

  describe("createChauffeurCandidacy", () => {
    it("devrait créer un dossier en statut BROUILLON", async () => {
      jest.mocked(db.customer.findUnique).mockResolvedValueOnce(partiel({
        status: "ACTIVE",
      }));

      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce(null);

      jest.mocked(db.chauffeurDrive.create).mockResolvedValueOnce(partiel({
        id: mockChauffeurId,
        userId: mockUserId,
        statut: "BROUILLON",
      }));

      jest.mocked(db.user.findUnique).mockResolvedValueOnce(partiel({
        id: mockUserId,
        email: "client@example.com",
        customer: { id: mockCustomerId, status: "ACTIVE" },
        driver: null,
        chauffeurDrive: { id: mockChauffeurId, statut: "BROUILLON" },
        accesEquipe: [],
      }));

      const result = await UnifiedRolesService.createChauffeurCandidacy({
        userId: mockUserId,
        nomComplet: "Jean Dupont",
        telephone: "0612345678",
        region: "BRUXELLES",
      });

      expect(result.chauffeurStatus).toBe("BROUILLON");
      expect(result.roles).toContain("CLIENT_ZUPEAT");
      // Ne doit PAS avoir CHAUFFEUR_VTCZTC en BROUILLON
      expect(result.roles).not.toContain("CHAUFFEUR_VTCZTC");

      expect(db.chauffeurDrive.create).toHaveBeenCalledWith({
        data: {
          userId: mockUserId,
          nomComplet: "Jean Dupont",
          telephone: "0612345678",
          region: "BRUXELLES",
          statut: "BROUILLON",
        },
      });
    });

    it("devrait rejeter si client n'est pas ACTIVE", async () => {
      jest.mocked(db.customer.findUnique).mockResolvedValueOnce(partiel({
        status: "BLOCKED",
      }));

      await expect(
        UnifiedRolesService.createChauffeurCandidacy({
          userId: mockUserId,
          nomComplet: "Jean Dupont",
          telephone: "0612345678",
          region: "BRUXELLES",
        })
      ).rejects.toThrow("client ZupEat actif");
    });
  });

  describe("submitChauffeurApplication", () => {
    it("devrait passer de BROUILLON à SOUMIS", async () => {
      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce(partiel({
        statut: "BROUILLON",
      }));

      jest.mocked(db.chauffeurDrive.update).mockResolvedValueOnce(partiel({
        statut: "SOUMIS",
        soumisLe: new Date(),
      }));

      jest.mocked(db.user.findUnique).mockResolvedValueOnce(partiel({
        id: mockUserId,
        email: "client@example.com",
        customer: { id: mockCustomerId, status: "ACTIVE" },
        driver: null,
        chauffeurDrive: { id: mockChauffeurId, statut: "SOUMIS" },
        accesEquipe: [],
      }));

      const result =
        await UnifiedRolesService.submitChauffeurApplication(mockUserId);

      expect(result.chauffeurStatus).toBe("SOUMIS");
      expect(db.chauffeurDrive.update).toHaveBeenCalled();
    });
  });

  describe("approveChauffeur", () => {
    it("devrait passer de SOUMIS à VALIDE et ajouter rôle CHAUFFEUR_VTCZTC", async () => {
      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce(partiel({
        userId: mockUserId,
        statut: "SOUMIS",
      }));

      jest.mocked(db.chauffeurDrive.update).mockResolvedValueOnce(partiel({
        statut: "VALIDE",
        valideLe: new Date(),
      }));

      jest.mocked(db.user.findUnique).mockResolvedValueOnce(partiel({
        id: mockUserId,
        email: "client@example.com",
        customer: { id: mockCustomerId, status: "ACTIVE" },
        driver: null,
        chauffeurDrive: { id: mockChauffeurId, statut: "VALIDE" },
        accesEquipe: [],
      }));

      const result = await UnifiedRolesService.approveChauffeur({
        chauffeurId: mockChauffeurId,
        approvedBy: "admin-123",
      });

      expect(result.chauffeurStatus).toBe("VALIDE");
      expect(result.roles).toContain("CHAUFFEUR_VTCZTC");
      expect(db.chauffeurDrive.update).toHaveBeenCalledWith({
        where: { id: mockChauffeurId },
        data: {
          statut: "VALIDE",
          valideLe: expect.any(Date),
          validePar: "admin-123",
        },
      });
    });
  });

  describe("suspendChauffeur", () => {
    it("devrait suspendre le chauffeur (CLIENT reste intact)", async () => {
      jest.mocked(db.chauffeurDrive.update).mockResolvedValueOnce(partiel({
        statut: "SUSPENDU",
        motifStatut: "Comportement inapproprié",
      }));

      await UnifiedRolesService.suspendChauffeur({
        chauffeurId: mockChauffeurId,
        reason: "Comportement inapproprié",
        suspendedBy: "admin-123",
      });

      expect(db.chauffeurDrive.update).toHaveBeenCalledWith({
        where: { id: mockChauffeurId },
        data: {
          statut: "SUSPENDU",
          motifStatut: "Comportement inapproprié",
        },
      });
    });
  });

  describe("Multi-role independence", () => {
    it("suspension driver ne devrait pas affecter CLIENT_ZUPEAT", async () => {
      // Setup: client with driver role VALIDE
      const validDriver = {
        id: mockUserId,
        email: "driver@example.com",
        customer: { id: mockCustomerId, status: "ACTIVE" },
        driver: null,
        chauffeurDrive: { id: mockChauffeurId, statut: "VALIDE" },
        accesEquipe: [],
      };

      jest.mocked(db.user.findUnique).mockResolvedValueOnce(partiel(validDriver));

      // Before suspension
      const beforeContext =
        await UnifiedRolesService.loadUserRoleContext(mockUserId);
      expect(beforeContext.roles).toContain("CLIENT_ZUPEAT");
      expect(beforeContext.roles).toContain("CHAUFFEUR_VTCZTC");

      // Suspend driver
      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce(partiel({
        statut: "VALIDE",
      }));

      jest.mocked(db.chauffeurDrive.update).mockResolvedValueOnce(partiel({
        statut: "SUSPENDU",
      }));

      await UnifiedRolesService.suspendChauffeur({
        chauffeurId: mockChauffeurId,
        reason: "Test",
        suspendedBy: "admin-123",
      });

      // After suspension
      const suspendedDriver = {
        id: mockUserId,
        email: "driver@example.com",
        customer: { id: mockCustomerId, status: "ACTIVE" },
        driver: null,
        chauffeurDrive: { id: mockChauffeurId, statut: "SUSPENDU" },
        accesEquipe: [],
      };

      jest.mocked(db.user.findUnique).mockResolvedValueOnce(
        partiel(suspendedDriver)
      );

      const afterContext =
        await UnifiedRolesService.loadUserRoleContext(mockUserId);
      expect(afterContext.roles).toContain("CLIENT_ZUPEAT"); // ✅ Still there!
      expect(afterContext.roles).not.toContain("CHAUFFEUR_VTCZTC"); // ❌ Gone
    });
  });

  describe("hasZupEatAccess / hasZupDriveAccess", () => {
    it("CLIENT_ZUPEAT devrait avoir accès à ZupEat ET ZupDrive", () => {
      const clientContext: UserRoleContext = {
        userId: mockUserId,
        email: "client@example.com",
        roles: ["CLIENT_ZUPEAT", "PASSENGER_ZUPDRIVE"],
        customerId: mockCustomerId,
      };

      expect(UnifiedRolesService.hasZupEatAccess(clientContext)).toBe(true);
      expect(UnifiedRolesService.hasZupDriveAccess(clientContext)).toBe(true);
    });

    it("CHAUFFEUR_VTCZTC devrait avoir accès à ZupDrive uniquement", () => {
      const driverContext: UserRoleContext = {
        userId: mockUserId,
        email: "driver@example.com",
        roles: ["CHAUFFEUR_VTCZTC"],
        chauffeurId: mockChauffeurId,
        chauffeurStatus: "VALIDE",
      };

      expect(UnifiedRolesService.hasZupEatAccess(driverContext)).toBe(false);
      expect(UnifiedRolesService.hasZupDriveAccess(driverContext)).toBe(true);
    });
  });
});
