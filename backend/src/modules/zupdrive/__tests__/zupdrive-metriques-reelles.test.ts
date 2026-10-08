import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const db: any = {
  chauffeurDrive: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
  courseDrive: { findMany: jest.fn(), count: jest.fn() },
  noteCourseDrive: { groupBy: jest.fn() },
  paymentIntentDrive: { findMany: jest.fn(), aggregate: jest.fn() },
  driverPayoutDrive: { aggregate: jest.fn(), groupBy: jest.fn() },
  supportTicket: { findMany: jest.fn() },
  supportMessage: { groupBy: jest.fn() },
};
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import {
  ZupDriveAnalyticsService,
  compterParMotif,
  croissancePourcent,
  delaiMoyenMinutes,
  moyenneOuNull,
} from "../zupdrive-analytics.service";
import { ZupDriveReportingService } from "../zupdrive-reporting.service";
import { ZupDriveSupportService } from "../zupdrive-support.service";
import { ZupDriveComplianceChecksService } from "../zupdrive-compliance-checks.service";

const T0 = new Date("2026-03-01T10:00:00Z");
const apres = (minutes: number, depuis = T0) => new Date(depuis.getTime() + minutes * 60_000);
const periode = [new Date("2026-03-01T00:00:00Z"), new Date("2026-03-31T00:00:00Z")] as const;

beforeEach(() => {
  jest.resetAllMocks();
});

describe("helpers de calcul : jamais de valeur factice", () => {
  it("moyenneOuNull : null sans valeur (pas de division par zéro), sinon la moyenne", () => {
    expect(moyenneOuNull([])).toBeNull();
    expect(moyenneOuNull([1, 2, 6])).toBe(3);
  });

  it("delaiMoyenMinutes ignore les paires incomplètes ou négatives", () => {
    expect(delaiMoyenMinutes([])).toBeNull();
    expect(delaiMoyenMinutes([{ debut: T0, fin: null }, { debut: null, fin: T0 }, { debut: apres(5), fin: T0 }])).toBeNull();
    expect(
      delaiMoyenMinutes([
        { debut: T0, fin: apres(2) },
        { debut: T0, fin: apres(6) },
        { debut: T0, fin: null },
      ])
    ).toBe(4);
  });

  it("croissancePourcent : null si la période de référence est vide", () => {
    expect(croissancePourcent(0, 10)).toBeNull();
    expect(croissancePourcent(0, 0)).toBeNull();
    expect(croissancePourcent(10, 15)).toBe(50);
    expect(croissancePourcent(10, 5)).toBe(-50);
  });

  it("compterParMotif regroupe par code et ignore les paiements sans échec", () => {
    expect(compterParMotif([])).toEqual({});
    expect(
      compterParMotif([
        { failureReason: "card_declined" },
        { failureReason: "card_declined" },
        { failureReason: "expired_card" },
        { failureReason: null },
      ])
    ).toEqual({ card_declined: 2, expired_card: 1 });
  });
});

describe("analytics : performance des chauffeurs", () => {
  it("avgResponseTime = acceptation − création, moyenne sur les courses acceptées", async () => {
    db.chauffeurDrive.findMany.mockResolvedValue([
      {
        id: "c1",
        nomComplet: "Avec courses",
        courses: [
          { id: "a", statut: "TERMINEE", prixCentimes: 1000, createdAt: T0, accepteeLe: apres(2), paymentIntent: null },
          { id: "b", statut: "TERMINEE", prixCentimes: 1000, createdAt: T0, accepteeLe: apres(4), paymentIntent: null },
          { id: "c", statut: "ANNULEE", prixCentimes: 1000, createdAt: T0, accepteeLe: null, paymentIntent: null },
        ],
      },
      { id: "c2", nomComplet: "Sans course", courses: [] },
    ]);
    db.noteCourseDrive.groupBy.mockResolvedValue([]);

    const [avec, sans] = await ZupDriveAnalyticsService.getDriverPerformance(...periode);

    expect(avec.avgResponseTime).toBe(3);
    expect(avec.completionRate).toBeCloseTo(66.67, 1);
    expect(sans.avgResponseTime).toBeNull();
    expect(sans.completionRate).toBe(0);
    expect(sans.avgEarnings).toBe(0);
  });
});

