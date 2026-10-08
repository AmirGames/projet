/**
 * Tests: Driver Payment & Payout System
 * Montants en centimes entiers ; commission = round(prix × pct / 100).
 */

import {
  ZupDrivePaymentDriverService,
  repartirPrixCourse,
} from "../zupdrive-payment-driver.service";
import { ZupDrivePaymentService } from "../zupdrive-payment.service";
import { db } from "../../../services/db";

jest.mock("../../../services/db", () => ({
  db: {
    courseDrive: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    platformSettingsDrive: {
      findUnique: jest.fn(),
    },
    paymentIntentDrive: {
      findMany: jest.fn(),
    },
    driverPayoutDrive: {
      createMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    driverPayoutBatchDrive: {
      findFirst: jest.fn(),
    },
    compteBancaireChauffeurDrive: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("../zupdrive-payment.service", () => ({
  ZupDrivePaymentService: {
    createWeeklyBatch: jest.fn(),
  },
}));

/** Les mocks Prisma renvoient des objets partiels : un seul point de conversion. */
const reponse = (valeur: unknown) => valeur as never;

describe("ZupDrivePaymentDriverService", () => {
  const mockChauffeurId = "chauffeur-123";
  const mockCourseId = "course-789";
  const now = new Date();

  const commission = (pourcent: number) =>
    jest.mocked(db.platformSettingsDrive.findUnique).mockResolvedValue(reponse({ commissionPercentage: pourcent }));

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe("repartirPrixCourse", () => {
    it("garantit commission + part chauffeur = prix, avec arrondi explicite", () => {
      const { commissionCentimes, chauffeurCentimes } = repartirPrixCourse(1001, 20);
      expect(commissionCentimes).toBe(200); // 200,2 arrondi
      expect(chauffeurCentimes).toBe(801);
      expect(commissionCentimes + chauffeurCentimes).toBe(1001);
    });

    it("arrondit la demi-unité vers le haut", () => {
      expect(repartirPrixCourse(1050, 25).commissionCentimes).toBe(263); // 262,5
    });
  });

  describe("calculateCourseEarnings", () => {
    const course = (extra: Record<string, unknown> = {}) =>
      reponse({
        statut: "TERMINEE",
        chauffeurId: mockChauffeurId,
        prixCentimes: 1500,
        distanceMetres: 5000,
        dureeSecondes: 600,
        ...extra,
      });

    it("calcule les revenus d'une course terminée depuis le prix en base", async () => {
      jest.mocked(db.courseDrive.findUnique).mockResolvedValueOnce(course());
      commission(25);

      const earnings = await ZupDrivePaymentDriverService.calculateCourseEarnings({
        courseId: mockCourseId,
        chauffeurId: mockChauffeurId,
      });

      expect(earnings.passengerPrice).toBe(1500);
      expect(earnings.platformCommission).toBe(375);
      expect(earnings.chauffeurEarnings).toBe(1125);
      expect(earnings.distance).toBe(5);
      expect(earnings.duration).toBe(10);
      expect(earnings.status).toBe("COMPLETED");
    });

    it("utilise 20 % si aucun réglage n'existe", async () => {
      jest.mocked(db.courseDrive.findUnique).mockResolvedValueOnce(course({ prixCentimes: 1000 }));
      jest.mocked(db.platformSettingsDrive.findUnique).mockResolvedValueOnce(null);

      const earnings = await ZupDrivePaymentDriverService.calculateCourseEarnings({
        courseId: mockCourseId,
        chauffeurId: mockChauffeurId,
      });

      expect(earnings.platformCommission).toBe(200);
      expect(earnings.chauffeurEarnings).toBe(800);
    });

    it("rejette si la course n'existe pas", async () => {
      jest.mocked(db.courseDrive.findUnique).mockResolvedValueOnce(null);

      await expect(
        ZupDrivePaymentDriverService.calculateCourseEarnings({ courseId: "invalid", chauffeurId: mockChauffeurId })
      ).rejects.toThrow("Course non trouvée");
    });

    it("rejette la course d'un autre chauffeur", async () => {
      jest.mocked(db.courseDrive.findUnique).mockResolvedValueOnce(course({ chauffeurId: "autre" }));

      await expect(
        ZupDrivePaymentDriverService.calculateCourseEarnings({ courseId: mockCourseId, chauffeurId: mockChauffeurId })
      ).rejects.toThrow("Course non trouvée");
    });

    it("rejette si la course n'est pas terminée", async () => {
      jest.mocked(db.courseDrive.findUnique).mockResolvedValueOnce(course({ statut: "EN_COURS" }));

      await expect(
        ZupDrivePaymentDriverService.calculateCourseEarnings({ courseId: mockCourseId, chauffeurId: mockChauffeurId })
      ).rejects.toThrow("Seules les courses complétées");
    });
  });

  describe("getDriverEarnings", () => {
    it("calcule les revenus d'une journée", async () => {
      jest.mocked(db.courseDrive.findMany).mockResolvedValueOnce(
        reponse([
          { id: "course-1", prixCentimes: 1000 },
          { id: "course-2", prixCentimes: 1500 },
        ])
      );
      commission(25);

      const earnings = await ZupDrivePaymentDriverService.getDriverEarnings(mockChauffeurId, "today");

      expect(earnings.coursesCompleted).toBe(2);
      expect(earnings.totalPassengerSpent).toBe(2500);
      expect(earnings.totalCommission).toBe(250 + 375);
      expect(earnings.totalEarnings).toBe(1875);
      expect(earnings.totalCommission + earnings.totalEarnings).toBe(earnings.totalPassengerSpent);
    });

    it("retourne 0 si aucune course", async () => {
      jest.mocked(db.courseDrive.findMany).mockResolvedValueOnce([]);

      const earnings = await ZupDrivePaymentDriverService.getDriverEarnings(mockChauffeurId, "week");

      expect(earnings.coursesCompleted).toBe(0);
      expect(earnings.totalEarnings).toBe(0);
      expect(earnings.totalCommission).toBe(0);
    });

    it("calcule les revenus mensuels", async () => {
      const courses = Array.from({ length: 30 }, (_, i) => ({ id: `course-${i}`, prixCentimes: 1000 }));
      jest.mocked(db.courseDrive.findMany).mockResolvedValueOnce(reponse(courses));
      commission(25);

      const earnings = await ZupDrivePaymentDriverService.getDriverEarnings(mockChauffeurId, "month");

      expect(earnings.coursesCompleted).toBe(30);
      expect(earnings.totalPassengerSpent).toBe(30000);
      expect(earnings.averagePerCourse).toBe(750);
    });
  });

  describe("preparePayout", () => {
    it("crée un versement par paiement confirmé, sans doublon possible", async () => {
      jest.mocked(db.paymentIntentDrive.findMany).mockResolvedValueOnce(
        reponse([
          { id: "pay-1", driverEarningsCentimes: 1600, currency: "EUR" },
          { id: "pay-2", driverEarningsCentimes: 800, currency: "EUR" },
        ])
      );
      jest.mocked(db.driverPayoutDrive.createMany).mockResolvedValueOnce({ count: 2 });

      const payout = await ZupDrivePaymentDriverService.preparePayout(mockChauffeurId);

      expect(payout.payoutsCreated).toBe(2);
      expect(payout.amount).toBe(2400);
      expect(payout.status).toBe("PENDING");
      expect(db.driverPayoutDrive.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skipDuplicates: true,
          data: [
            expect.objectContaining({ paymentId: "pay-1", chauffeurId: mockChauffeurId, amountCentimes: 1600 }),
            expect.objectContaining({ paymentId: "pay-2", chauffeurId: mockChauffeurId, amountCentimes: 800 }),
          ],
        })
      );
    });

    it("avec IBAN enregistré : chaque versement porte la copie normalisée ; sans IBAN : null, le versement est créé quand même", async () => {
      const paiements = reponse([{ id: "pay-1", driverEarningsCentimes: 1600, currency: "EUR" }]);
      jest.mocked(db.driverPayoutDrive.createMany).mockResolvedValue({ count: 1 });

      jest.mocked(db.paymentIntentDrive.findMany).mockResolvedValueOnce(paiements);
      jest.mocked(db.compteBancaireChauffeurDrive.findUnique).mockResolvedValueOnce(reponse({ iban: "be68 5390 0754 7034" }));
      await ZupDrivePaymentDriverService.preparePayout(mockChauffeurId);
      expect(jest.mocked(db.driverPayoutDrive.createMany).mock.calls[0][0]!.data).toEqual([expect.objectContaining({ ibanSnapshot: "BE68539007547034" })]);

      jest.mocked(db.paymentIntentDrive.findMany).mockResolvedValueOnce(paiements);
      jest.mocked(db.compteBancaireChauffeurDrive.findUnique).mockResolvedValueOnce(null);
      await ZupDrivePaymentDriverService.preparePayout(mockChauffeurId);
      expect(jest.mocked(db.driverPayoutDrive.createMany).mock.calls[1][0]!.data).toEqual([expect.objectContaining({ ibanSnapshot: null })]);
    });

    it("ne cherche que les paiements confirmés, de courses terminées, sans versement, de ce chauffeur", async () => {
      jest.mocked(db.paymentIntentDrive.findMany).mockResolvedValueOnce([]);

      await expect(ZupDrivePaymentDriverService.preparePayout(mockChauffeurId)).rejects.toThrow("Aucun revenu");

      expect(db.paymentIntentDrive.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: "SUCCEEDED", payout: null, course: { chauffeurId: mockChauffeurId, statut: "TERMINEE" } },
        })
      );
      expect(db.driverPayoutDrive.createMany).not.toHaveBeenCalled();
    });
  });

  describe("processPayout", () => {
    const payout = (extra: Record<string, unknown> = {}) =>
      reponse({
        id: "payout-123",
        chauffeurId: mockChauffeurId,
        amountCentimes: 1700,
        status: "PENDING",
        batchId: null,
        periodStart: now,
        periodEnd: now,
        ...extra,
      });

    it("rattache le versement au lot hebdomadaire sans simuler de virement", async () => {
      jest.mocked(db.driverPayoutDrive.findUnique).mockResolvedValueOnce(payout());
      jest.mocked(db.driverPayoutBatchDrive.findFirst).mockResolvedValueOnce(null);
      jest.mocked(ZupDrivePaymentService.createWeeklyBatch).mockResolvedValueOnce(reponse({ id: "batch-1" }));

      const result = await ZupDrivePaymentDriverService.processPayout("payout-123");

      expect(result.status).toBe("PENDING");
      expect(result.batchId).toBe("batch-1");
      expect(result.amount).toBe(1700);
      expect(ZupDrivePaymentService.createWeeklyBatch).toHaveBeenCalledWith(now);
    });

    it("rejette si le payout n'existe pas", async () => {
      jest.mocked(db.driverPayoutDrive.findUnique).mockResolvedValueOnce(null);

      await expect(ZupDrivePaymentDriverService.processPayout("invalid")).rejects.toThrow("Payout non trouvé");
    });

    it("rejette si déjà traité", async () => {
      jest.mocked(db.driverPayoutDrive.findUnique).mockResolvedValueOnce(payout({ status: "PROCESSED" }));

      await expect(ZupDrivePaymentDriverService.processPayout("payout-123")).rejects.toThrow("Payout déjà");
    });

    it("rejette si déjà rattaché à un lot", async () => {
      jest.mocked(db.driverPayoutDrive.findUnique).mockResolvedValueOnce(payout({ batchId: "batch-1" }));

      await expect(ZupDrivePaymentDriverService.processPayout("payout-123")).rejects.toThrow("déjà rattaché");
      expect(ZupDrivePaymentService.createWeeklyBatch).not.toHaveBeenCalled();
    });

    it("rejette si le lot de la période est déjà soumis", async () => {
      jest.mocked(db.driverPayoutDrive.findUnique).mockResolvedValueOnce(payout());
      jest.mocked(db.driverPayoutBatchDrive.findFirst).mockResolvedValueOnce(reponse({ id: "batch-1" }));

      await expect(ZupDrivePaymentDriverService.processPayout("payout-123")).rejects.toThrow("déjà été soumis");
      expect(ZupDrivePaymentService.createWeeklyBatch).not.toHaveBeenCalled();
    });
  });

  describe("getPayoutStatus", () => {
    it("retourne le statut d'un payout du chauffeur", async () => {
      jest.mocked(db.driverPayoutDrive.findFirst).mockResolvedValueOnce(
        reponse({ id: "payout-123", amountCentimes: 1700, status: "PENDING", processedAt: null, failureReason: null })
      );

      const status = await ZupDrivePaymentDriverService.getPayoutStatus("payout-123", mockChauffeurId);

      expect(status.id).toBe("payout-123");
      expect(status.status).toBe("PENDING");
      expect(status.amount).toBe(1700);
      expect(db.driverPayoutDrive.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "payout-123", chauffeurId: mockChauffeurId } })
      );
    });

    it("refuse le payout d'un autre chauffeur", async () => {
      jest.mocked(db.driverPayoutDrive.findFirst).mockResolvedValueOnce(null);

      await expect(ZupDrivePaymentDriverService.getPayoutStatus("payout-123", "autre")).rejects.toThrow(
        "Payout non trouvé"
      );
    });

    it("inclut la raison d'échec", async () => {
      jest.mocked(db.driverPayoutDrive.findFirst).mockResolvedValueOnce(
        reponse({ id: "payout-123", amountCentimes: 1700, status: "FAILED", processedAt: null, failureReason: "Invalid IBAN" })
      );

      const status = await ZupDrivePaymentDriverService.getPayoutStatus("payout-123", mockChauffeurId);

      expect(status.status).toBe("FAILED");
      expect(status.failureReason).toBe("Invalid IBAN");
    });
  });

  describe("getFinancialDashboard", () => {
    it("agrège les données financières", async () => {
      jest.mocked(db.courseDrive.findMany)
        .mockResolvedValueOnce(reponse([{ id: "course-1", prixCentimes: 1000 }]))
        .mockResolvedValueOnce(
          reponse([
            { id: "course-1", prixCentimes: 5000 },
            { id: "course-2", prixCentimes: 3000 },
          ])
        )
        .mockResolvedValueOnce(reponse([{ id: "course-1", prixCentimes: 15000 }]));
      commission(25);
      jest.mocked(db.driverPayoutDrive.findMany).mockResolvedValueOnce(
        reponse([{ id: "payout-1", amountCentimes: 5000, status: "PROCESSED", periodStart: now, periodEnd: now }])
      );

      const dashboard = await ZupDrivePaymentDriverService.getFinancialDashboard(mockChauffeurId);

      expect(dashboard.earnings).toHaveProperty("today");
      expect(dashboard.earnings).toHaveProperty("week");
      expect(dashboard.earnings).toHaveProperty("month");
      expect(dashboard.payoutHistory).toBeDefined();
      expect(dashboard.nextPayoutDate).toBeDefined();
    });
  });

  describe("Commission calculations", () => {
    it.each([
      [20, 5000, 1000, 4000],
      [30, 5000, 1500, 3500],
    ])("commission %i %% sur %i centimes", async (pourcent, prix, attendueCommission, attenduChauffeur) => {
      jest.mocked(db.courseDrive.findUnique).mockResolvedValueOnce(
        reponse({
          statut: "TERMINEE",
          chauffeurId: mockChauffeurId,
          prixCentimes: prix,
          distanceMetres: 10000,
          dureeSecondes: 1200,
        })
      );
      commission(pourcent);

      const earnings = await ZupDrivePaymentDriverService.calculateCourseEarnings({
        courseId: mockCourseId,
        chauffeurId: mockChauffeurId,
      });

      expect(earnings.platformCommission).toBe(attendueCommission);
      expect(earnings.chauffeurEarnings).toBe(attenduChauffeur);
    });
  });
});
