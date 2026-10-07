/**
 * Tests: Driver Payment & Payout System
 */

import { ZupDrivePaymentDriverService } from "../zupdrive-payment-driver.service";
import { db } from "../../../services/db";

jest.mock("../../../services/db", () => ({
  db: {
    courseDrive: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      groupBy: jest.fn(),
    },
    chauffeurDrive: {
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    platformSettingsDrive: {
      findFirst: jest.fn(),
    },
    driverPayoutDrive: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

describe("ZupDrivePaymentDriverService", () => {
  const mockChauffeurId = "chauffeur-123";
  const mockCourseId = "course-789";
  const now = new Date();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("calculateCourseEarnings", () => {
    it("devrait calculer les revenus pour une course complétée", async () => {
      jest.mocked(db.courseDrive.findUnique).mockResolvedValueOnce({
        id: mockCourseId,
        statut: "COMPLETED",
      } as any);

      jest.mocked(db.platformSettingsDrive.findFirst).mockResolvedValueOnce({
        commissionPercentage: 25,
      } as any);

      const earnings = await ZupDrivePaymentDriverService.calculateCourseEarnings({
        courseId: mockCourseId,
        chauffeurId: mockChauffeurId,
        distance: 5,
        duration: 10,
        baseRate: 100, // €1.00/km
        surgeMultiplier: 1.0,
        passengerPrice: 1500, // €15.00
        tips: 200, // €2.00
      });

      expect(earnings.passengerPrice).toBe(1500);
      expect(earnings.platformCommission).toBe(375); // 25% of €15.00
      expect(earnings.chauffeurEarnings).toBe(1325); // 1500 - 375 + 200
      expect(earnings.status).toBe("COMPLETED");
    });

    it("devrait rejeter si la course n'existe pas", async () => {
      jest.mocked(db.courseDrive.findUnique).mockResolvedValueOnce(null);

      await expect(
        ZupDrivePaymentDriverService.calculateCourseEarnings({
          courseId: "invalid",
          chauffeurId: mockChauffeurId,
          distance: 5,
          duration: 10,
          baseRate: 100,
          surgeMultiplier: 1.0,
          passengerPrice: 1500,
          tips: 0,
        })
      ).rejects.toThrow("Course non trouvée");
    });

    it("devrait rejeter si la course n'est pas complétée", async () => {
      jest.mocked(db.courseDrive.findUnique).mockResolvedValueOnce({
        id: mockCourseId,
        statut: "IN_PROGRESS",
      } as any);

      await expect(
        ZupDrivePaymentDriverService.calculateCourseEarnings({
          courseId: mockCourseId,
          chauffeurId: mockChauffeurId,
          distance: 5,
          duration: 10,
          baseRate: 100,
          surgeMultiplier: 1.0,
          passengerPrice: 1500,
          tips: 0,
        })
      ).rejects.toThrow("Seules les courses complétées");
    });

    it("devrait appliquer la commission variable", async () => {
      jest.mocked(db.courseDrive.findUnique).mockResolvedValueOnce({
        id: mockCourseId,
        statut: "COMPLETED",
      } as any);

      jest.mocked(db.platformSettingsDrive.findFirst).mockResolvedValueOnce({
        commissionPercentage: 30, // Taux plus élevé
      } as any);

      const earnings = await ZupDrivePaymentDriverService.calculateCourseEarnings({
        courseId: mockCourseId,
        chauffeurId: mockChauffeurId,
        distance: 5,
        duration: 10,
        baseRate: 100,
        surgeMultiplier: 1.0,
        passengerPrice: 1000, // €10.00
        tips: 0,
      });

      expect(earnings.platformCommission).toBe(300); // 30% of €10.00
      expect(earnings.chauffeurEarnings).toBe(700); // 1000 - 300
    });
  });

  describe("getDriverEarnings", () => {
    it("devrait calculer les revenus d'une journée", async () => {
      jest.mocked(db.courseDrive.findMany).mockResolvedValueOnce([
        {
          id: "course-1",
          prixTotal: 1000,
          pourboire: 100,
          distanceKm: 5,
          dureeMinutes: 10,
        },
        {
          id: "course-2",
          prixTotal: 1500,
          pourboire: 200,
          distanceKm: 7,
          dureeMinutes: 15,
        },
      ] as any);

      jest.mocked(db.platformSettingsDrive.findFirst).mockResolvedValueOnce({
        commissionPercentage: 25,
      } as any);

      const earnings = await ZupDrivePaymentDriverService.getDriverEarnings(
        mockChauffeurId,
        "today"
      );

      expect(earnings.coursesCompleted).toBe(2);
      expect(earnings.totalPassengerSpent).toBe(2500); // 1000 + 1500
      expect(earnings.tips).toBe(300); // 100 + 200
      expect(earnings.totalCommission).toBe(625); // 25% of 2500
      expect(earnings.totalEarnings).toBe(2175); // 2500 - 625 + 300
    });

    it("devrait retourner 0 si aucune course", async () => {
      jest.mocked(db.courseDrive.findMany).mockResolvedValueOnce([]);

      const earnings = await ZupDrivePaymentDriverService.getDriverEarnings(
        mockChauffeurId,
        "week"
      );

      expect(earnings.coursesCompleted).toBe(0);
      expect(earnings.totalEarnings).toBe(0);
      expect(earnings.totalCommission).toBe(0);
    });

    it("devrait calculer les revenus mensuels", async () => {
      const courses = Array(30)
        .fill(null)
        .map((_, i) => ({
          id: `course-${i}`,
          prixTotal: 1000,
          pourboire: 100,
          distanceKm: 5,
          dureeMinutes: 10,
        }));

      jest.mocked(db.courseDrive.findMany).mockResolvedValueOnce(courses as any);

      jest.mocked(db.platformSettingsDrive.findFirst).mockResolvedValueOnce({
        commissionPercentage: 25,
      } as any);

      const earnings = await ZupDrivePaymentDriverService.getDriverEarnings(
        mockChauffeurId,
        "month"
      );

      expect(earnings.coursesCompleted).toBe(30);
      expect(earnings.totalPassengerSpent).toBe(30000);
      expect(earnings.averagePerCourse).toBe(2250); // (30000 - 7500 + 3000) / 30
    });
  });

  describe("preparePayout", () => {
    it("devrait préparer un payout avec revenus", async () => {
      jest.mocked(db.courseDrive.findMany).mockResolvedValueOnce([
        {
          id: "course-1",
          prixTotal: 2000,
          pourboire: 200,
          distanceKm: 8,
          dureeMinutes: 15,
        },
      ] as any);

      jest.mocked(db.platformSettingsDrive.findFirst).mockResolvedValueOnce({
        commissionPercentage: 25,
      } as any);

      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce({
        id: mockChauffeurId,
        user: { id: "user-123", name: "Jean Dupont" },
        bankDetails: { iban: "BE68539007547034" },
      } as any);

      jest.mocked(db.driverPayoutDrive.create).mockResolvedValueOnce({
        id: "payout-123",
        chauffeurId: mockChauffeurId,
        montant: 1700,
        statut: "PENDING",
        periodeDebut: new Date(),
        periodeFinale: new Date(),
      } as any);

      const payout = await ZupDrivePaymentDriverService.preparePayout(mockChauffeurId);

      expect(payout.id).toBe("payout-123");
      expect(payout.status).toBe("PENDING");
      expect(payout.amount).toBe(1700); // 2000 - 500 + 200
      expect(db.driverPayoutDrive.create).toHaveBeenCalled();
    });

    it("devrait rejeter si pas de revenu", async () => {
      jest.mocked(db.courseDrive.findMany).mockResolvedValueOnce([] as any);

      await expect(
        ZupDrivePaymentDriverService.preparePayout(mockChauffeurId)
      ).rejects.toThrow("Aucun revenu");
    });

    it("devrait rejeter si pas de détails bancaires", async () => {
      jest.mocked(db.courseDrive.findMany).mockResolvedValueOnce([
        {
          id: "course-1",
          prixTotal: 1000,
          pourboire: 100,
          distanceKm: 5,
          dureeMinutes: 10,
        },
      ] as any);

      jest.mocked(db.platformSettingsDrive.findFirst).mockResolvedValueOnce({
        commissionPercentage: 25,
      } as any);

      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce({
        id: mockChauffeurId,
        user: { id: "user-123", name: "Jean Dupont" },
        bankDetails: null,
      } as any);

      await expect(
        ZupDrivePaymentDriverService.preparePayout(mockChauffeurId)
      ).rejects.toThrow("Détails bancaires");
    });
  });

  describe("processPayout", () => {
    it("devrait changer le statut à PROCESSING", async () => {
      jest.mocked(db.driverPayoutDrive.findUnique).mockResolvedValueOnce({
        id: "payout-123",
        chauffeurId: mockChauffeurId,
        montant: 1700,
        statut: "PENDING",
        periodeDebut: now,
        periodeFinale: now,
      } as any);

      jest.mocked(db.driverPayoutDrive.update).mockResolvedValueOnce({
        id: "payout-123",
        chauffeurId: mockChauffeurId,
        montant: 1700,
        statut: "PROCESSING",
        periodeDebut: now,
        periodeFinale: now,
      } as any);

      const payout = await ZupDrivePaymentDriverService.processPayout("payout-123");

      expect(payout.status).toBe("PROCESSING");
      expect(db.driverPayoutDrive.update).toHaveBeenCalledWith({
        where: { id: "payout-123" },
        data: {
          statut: "PROCESSING",
          programmeLe: expect.any(Date),
        },
      });
    });

    it("devrait rejeter si payout n'existe pas", async () => {
      jest.mocked(db.driverPayoutDrive.findUnique).mockResolvedValueOnce(null);

      await expect(
        ZupDrivePaymentDriverService.processPayout("invalid")
      ).rejects.toThrow("Payout non trouvé");
    });

    it("devrait rejeter si déjà traité", async () => {
      jest.mocked(db.driverPayoutDrive.findUnique).mockResolvedValueOnce({
        id: "payout-123",
        chauffeurId: mockChauffeurId,
        montant: 1700,
        statut: "COMPLETED",
        periodeDebut: now,
        periodeFinale: now,
      } as any);

      await expect(
        ZupDrivePaymentDriverService.processPayout("payout-123")
      ).rejects.toThrow("Payout déjà");
    });
  });

  describe("getPayoutStatus", () => {
    it("devrait retourner le statut d'un payout", async () => {
      jest.mocked(db.driverPayoutDrive.findUnique).mockResolvedValueOnce({
        id: "payout-123",
        montant: 1700,
        statut: "PROCESSING",
        completeLe: null,
        erreurMotif: null,
      } as any);

      const status = await ZupDrivePaymentDriverService.getPayoutStatus("payout-123");

      expect(status.id).toBe("payout-123");
      expect(status.status).toBe("PROCESSING");
      expect(status.amount).toBe(1700);
    });

    it("devrait inclure la raison d'échec si applicable", async () => {
      jest.mocked(db.driverPayoutDrive.findUnique).mockResolvedValueOnce({
        id: "payout-123",
        montant: 1700,
        statut: "FAILED",
        completeLe: null,
        erreurMotif: "Invalid IBAN",
      } as any);

      const status = await ZupDrivePaymentDriverService.getPayoutStatus("payout-123");

      expect(status.status).toBe("FAILED");
      expect(status.failureReason).toBe("Invalid IBAN");
    });
  });

  describe("getFinancialDashboard", () => {
    it("devrait agréger les données financières", async () => {
      // Mock getDriverEarnings responses for today/week/month
      jest.mocked(db.courseDrive.findMany)
        .mockResolvedValueOnce([
          { id: "course-1", prixTotal: 1000, pourboire: 100, distanceKm: 5, dureeMinutes: 10 },
        ] as any)
        .mockResolvedValueOnce([
          { id: "course-1", prixTotal: 5000, pourboire: 500, distanceKm: 25, dureeMinutes: 50 },
          { id: "course-2", prixTotal: 3000, pourboire: 300, distanceKm: 15, dureeMinutes: 30 },
        ] as any)
        .mockResolvedValueOnce([
          { id: "course-1", prixTotal: 15000, pourboire: 1500, distanceKm: 75, dureeMinutes: 150 },
        ] as any);

      jest.mocked(db.platformSettingsDrive.findFirst).mockResolvedValue({
        commissionPercentage: 25,
      } as any);

      jest.mocked(db.driverPayoutDrive.findMany).mockResolvedValueOnce([
        {
          id: "payout-1",
          montant: 5000,
          statut: "COMPLETED",
          periodeDebut: now,
          periodeFinale: now,
        },
      ] as any);

      const dashboard = await ZupDrivePaymentDriverService.getFinancialDashboard(mockChauffeurId);

      expect(dashboard.earnings).toHaveProperty("today");
      expect(dashboard.earnings).toHaveProperty("week");
      expect(dashboard.earnings).toHaveProperty("month");
      expect(dashboard.payoutHistory).toBeDefined();
      expect(dashboard.nextPayoutDate).toBeDefined();
    });
  });

  describe("Commission calculations", () => {
    it("devrait calculer correctement avec commission 20%", async () => {
      jest.mocked(db.courseDrive.findUnique).mockResolvedValueOnce({
        id: mockCourseId,
        statut: "COMPLETED",
      } as any);

      jest.mocked(db.platformSettingsDrive.findFirst).mockResolvedValueOnce({
        commissionPercentage: 20,
      } as any);

      const earnings = await ZupDrivePaymentDriverService.calculateCourseEarnings({
        courseId: mockCourseId,
        chauffeurId: mockChauffeurId,
        distance: 10,
        duration: 20,
        baseRate: 100,
        surgeMultiplier: 1.0,
        passengerPrice: 5000, // €50.00
        tips: 500, // €5.00
      });

      expect(earnings.platformCommission).toBe(1000); // 20%
      expect(earnings.chauffeurEarnings).toBe(4500); // 5000 - 1000 + 500
    });

    it("devrait calculer correctement avec commission 30%", async () => {
      jest.mocked(db.courseDrive.findUnique).mockResolvedValueOnce({
        id: mockCourseId,
        statut: "COMPLETED",
      } as any);

      jest.mocked(db.platformSettingsDrive.findFirst).mockResolvedValueOnce({
        commissionPercentage: 30,
      } as any);

      const earnings = await ZupDrivePaymentDriverService.calculateCourseEarnings({
        courseId: mockCourseId,
        chauffeurId: mockChauffeurId,
        distance: 10,
        duration: 20,
        baseRate: 100,
        surgeMultiplier: 1.0,
        passengerPrice: 5000,
        tips: 500,
      });

      expect(earnings.platformCommission).toBe(1500); // 30%
      expect(earnings.chauffeurEarnings).toBe(4000); // 5000 - 1500 + 500
    });
  });
});