describe("analytics : régions", () => {
  it("calcule attente (arrivée − acceptation) et majoration moyenne depuis les courses", async () => {
    db.courseDrive.findMany.mockImplementation(async ({ where }: any) =>
      where.region === "BRUXELLES"
        ? [
            { id: "a", prixCentimes: 1500, surgeFactor: 1.5, accepteeLe: T0, arriveeLe: apres(6) },
            { id: "b", prixCentimes: 1000, surgeFactor: 1, accepteeLe: T0, arriveeLe: apres(10) },
            { id: "c", prixCentimes: 1000, surgeFactor: null, accepteeLe: T0, arriveeLe: null },
          ]
        : []
    );
    db.chauffeurDrive.count.mockResolvedValue(4);
    db.courseDrive.count.mockResolvedValue(0);

    const regions = await ZupDriveAnalyticsService.getRegionalAnalytics(...periode);
    const bruxelles = regions.find((r) => r.region === "BRUXELLES")!;
    const wallonie = regions.find((r) => r.region === "WALLONIE")!;

    expect(bruxelles.avgWaitTime).toBe(8);
    expect(bruxelles.avgSurgeMultiplier).toBe(1.25);
    expect(bruxelles.totalRevenue).toBe(3500);
    // Région sans course : rien n'est inventé.
    expect(wallonie.avgWaitTime).toBeNull();
    expect(wallonie.avgSurgeMultiplier).toBeNull();
    expect(wallonie.totalCourses).toBe(0);
  });

  it("des courses anciennes sans majoration enregistrée donnent null, pas 1", async () => {
    db.courseDrive.findMany.mockResolvedValue([{ id: "a", prixCentimes: 900, surgeFactor: null, accepteeLe: null, arriveeLe: null }]);
    db.chauffeurDrive.count.mockResolvedValue(0);
    db.courseDrive.count.mockResolvedValue(0);
    const [r] = await ZupDriveAnalyticsService.getRegionalAnalytics(...periode);
    expect(r.avgSurgeMultiplier).toBeNull();
    expect(r.avgWaitTime).toBeNull();
  });
});

describe("analytics : paiements", () => {
  it("failureReasons vient des échecs enregistrés ; vide sans paiement", async () => {
    db.paymentIntentDrive.findMany.mockResolvedValue([
      { id: "1", amountCentimes: 1000, status: "SUCCEEDED", failureReason: null },
      { id: "2", amountCentimes: 2000, status: "REQUIRES_PAYMENT_METHOD", failureReason: "card_declined" },
      { id: "3", amountCentimes: 3000, status: "REQUIRES_PAYMENT_METHOD", failureReason: "card_declined" },
    ]);
    const r = await ZupDriveAnalyticsService.getPaymentAnalytics(...periode);
    expect(r.failureReasons).toEqual({ card_declined: 2 });
    expect(r.successRate).toBeCloseTo(33.33, 1);

    db.paymentIntentDrive.findMany.mockResolvedValue([]);
    const vide = await ZupDriveAnalyticsService.getPaymentAnalytics(...periode);
    expect(vide.failureReasons).toEqual({});
    expect(vide.successRate).toBe(0);
    expect(vide.avgAmount).toBe(0);
  });
});

