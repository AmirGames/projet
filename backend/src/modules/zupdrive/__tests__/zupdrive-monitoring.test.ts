/**
 * Tests: Real-time Monitoring & Alerts
 */

import { ZupDriveMonitoringService } from "../zupdrive-monitoring.service";
import { db } from "../../../services/db";
import { logger } from "../../../config/logger";
import { Notifier } from "../../notifications/notifier.service";
import { EmailService } from "../../notifications/email.service";
import { Outbox } from "../../jobs/outbox.service";
import { emitNotification } from "../../realtime/socket";

jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../notifications/notifier.service", () => ({ Notifier: { expoPush: jest.fn() } }));
jest.mock("../../notifications/email.service", () => ({ EmailService: { sendEmail: jest.fn() } }));
jest.mock("../../jobs/outbox.service", () => ({ Outbox: { enregistrer: jest.fn(), declarer: jest.fn() } }));
jest.mock("../../realtime/socket", () => ({ emitNotification: jest.fn() }));

jest.mock("../../../services/db", () => ({
  db: {
    notificationDrive: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      groupBy: jest.fn(),
    },
    pushDevice: { findMany: jest.fn() },
    user: { findUnique: jest.fn() },
    noteCourseDrive: {
      aggregate: jest.fn(),
    },
    platformSettingsDrive: {
      findUnique: jest.fn(),
    },
    chauffeurDrive: {
      findUnique: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    courseDrive: {
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    driverPayoutDrive: {
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    documentChauffeurDrive: {
      findMany: jest.fn(),
    },
    complianceReportDrive: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

describe("ZupDriveMonitoringService", () => {
  const mockUserId = "user-123";
  const mockChauffeurId = "chauffeur-123";

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe("createNotification", () => {
    it("devrait créer une notification", async () => {
      jest.mocked(db.notificationDrive.create).mockResolvedValueOnce({
        id: "notif-1",
        userId: mockUserId,
        type: "COURSE_COMPLETED",
        title: "Course completed",
        message: "You earned €8.25",
        read: false,
      } as never);

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
      jest.mocked(db.notificationDrive.create).mockResolvedValueOnce({
        id: "notif-2",
        userId: mockUserId,
        type: "EARNINGS_UPDATED",
        data: { amount: 825 },
        read: false,
      } as never);

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
            data: { amount: 825 },
          }),
        })
      );
    });
  });

  describe("getUnreadNotifications", () => {
    it("devrait retourner les notifications non lues", async () => {
      const notifications = [
        { id: "notif-1", title: "Course completed", read: false },
        { id: "notif-2", title: "Payout processing", read: false },
      ];

      jest.mocked(db.notificationDrive.findMany).mockResolvedValueOnce(notifications as never);

      const result = await ZupDriveMonitoringService.getUnreadNotifications(mockUserId, 20);

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe("Course completed");
      expect(db.notificationDrive.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: mockUserId, read: false } })
      );
    });

    it("devrait respecter la limite", async () => {
      jest.mocked(db.notificationDrive.findMany).mockResolvedValueOnce([]);

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
      jest.mocked(db.notificationDrive.findUnique).mockResolvedValueOnce({
        id: "notif-1",
        userId: mockUserId,
        read: false,
      } as never);

      jest.mocked(db.notificationDrive.update).mockResolvedValueOnce({
        id: "notif-1",
        read: true,
      } as never);

      await ZupDriveMonitoringService.markAsRead("notif-1", mockUserId);

      expect(db.notificationDrive.update).toHaveBeenCalledWith({
        where: { id: "notif-1" },
        data: { read: true, readAt: expect.any(Date) },
      });
    });

    it("devrait rejeter si notification introuvable", async () => {
      jest.mocked(db.notificationDrive.findUnique).mockResolvedValueOnce(null);

      await expect(
        ZupDriveMonitoringService.markAsRead("invalid", mockUserId)
      ).rejects.toThrow("not found");
    });
  });

  /** Prépare les mocks Prisma lus par getDriverMetrics. */
  function preparerMetriques(opts: {
    statut: string;
    courses: { statut: string }[];
    moyenne: number | null;
    nombreNotes: number;
    prixAujourdhui?: number[];
    prixSemaine?: number[];
    payoutCentimes?: number;
    score?: number;
    documents?: { statut: string }[];
  }) {
    jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValue({
      id: mockChauffeurId,
      userId: mockUserId,
      statut: opts.statut,
      courses: opts.courses,
    } as never);
    jest.mocked(db.platformSettingsDrive.findUnique).mockResolvedValue({
      commissionPercentage: 20,
    } as never);
    jest
      .mocked(db.courseDrive.findMany)
      .mockResolvedValueOnce((opts.prixAujourdhui ?? []).map((p) => ({ prixCentimes: p })) as never)
      .mockResolvedValueOnce((opts.prixSemaine ?? []).map((p) => ({ prixCentimes: p })) as never);
    jest.mocked(db.noteCourseDrive.aggregate).mockResolvedValue({
      _avg: { note: opts.moyenne },
      _count: { _all: opts.nombreNotes },
    } as never);
    jest
      .mocked(db.driverPayoutDrive.findFirst)
      .mockResolvedValue(
        opts.payoutCentimes ? ({ amountCentimes: opts.payoutCentimes } as never) : null
      );
    jest.mocked(db.documentChauffeurDrive.findMany).mockResolvedValue((opts.documents ?? []) as never);
    jest
      .mocked(db.complianceReportDrive.findFirst)
      .mockResolvedValue(opts.score ? ({ complianceScore: opts.score } as never) : null);
  }

  describe("getDriverMetrics", () => {
    it("devrait retourner les métriques du chauffeur", async () => {
      preparerMetriques({
        statut: "VALIDE",
        courses: [{ statut: "TERMINEE" }, { statut: "TERMINEE" }, { statut: "ANNULEE" }],
        moyenne: 4.5,
        nombreNotes: 1,
        prixAujourdhui: [1000, 1000],
        prixSemaine: [4000, 4000],
        payoutCentimes: 1500,
        score: 92,
        documents: [{ statut: "APPROVED" }, { statut: "APPROVED" }],
      });

      const metrics = await ZupDriveMonitoringService.getDriverMetrics(mockChauffeurId);

      expect(metrics.chauffeurId).toBe(mockChauffeurId);
      expect(metrics.averageRating).toBe(4.5);
      expect(metrics.completionRate).toBe(67); // 2 terminées sur 3
      expect(metrics.cancellationRate).toBe(33);
      expect(metrics.pendingPayout).toBe(1500);
      expect(metrics.complianceScore).toBe(92);
      expect(metrics.documentStatus).toBe("COMPLETE");
      expect(metrics.status).toBe("WARNING"); // taux de complétion 67 % < 80 %
    });

    it("devrait calculer les gains en centimes nets de la commission (20 %)", async () => {
      preparerMetriques({
        statut: "VALIDE",
        courses: [{ statut: "TERMINEE" }],
        moyenne: 4.5,
        nombreNotes: 1,
        prixAujourdhui: [1099, 1000],
        prixSemaine: [5000],
      });

      const metrics = await ZupDriveMonitoringService.getDriverMetrics(mockChauffeurId);

      // 1099 - round(219.8) = 879 ; 1000 - 200 = 800
      expect(metrics.earningsToday).toBe(1679);
      expect(metrics.earningsWeek).toBe(4000);
    });

    it("devrait lire la note moyenne depuis NoteCourseDrive", async () => {
      preparerMetriques({
        statut: "VALIDE",
        courses: [{ statut: "TERMINEE" }],
        moyenne: 4.5,
        nombreNotes: 3,
      });

      await ZupDriveMonitoringService.getDriverMetrics(mockChauffeurId);

      expect(db.noteCourseDrive.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { chauffeurId: mockChauffeurId, auteur: "PASSAGER" },
        })
      );
    });

    it("devrait marquer comme WARNING si rating faible", async () => {
      preparerMetriques({
        statut: "VALIDE",
        courses: [{ statut: "TERMINEE" }],
        moyenne: 2.5,
        nombreNotes: 4,
      });

      const metrics = await ZupDriveMonitoringService.getDriverMetrics(mockChauffeurId);

      expect(metrics.status).toBe("WARNING");
    });

    it("ne devrait pas pénaliser un chauffeur sans aucune note", async () => {
      preparerMetriques({
        statut: "VALIDE",
        courses: [{ statut: "TERMINEE" }],
        moyenne: null,
        nombreNotes: 0,
      });

      const metrics = await ZupDriveMonitoringService.getDriverMetrics(mockChauffeurId);

      expect(metrics.averageRating).toBe(0);
      expect(metrics.status).toBe("ACTIVE");
    });

    it("devrait marquer comme SUSPENDED si statut suspendu", async () => {
      preparerMetriques({
        statut: "SUSPENDU",
        courses: [],
        moyenne: 4.0,
        nombreNotes: 2,
      });

      const metrics = await ZupDriveMonitoringService.getDriverMetrics(mockChauffeurId);

      expect(metrics.status).toBe("SUSPENDED");
    });

    it("devrait rejeter si le chauffeur est introuvable", async () => {
      preparerMetriques({ statut: "VALIDE", courses: [], moyenne: null, nombreNotes: 0 });
      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValue(null);

      await expect(
        ZupDriveMonitoringService.getDriverMetrics(mockChauffeurId)
      ).rejects.toThrow("not found");
    });
  });

  describe("getAdminDashboard", () => {
    it("devrait retourner le dashboard admin", async () => {
      jest.mocked(db.chauffeurDrive.count).mockResolvedValueOnce(150).mockResolvedValueOnce(3);
      jest.mocked(db.courseDrive.count).mockResolvedValueOnce(5000);
      jest.mocked(db.courseDrive.aggregate).mockResolvedValueOnce({
        _sum: { prixCentimes: 500000 },
      } as never);
      jest.mocked(db.driverPayoutDrive.count).mockResolvedValueOnce(45);
      jest.mocked(db.complianceReportDrive.findMany).mockResolvedValueOnce([]);

      const dashboard = await ZupDriveMonitoringService.getAdminDashboard();

      expect(dashboard.realtime.activeDrivers).toBe(150);
      expect(dashboard.realtime.totalCourses).toBe(5000);
      expect(dashboard.realtime.totalEarnings).toBe(500000);
      expect(dashboard.financials.pendingPayouts).toBe(45);
      expect(dashboard.suspensions.count).toBe(3);
    });
  });

  describe("checkAndAlertIssues", () => {
    it("devrait créer une alerte si rating faible", async () => {
      preparerMetriques({
        statut: "VALIDE",
        courses: [{ statut: "TERMINEE" }],
        moyenne: 2.5,
        nombreNotes: 4,
        documents: [{ statut: "APPROVED" }],
      });
      jest.mocked(db.notificationDrive.create).mockResolvedValueOnce({
        id: "alert-1",
      } as never);

      await ZupDriveMonitoringService.checkAndAlertIssues(mockChauffeurId);

      expect(db.notificationDrive.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: mockUserId,
            chauffeurId: mockChauffeurId,
            type: "COMPLIANCE_WARNING",
          }),
        })
      );
    });
  });

  describe("getNotificationStats", () => {
    it("devrait retourner les stats de notifications", async () => {
      jest.mocked(db.notificationDrive.count)
        .mockResolvedValueOnce(50) // total
        .mockResolvedValueOnce(12); // unread

      jest.mocked(db.notificationDrive.groupBy).mockResolvedValueOnce([
        { type: "COURSE_COMPLETED", _count: 5 },
        { type: "PAYOUT_COMPLETED", _count: 7 },
      ] as never);

      const stats = await ZupDriveMonitoringService.getNotificationStats(mockUserId);

      expect(stats.total).toBe(50);
      expect(stats.unread).toBe(12);
      expect(stats.byType).toHaveLength(2);
    });
  });

  describe("canaux réels selon la priorité", () => {
    const charge = (priority: "low" | "medium" | "high" | "critical") => ({
      type: "PAYOUT_FAILED" as const,
      userId: mockUserId,
      title: "Virement échoué",
      message: "Mettez à jour votre IBAN.\nMerci",
      priority,
      actionUrl: "/chauffeur/versements",
    });

    beforeEach(() => {
      jest.mocked(db.notificationDrive.create).mockResolvedValue({ id: "notif-1" } as never);
      jest.mocked(db.pushDevice.findMany).mockResolvedValue([{ token: "ExponentPushToken[a]" }, { token: "ExponentPushToken[b]" }] as never);
      jest.mocked(db.user.findUnique).mockResolvedValue({ email: "sam@example.com" } as never);
    });

    it("low : temps réel seulement (ni push, ni e-mail)", async () => {
      await ZupDriveMonitoringService.createNotification(charge("low"));

      expect(Notifier.expoPush).not.toHaveBeenCalled();
      expect(Outbox.enregistrer).not.toHaveBeenCalled();
      expect(emitNotification).toHaveBeenCalledWith("sam@example.com", expect.objectContaining({ id: "notif-1", type: "PAYOUT_FAILED", priority: "low" }));
    });

    it("medium : push vers les téléphones du compte, pas d'e-mail", async () => {
      await ZupDriveMonitoringService.createNotification(charge("medium"));

      expect(db.pushDevice.findMany).toHaveBeenCalledWith({ where: { userId: mockUserId }, select: { token: true } });
      expect(Notifier.expoPush).toHaveBeenCalledWith(
        ["ExponentPushToken[a]", "ExponentPushToken[b]"],
        expect.objectContaining({ title: "Virement échoué", body: expect.stringContaining("IBAN"), data: expect.objectContaining({ notificationId: "notif-1", url: "/chauffeur/versements" }) })
      );
      expect(Outbox.enregistrer).not.toHaveBeenCalled();
    });

    it("high : l'e-mail passe par l'outbox, avec une clé qui empêche le doublon", async () => {
      await ZupDriveMonitoringService.createNotification(charge("high"));

      expect(Notifier.expoPush).toHaveBeenCalledTimes(1);
      expect(Outbox.enregistrer).toHaveBeenCalledWith(
        "zupdrive.alerte_email",
        { notificationId: "notif-1" },
        { dedupeKey: "zupdrive.alerte_email:notif-1" }
      );
      expect(EmailService.sendEmail).not.toHaveBeenCalled();
    });

    it("sans téléphone enregistré : pas d'appel push ; sans connexion temps réel ni adresse : rien ne casse", async () => {
      jest.mocked(db.pushDevice.findMany).mockResolvedValue([] as never);
      jest.mocked(db.user.findUnique).mockResolvedValue({ email: null } as never);

      await expect(ZupDriveMonitoringService.createNotification(charge("critical"))).resolves.toBe("notif-1");

      expect(Notifier.expoPush).not.toHaveBeenCalled();
      expect(emitNotification).not.toHaveBeenCalled();
    });

    it("un canal en échec n'annule ni la notification ni les autres canaux, et l'échec est journalisé", async () => {
      jest.mocked(Notifier.expoPush).mockRejectedValue(new Error("Expo indisponible"));
      jest.mocked(Outbox.enregistrer).mockRejectedValue(new Error("base lente"));

      await expect(ZupDriveMonitoringService.createNotification(charge("high"))).resolves.toBe("notif-1");

      expect(emitNotification).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith("ZupDrive notification channel failed", expect.objectContaining({ channel: "push", error: "Expo indisponible" }));
      expect(logger.warn).toHaveBeenCalledWith("ZupDrive notification channel failed", expect.objectContaining({ channel: "email", error: "base lente" }));
    });

    it("jamais de console.log : plus rien n'est simulé", async () => {
      const espion = jest.spyOn(console, "log").mockImplementation(() => undefined);
      await ZupDriveMonitoringService.createNotification(charge("critical"));
      expect(espion).not.toHaveBeenCalled();
      espion.mockRestore();
    });
  });

  describe("envoyerEmailAlerte (exécuté par l'outbox)", () => {
    it("envoie le titre et le message à l'adresse du compte, HTML échappé", async () => {
      jest.mocked(db.notificationDrive.findUnique).mockResolvedValue({ title: "Alerte", message: "a<b>\nc", user: { email: "sam@example.com" } } as never);

      await ZupDriveMonitoringService.envoyerEmailAlerte("notif-1");

      expect(EmailService.sendEmail).toHaveBeenCalledWith({
        to: "sam@example.com",
        subject: "Alerte",
        text: "a<b>\nc",
        html: "<p>a&lt;b&gt;<br>c</p>",
      });
    });

    it("échec d'envoi : l'erreur remonte pour que l'outbox rejoue", async () => {
      jest.mocked(db.notificationDrive.findUnique).mockResolvedValue({ title: "T", message: "M", user: { email: "sam@example.com" } } as never);
      jest.mocked(EmailService.sendEmail).mockRejectedValue(new Error("SMTP"));
      await expect(ZupDriveMonitoringService.envoyerEmailAlerte("notif-1")).rejects.toThrow("SMTP");
    });

    it("notification disparue ou compte sans adresse : rien à envoyer, pas d'erreur (un rejeu n'y changerait rien)", async () => {
      jest.mocked(db.notificationDrive.findUnique).mockResolvedValueOnce(null as never);
      await expect(ZupDriveMonitoringService.envoyerEmailAlerte("notif-x")).resolves.toBeUndefined();
      jest.mocked(db.notificationDrive.findUnique).mockResolvedValueOnce({ title: "T", message: "M", user: { email: null } } as never);
      await expect(ZupDriveMonitoringService.envoyerEmailAlerte("notif-1")).resolves.toBeUndefined();
      expect(EmailService.sendEmail).not.toHaveBeenCalled();
    });
  });
});
