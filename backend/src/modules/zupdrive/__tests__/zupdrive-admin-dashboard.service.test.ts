import { ZupDriveAdminDashboardService } from "../zupdrive-admin-dashboard.service";
import { db } from "../../../services/db";

jest.mock("../../../services/db", () => ({
  db: {
    courseDrive: {
      count: jest.fn(),
      groupBy: jest.fn(),
      aggregate: jest.fn(),
      findMany: jest.fn(),
    },
    chauffeurDrive: {
      count: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
    },
    driverPayoutDrive: {
      count: jest.fn(),
      aggregate: jest.fn(),
      findMany: jest.fn(),
    },
    driverPayoutBatchDrive: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    noteCourseDrive: {
      aggregate: jest.fn(),
    },
  },
}));

describe("ZupDriveAdminDashboardService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getDashboardMetrics", () => {
    it("should return dashboard metrics", async () => {
      (db.courseDrive.count as jest.Mock).mockResolvedValue(2);
      (db.courseDrive.groupBy as jest.Mock)
        .mockResolvedValueOnce([
          { statut: "TERMINEE", _count: 1 },
          { statut: "RECHERCHE", _count: 1 },
        ])
        .mockResolvedValueOnce([
          { region: "BRUXELLES", _count: 2 },
        ]);
      (db.courseDrive.aggregate as jest.Mock).mockResolvedValue({
        _avg: { prixCentimes: 1750 },
        _sum: { prixCentimes: 3500 },
      });
      (db.chauffeurDrive.count as jest.Mock)
        .mockResolvedValueOnce(10) // totalActive
        .mockResolvedValueOnce(5); // totalOnline
      (db.driverPayoutDrive.aggregate as jest.Mock)
        .mockResolvedValueOnce({
          _sum: { amountCentimes: 50000 },
        })
        .mockResolvedValueOnce({
          _avg: { amountCentimes: 5000 },
          _count: 10,
        });
      (db.driverPayoutDrive.count as jest.Mock)
        .mockResolvedValueOnce(100) // processed
        .mockResolvedValueOnce(10); // pending
      (db.noteCourseDrive.aggregate as jest.Mock).mockResolvedValue({
        _avg: { note: 4.5 },
      });

      const metrics = await ZupDriveAdminDashboardService.getDashboardMetrics();

      expect(metrics.courses.totalToday).toBe(2);
      expect(metrics.drivers.totalActive).toBe(10);
      expect(metrics.drivers.totalOnline).toBe(5);
      expect(metrics.payments.totalProcessed).toBe(100);
      expect(metrics.payments.totalPending).toBe(10);
    });

    it("should filter by region if provided", async () => {
      (db.courseDrive.count as jest.Mock).mockResolvedValue(1);
      (db.courseDrive.groupBy as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      (db.courseDrive.aggregate as jest.Mock).mockResolvedValue({
        _avg: { prixCentimes: null },
        _sum: { prixCentimes: null },
      });
      (db.chauffeurDrive.count as jest.Mock).mockResolvedValue(0);
      (db.driverPayoutDrive.aggregate as jest.Mock)
        .mockResolvedValueOnce({ _sum: { amountCentimes: null } })
        .mockResolvedValueOnce({ _avg: { amountCentimes: null }, _count: 0 });
      (db.driverPayoutDrive.count as jest.Mock)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      (db.noteCourseDrive.aggregate as jest.Mock).mockResolvedValue({
        _avg: { note: null },
      });

      await ZupDriveAdminDashboardService.getDashboardMetrics("BRUXELLES");

      expect(db.courseDrive.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            region: "BRUXELLES",
          }),
        })
      );
    });
  });

  describe("getPayoutBatches", () => {
    it("should return payout batches with pagination", async () => {
      const mockBatches = [
        {
          id: "batch-1",
          periodStart: new Date("2026-10-06"),
          periodEnd: new Date("2026-10-13"),
          status: "SUCCEEDED",
          totalAmountCentimes: 50000,
          payoutCount: 5,
          submittedAt: new Date(),
          processedAt: new Date(),
          stripeTransferId: "po_xxx",
          failureReason: null,
          payouts: [],
        },
      ];

      (db.driverPayoutBatchDrive.findMany as jest.Mock).mockResolvedValue(mockBatches);
      (db.driverPayoutBatchDrive.count as jest.Mock).mockResolvedValue(1);

      const result = await ZupDriveAdminDashboardService.getPayoutBatches(50, 0);

      expect(result.batches).toHaveLength(1);
      expect(result.batches[0].id).toBe("batch-1");
      expect(result.pagination.total).toBe(1);
    });
  });

  describe("getCoursesList", () => {
    it("should return courses with filters", async () => {
      const mockCourses = [
        {
          id: "1",
          region: "BRUXELLES",
          statut: "TERMINEE",
          prixCentimes: 1500,
          chauffeur: { id: "driver-1", nomComplet: "Jean Dupont" },
          paymentIntent: { status: "SUCCEEDED", amountCentimes: 1500 },
          createdAt: new Date(),
          termineeLe: new Date(),
        },
      ];

      (db.courseDrive.findMany as jest.Mock).mockResolvedValue(mockCourses);
      (db.courseDrive.count as jest.Mock).mockResolvedValue(1);

      const result = await ZupDriveAdminDashboardService.getCoursesList(
        { region: "BRUXELLES" },
        50,
        0
      );

      expect(result.courses).toHaveLength(1);
      expect(result.courses[0].region).toBe("BRUXELLES");
      expect(result.pagination.total).toBe(1);
    });
  });

  describe("getDriverStats", () => {
    it("should return detailed driver statistics", async () => {
      const mockDriver = {
        id: "driver-1",
        nomComplet: "Jean Dupont",
        statut: "VALIDE",
        positionLe: new Date(),
      };

      const mockCourses = [
        { id: "1", statut: "TERMINEE", createdAt: new Date() },
        { id: "2", statut: "TERMINEE", createdAt: new Date() },
        { id: "3", statut: "ANNULEE", createdAt: new Date() },
      ];

      (db.chauffeurDrive.findUniqueOrThrow as jest.Mock).mockResolvedValue(mockDriver);
      (db.courseDrive.findMany as jest.Mock).mockResolvedValue(mockCourses);
      (db.noteCourseDrive.aggregate as jest.Mock).mockResolvedValue({
        _avg: { note: 4.8 },
        _count: 15,
      });
      (db.driverPayoutDrive.aggregate as jest.Mock).mockResolvedValue({
        _sum: { amountCentimes: 100000 },
        _count: 20,
      });

      const stats = await ZupDriveAdminDashboardService.getDriverStats("driver-1");

      expect(stats.id).toBe("driver-1");
      expect(stats.name).toBe("Jean Dupont");
      expect(stats.rating).toBe(4.8);
      expect(stats.courses.total).toBe(3);
      expect(stats.courses.acceptanceRate).toBeCloseTo(66.67, 1);
    });
  });

  describe("getAlerts", () => {
    it("should return platform alerts", async () => {
      (db.chauffeurDrive.count as jest.Mock).mockResolvedValue(0); // No inactive drivers
      (db.driverPayoutBatchDrive.count as jest.Mock).mockResolvedValueOnce(0); // No pending batches
      (db.driverPayoutDrive.count as jest.Mock).mockResolvedValue(0); // No failed payouts

      const alerts = await ZupDriveAdminDashboardService.getAlerts();

      expect(alerts).toHaveLength(0);
    });

    it("should report inactive drivers", async () => {
      (db.chauffeurDrive.count as jest.Mock).mockResolvedValueOnce(5); // 5 inactive drivers
      (db.driverPayoutBatchDrive.count as jest.Mock).mockResolvedValueOnce(0);
      (db.driverPayoutDrive.count as jest.Mock).mockResolvedValue(0);

      const alerts = await ZupDriveAdminDashboardService.getAlerts();

      expect(alerts).toContainEqual(
        expect.objectContaining({
          type: "DRIVER_INACTIVE",
          severity: "LOW",
        })
      );
    });

    it("should report pending payouts", async () => {
      (db.chauffeurDrive.count as jest.Mock).mockResolvedValueOnce(0);
      (db.driverPayoutBatchDrive.count as jest.Mock).mockResolvedValueOnce(3); // 3 pending batches
      (db.driverPayoutDrive.count as jest.Mock).mockResolvedValue(0);

      const alerts = await ZupDriveAdminDashboardService.getAlerts();

      expect(alerts).toContainEqual(
        expect.objectContaining({
          type: "PENDING_PAYOUTS",
          severity: "MEDIUM",
        })
      );
    });
  });
});
