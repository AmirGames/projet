import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const journaliser: any = jest.fn(async () => undefined);
const service: any = {
  createScheduledReport: jest.fn(async () => ({ id: "sr1" })),
  updateScheduledReport: jest.fn(async () => undefined),
  generateFinancialReport: jest.fn(async () => ({})),
};
const sections: Array<string | undefined> = [];
jest.mock("../../../services/db", () => ({ db: {} }));
jest.mock("../../superowner/shared", () => ({ journaliser }));
jest.mock("../zupdrive-reporting.service", () => ({ ZupDriveReportingService: service }));
jest.mock("../../auth/auth.middleware", () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    if (!req.header("x-user")) return res.status(401).json({});
    req.userId = req.header("x-user");
    req.compte = { isSuperOwner: false, isSystemAdmin: req.header("x-equipe") === "1", acces: {} };
    next();
  },
}));
jest.mock("../../auth/permissions-plateforme.service", () => ({
  exigerPermission: (_r: string, _p: string, section?: string) => {
    sections.push(section);
    return (req: any, res: any, next: any) => (req.compte?.isSystemAdmin ? next() : res.status(403).json({}));
  },
}));
import router from "../zupdrive-reporting.routes";

const app = express();
app.use(express.json());
app.use("/api/zupdrive/reporting", router);
app.use((err: any, _req: any, res: any, _next: any) => res.status(err.statusCode || (err.name === "ZodError" ? 400 : 500)).json({}));
const equipe = { "x-user": "agent", "x-equipe": "1" };

beforeEach(() => { jest.clearAllMocks(); });

describe("rapports ZupDrive", () => {
  it("section « courses-drive » ; 401 sans jeton, 403 sans droit", async () => {
    expect(sections).toContain("courses-drive");
    const corps = { startDate: "2026-01-01T00:00:00.000Z", endDate: "2026-02-01T00:00:00.000Z" };
    expect((await request(app).post("/api/zupdrive/reporting/admin/financial").send(corps)).status).toBe(401);
    expect((await request(app).post("/api/zupdrive/reporting/admin/financial").set({ "x-user": "u" }).send(corps)).status).toBe(403);
    expect(service.generateFinancialReport).not.toHaveBeenCalled();
  });

  it("création et modification d'un rapport programmé sont journalisées, destinataires compris", async () => {
    const corps = { name: "Hebdo finances", reportType: "FINANCIAL", frequency: "WEEKLY", recipients: ["compta@exemple.test"], format: "PDF" };
    expect((await request(app).post("/api/zupdrive/reporting/admin/scheduled").set(equipe).send(corps)).status).toBe(201);
    expect(journaliser).toHaveBeenCalledWith(expect.anything(), "ZUPDRIVE_CREATE_SCHEDULED_REPORT", "sr1", corps);
    await request(app).patch("/api/zupdrive/reporting/admin/scheduled/sr1").set(equipe).send({ active: false });
    expect(journaliser).toHaveBeenCalledWith(expect.anything(), "ZUPDRIVE_UPDATE_SCHEDULED_REPORT", "sr1", { active: false });
  });
});
