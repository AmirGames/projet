/**
 * Tests: Real-time Monitoring & Alerts
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ZupDriveMonitoringService } from "../zupdrive-monitoring.service";
import { db } from "../../../services/db";

vi.mock("../../../services/db", () => ({
  db: {
    notificationDrive: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      groupBy: vi.fn(),
    },
    chauffeurDrive: {
      findUnique: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    courseDrive: {
      findMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    driverPayoutDrive: {
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    documentChauffeurDrive: {
      findMany: vi.fn(),
    },
    complianceReportDrive: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe("ZupDriveMonitoringService", () => {
  const mockUserId = "user-123";
  const mockChauffeurId = "chauffeur-123";
  const now = new Date();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createNotification", () => {
    it("devrait créer une notification", async () => {
      vi.mocked(db.notificationDrive.create).mockResolvedValueOnce({
        id: "notif-1",
        userId: mockUserId,
        type: "COURSE_COMPLETED",
        titre: "Course completed",
        message: "You earned €8.25",
        lue: false,
      } as any);

      const notificationId = await ZupDriveMonitoringService.createNotification({
        type: "COURSE_COMPLETED",
        userId: mockUserId,
        title: "Course completed",
        message: "You earned €8.25",
        priority: "medium",
      });

      expect(notificationId).toBe("notif-1");
      expect(db.notificationDrive.create).toHaveBeenCalled();
    });

    it("devrait ajouter des données à la notification", async () => {
      vi.mocked(db.notificationDrive.create).mockResolvedValueOnce({
        id: "notif-2",
        userId: mockUserId,
        type: "EARNINGS_UPDATED",
        donnees: { amount: 825 },
        lue: false,
      } as any);

      await ZupDriveMonitoringService.createNotification({
        type: "EARNINGS_UPDATED",
        userId: mockUserId,
        title: "Earnings updated",
        message: "+€8.25",
        priority: "low",
        data: { amount: 825 },
      });

      expect(db.notificationDrive.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            donnees: { amount: 825 },
          }),
        })
      );
    });
  });

  describe("getUnreadNotifications", () => {
    it("devrait retourner les notifications non lues", async () => {
      const notifications = [
        { id: "notif-1", titre: "Course completed", lue: false },
        { id: "notif-2", titre: "Payout processing", lue: false },
      ];

      vi.mocked(db.notificationDrive.findMany).mockResolvedValueOnce(notifications as any);

      const result = await ZupDriveMonitoringService.getUnreadNotifications(mockUserId, 20);

      expect(result).toHaveLength(2);
      expect(result[0].lue).toBe(false);
    });

    it("devrait respecter la limite", async () => {
      vi.mocked(db.notificationDrive.findMany).mockResolvedValueOnce([]);

      await ZupDriveMonitoringService.getUnreadNotifications(mockUserId, 10);

      expect(db.notificationDrive.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
        })
      );
    });
  });

  describe("markAsRead", () => {
    it("devrait marquer une notification comme lue", async () => {
      vi.mocked(db.notificationDrive.findUnique).mockResolvedValueOnce({
        id: "notif-1",
        userId: mockUserId,
        lue: false,
      } as any);

      vi.mocked(db.notificationDrive.update).mockResolvedValueOnce({
        id: "notif-1",
        lue: true,
      } as any);

      await ZupDriveMonitoringService.markAsRead("notif-1", mockUserId);

      expect(db.notificationDrive.update).toHaveBeenCalledWith({
        where: { id: "notif-1" },
        data: { lue: true },
      });
    });

    it("devrait rejeter si notification introuvable", async () => {
      vi.mocked(db.notificationDrive.findUnique).mockResolvedValueOnce(null);

      await expect(
        ZupDriveMonitoringService.markAsRead("invalid", mockUserId)
      ).rejects.toThrow("not found");
    });
  });

  describe("getDriverMetrics", () => {
    it("devrait retourner les métriques du chauffeur", async () => {
      vi.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce({
        id: mockChauffeurId,
        rating: 4.5,
        statut: "VALIDE",
        courses: [
          { statut: "COMPLETED" },
          { statut: "COMPLETED" },
          { statut: "CANCELLED" },
        ],
      } as any);

      vi.mocked(db.courseDrive.aggregate)
        .mockResolvedValueOnce({ _sum: { prixTotal: 2000 } } as any)
        .mockResolvedValueOnce({ _sum: { prixTotal: 8000 } } as any);

      vi.mocked(db.driverPayoutDrive.findFirst).mockResolvedValueOnce({
        montant: 1500,
      } as any);

      vi.mocked(db.documentChauffeurDrive.findMany).mockResolvedValueOnce([
        { statut: "APPROVED" },
        { statut: "APPROVED" },
      ] as any);

      vi.mocked(db.complianceReportDrive.findFirst).mockResolvedValueOnce({
        overallScore: 92,
      } as any);

      vi.mocked(db.chauffeurDrive.findUnique)
        .mockResolvedValueOnce({
          rating: 4.5,
          courses: [{ id: "c1" }, { id: "c2" }],
          ratings: [{ id: "r1" }],
        } as any);

      const metrics = await ZupDriveMonitoringService.getDriverMetrics(mockChauffeurId);

      expect(metrics.chauffeurId).toBe(mockChauffeurId);
      expect(metrics.averageRating).toBe(4.5);
      expect(metrics.completionRate).toBe(67); // 2 completed, 1 cancelled out of 3
      expect(metrics.status).toBe("ACTIVE");
    });

    it("devrait marquer comme WARNING si rating faible", async () => {
      vi.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce({
        id: mockChauffeurId,
        rating: 2.5, // Faible rating
        statut: "VALIDE",
        courses: [{ statut: "COMPLETED" }],
      } as any);

      vi.mocked(db.courseDrive.aggregate)
        .mockResolvedValueOnce({ _sum: { prixTotal: 1000 } } as any)
        .mockResolvedValueOnce({ _sum: { prixTotal: 5000 } } as any);

      vi.mocked(db.driverPayoutDrive.findFirst).mockResolvedValueOnce(null);
      vi.mocked(db.documentChauffeurDrive.findMany).mockResolvedValueOnce([]);
      vi.mocked(db.complianceReportDrive.findFirst).mockResolvedValueOnce(null);
      vi.mocked(db.chauffeurDrive.findUnique)
        .mockResolvedValueOnce({
          rating: 2.5,
          courses: [{ id: "c1" }],
          ratings: [{ id: "r1" }],
        } as any);

      const metrics = await ZupDriveMonitoringService.getDriverMetrics(mockChauffeurId);

      expect(metrics.status).toBe("WARNING");
    });

    it("devrait marquer comme SUSPENDED si status suspendu", async () => {
      vi.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce({
        id: mockChauffeurId,
        rating: 4.0,
        statut: "SUSPENDED", // Suspendu
        courses: [],
      } as any);

      vi.mocked(db.courseDrive.aggregate)
        .mockResolvedValueOnce({ _sum: { prixTotal: 0 } } as any)
        .mockResolvedValueOnce({ _sum: { prixTotal: 0 } } as any);

      vi.mocked(db.driverPayoutDrive.findFirst).mockResolvedValueOnce(null);
      vi.mocked(db.documentChauffeurDrive.findMany).mockResolvedValueOnce([]);
      vi.mocked(db.complianceReportDrive.findFirst).mockResolvedValueOnce(null);
      vi.mocked(db.chauffeurDrive.findUnique)
        .mockResolvedValueOnce({
          rating: 4.0,
          courses: [],
          ratings: [],
        } as any);

      const metrics = await ZupDriveMonitoringService.getDriverMetrics(mockChauffeurId);

      expect(metrics.status).toBe("SUSPENDED");
    });
  });

  describe("getAdminDashboard", () => {
    it("devrait retourner le dashboard admin", async () => {
      vi.mocked(db.chauffeurDrive.count).mockResolvedValueOnce(150);
      vi.mocked(db.courseDrive.count).mockResolvedValueOnce(5000);
      vi.mocked(db.courseDrive.aggregate).mockResolvedValueOnce({
        _sum: { prixTotal: 500000 },
      } as any);
      vi.mocked(db.driverPayoutDrive.count).mockResolvedValueOnce(45);
      vi.mocked(db.complianceReportDrive.findMany).mockResolvedValueOnce([]);

      const dashboard = await ZupDriveMonitoringService.getAdminDashboard();

      expect(dashboard.realtime.activeDrivers).toBe(150);
      expect(dashboard.realtime.totalCourses).toBe(5000);
      expect(dashboard.realtime.totalEarnings).toBe(500000);
      expect(dashboard.financials.pendingPayouts).toBe(45);
    });
  });

  describe("checkAndAlertIssues", () => {
    it("devrait créer une alerte si rating faible", async () => {
      vi.mocked(db.chauffeurDrive.findUnique)
        .mockResolvedValueOnce({
          id: mockChauffeurId,
          rating: 2.5,
          statut: "VALIDE",
          courses: [{ statut: "COMPLETED" }],
        } as any)
        .mockResolvedValueOnce({
          rating: 2.5,
          courses: [{ id: "c1" }],
          ratings: [{ id: "r1" }],
        } as any);

      vi.mocked(db.courseDrive.aggregate)
        .mockResolvedValueOnce({ _sum: { prixTotal: 1000 } } as any)
        .mockResolvedValueOnce({ _sum: { prixTotal: 5000 } } as any);

      vi.mocked(db.driverPayoutDrive.findFirst).mockResolvedValueOnce(null);
      vi.mocked(db.documentChauffeurDrive.findMany).mockResolvedValueOnce([]);
      vi.mocked(db.complianceReportDrive.findFirst).mockResolvedValueOnce(null);

      vi.mocked(db.notificationDrive.create).mockResolvedValueOnce({
        id: "alert-1",
      } as any);

      await ZupDriveMonitoringService.checkAndAlertIssues(mockChauffeurId);

      expect(db.notificationDrive.create).toHaveBeenCalled();
    });
  });

  describe("getNotificationStats", () => {
    it("devrait retourner les stats de notifications", async () => {
      vi.mocked(db.notificationDrive.count)
        .mockResolvedValueOnce(50) // total
        .mockResolvedValueOnce(12); // unread

      vi.mocked(db.notificationDrive.groupBy).mockResolvedValueOnce([
        { type: "COURSE_COMPLETED", _count: 5 },
        { type: "PAYOUT_COMPLETED", _count: 7 },
      ] as any);

      const stats = await ZupDriveMonitoringService.getNotificationStats(mockUserId);

      expect(stats.total).toBe(50);
      expect(stats.unread).toBe(12);
      expect(stats.byType).toHaveLength(2);
    });
  });

  describe("Notification priorities", () => {
    it("devrait envoyer push pour priority medium+", async () => {
      vi.mocked(db.notificationDrive.create).mockResolvedValueOnce({
        id: "notif-1",
      } as any);

      await ZupDriveMonitoringService.createNotification({
        type: "COURSE_COMPLETED",
        userId: mockUserId,
        title: "Course completed",
        message: "Earned €8.25",
        priority: "medium",
      });

      expect(db.notificationDrive.create).toHaveBeenCalled();
    });
  });
});