describe("support : délais de réponse", () => {
  const ticket = (id: string, createdAt: Date, extra: object = {}) => ({ id, createdAt, status: "OUVERT", resolvedAt: null, ...extra });

  it("firstResponseTime = premier message agent − ouverture, tickets sans réponse ignorés", async () => {
    const t1 = ticket("t1", T0);
    const t2 = ticket("t2", T0);
    const t3 = ticket("t3", T0); // jamais répondu
    db.supportTicket.findMany.mockResolvedValue([t1, t2, t3]);
    db.supportMessage.groupBy.mockResolvedValue([
      { ticketId: "t1", _min: { createdAt: apres(60) } },
      { ticketId: "t2", _min: { createdAt: apres(180) } },
    ]);

    const m = await ZupDriveSupportService.getSupportMetrics();

    expect(m.avgFirstResponseTime).toBe(2);
    // Seuls les messages d'agent comptent : un message du demandeur n'est jamais une réponse.
    expect(db.supportMessage.groupBy.mock.calls[0][0].where.authorType).toEqual({ in: ["AGENT", "ADMIN"] });
  });

  it("sans ticket ou sans réponse : null, sans erreur", async () => {
    db.supportTicket.findMany.mockResolvedValue([]);
    const vide = await ZupDriveSupportService.getSupportMetrics();
    expect(vide).toMatchObject({ totalTickets: 0, avgFirstResponseTime: null, avgResolutionTime: null, resolutionRate: 0 });
    expect(db.supportMessage.groupBy).not.toHaveBeenCalled();

    db.supportTicket.findMany.mockResolvedValue([ticket("t1", T0)]);
    db.supportMessage.groupBy.mockResolvedValue([]);
    expect((await ZupDriveSupportService.getSupportMetrics()).avgFirstResponseTime).toBeNull();
  });

  it("avgResolutionTime reste calculé sur les tickets résolus", async () => {
    db.supportTicket.findMany.mockResolvedValue([ticket("t1", T0, { status: "FERME", resolvedAt: apres(240) })]);
    db.supportMessage.groupBy.mockResolvedValue([]);
    expect((await ZupDriveSupportService.getSupportMetrics()).avgResolutionTime).toBe(4);
  });
});

describe("rapport de conformité : suspensions", () => {
  it("recent30Days compte les suspensions datées de moins de 30 jours ; les autres sont séparées", async () => {
    const jours = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
    const chauffeur = (statut: string, suspendedAt: Date | null) => ({ id: statut + String(suspendedAt), documents: [], infractions: [], statut, suspendedAt });
    db.chauffeurDrive.findMany.mockResolvedValue([
      chauffeur("SUSPENDU", jours(5)),
      chauffeur("SUSPENDU", jours(29)),
      chauffeur("SUSPENDU", jours(90)),
      chauffeur("SUSPENDU", null),
      chauffeur("VALIDE", jours(2)), // rétabli puis ancienne date non effacée : non suspendu, ne compte pas
    ]);
    db.noteCourseDrive.groupBy.mockResolvedValue([]);

    const r = await ZupDriveReportingService.generateComplianceReport();

    expect(r.suspensions).toEqual({ active: 4, recent30Days: 2, sansDate: 1 });
  });

  it("sans chauffeur : tout à zéro, sans NaN", async () => {
    db.chauffeurDrive.findMany.mockResolvedValue([]);
    db.noteCourseDrive.groupBy.mockResolvedValue([]);
    const r = await ZupDriveReportingService.generateComplianceReport();
    expect(r.suspensions).toEqual({ active: 0, recent30Days: 0, sansDate: 0 });
    expect(Number.isFinite(r.riskMetrics.riskScore)).toBe(true);
  });
});

describe("contrôles de conformité : pas de contrôle géographique sans géométrie de région", () => {
  it("la liste ne contient plus GEOGRAPHIC_ANOMALY", async () => {
    db.chauffeurDrive.findUnique.mockResolvedValue({
      id: "c1", userId: "u1", nomComplet: "X", region: "BRUXELLES", societeId: null, statut: "SOUMIS",
      createdAt: new Date(), documents: [], infractions: [], courses: [],
    });
    (db as any).complianceReportDrive = { create: jest.fn(async () => ({})) };
    const rapport = await ZupDriveComplianceChecksService.runFullCompliance("c1");
    expect(rapport.checks.map((c) => c.type)).not.toContain("GEOGRAPHIC_ANOMALY");
    expect(rapport.checks).toHaveLength(7);
    expect((ZupDriveComplianceChecksService as any).checkGeographicAnomalies).toBeUndefined();
  });
});
