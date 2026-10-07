import express from "express";
import request from "supertest";

let autorise = true;
const auditCreate = jest.fn(async () => ({}));

jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../../services/db", () => ({
  db: {
    systemAuditLog: { create: (...a: any[]) => (auditCreate as any)(...a) },
    user: { findUnique: jest.fn(async () => ({ email: "root@zup.test" })) },
  },
}));
jest.mock("../../auth/auth.middleware", () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.userId = "admin1";
    next();
  },
}));
jest.mock("../../auth/permissions-plateforme.service", () => ({
  exigerPermission: () => (_req: any, res: any, next: any) =>
    autorise ? next() : res.status(403).json({ error: "refusé" }),
}));
jest.mock("../../auth/security-event.service", () => ({ SecurityEventService: { record: jest.fn() } }));
jest.mock("../../invoicing/platform-invoice.service", () => ({
  moisPrecedent: () => "2026-09",
  PlatformInvoiceService: {
    emettreLeMois: jest.fn(async () => ({ emises: 2 })),
    emettre: jest.fn(async () => ({ id: "inv1", number: "ZUP-2026-0001", ublXml: "<xml/>" })),
    envoyer: jest.fn(async () => ({ id: "inv1", number: "ZUP-2026-0001", ublXml: "<xml/>" })),
  },
}));
jest.mock("../../webhooks/webhook.service", () => ({
  EVENEMENTS_WEBHOOK: [],
  WebhookService: {
    create: jest.fn(async () => ({ id: "wh1", url: "https://x.test/h", events: ["order.created"], status: "ACTIVE", secret: "whsec_TOP_SECRET", retryCount: 0 })),
    remove: jest.fn(async () => undefined),
    setStatus: jest.fn(async () => ({ id: "wh1", status: "INACTIVE", retryCount: 0 })),
    essayer: jest.fn(async () => ({ success: true, statusCode: 200 })),
  },
}));
jest.mock("../../marketing/announcement.service", () => ({
  PUBLICS_CONNUS: ["ALL", "MERCHANTS"],
  AnnouncementService: { diffuser: jest.fn(async () => ({ annonce: { id: "an1" }, destinataires: 12 })) },
}));
jest.mock("../../support/ticket-message.service", () => ({
  TicketMessageService: {
    add: jest.fn(async () => ({ id: "m1" })),
    unarchive: jest.fn(async () => ({ id: "t1" })),
  },
}));

import platformInvoices from "../platform-invoice.routes";
import webhooks from "../webhooks.routes";
import adminTickets from "../../admin/tickets.routes";
import adminNotifications from "../../admin/notifications.routes";
import { errorHandler } from "../../../middleware/errorHandler";

const app = express();
app.use(express.json());
app.use("/so", platformInvoices);
app.use("/so", webhooks);
app.use("/admin", adminTickets);
app.use("/admin", adminNotifications);
app.use(errorHandler);

const dernierAudit = () => (auditCreate.mock.calls.at(-1) as any)?.[0]?.data;

beforeEach(() => {
  jest.clearAllMocks();
  autorise = true;
});

describe("les actions d'administration laissent une trace", () => {
  test.each([
    ["émission du mois", () => request(app).post("/so/platform-invoices/issue-month").send({ period: "2026-08" }), "ISSUE_PLATFORM_INVOICES_MONTH", "2026-08"],
    ["émission d'une facture", () => request(app).post("/so/billing/org1/invoice").send({ period: "2026-08" }), "ISSUE_PLATFORM_INVOICE", "inv1"],
    ["envoi d'une facture", () => request(app).post("/so/platform-invoices/inv1/send"), "SEND_PLATFORM_INVOICE", "inv1"],
    ["création d'un webhook", () => request(app).post("/so/webhooks").send({ url: "https://x.test/h", events: ["order.created"] }), "CREATE_WEBHOOK", "wh1"],
    ["suppression d'un webhook", () => request(app).delete("/so/webhooks/wh1"), "DELETE_WEBHOOK", "wh1"],
    ["pause d'un webhook", () => request(app).patch("/so/webhooks/wh1").send({ status: "INACTIVE" }), "SET_WEBHOOK_STATUS", "wh1"],
    ["essai d'un webhook", () => request(app).post("/so/webhooks/wh1/essai"), "TEST_WEBHOOK", "wh1"],
    ["réponse à un ticket", () => request(app).post("/admin/tickets/t1/messages").send({ body: "Bonjour" }), "REPLY_TICKET", "t1"],
    ["désarchivage d'un ticket", () => request(app).post("/admin/tickets/t1/unarchive"), "UNARCHIVE_TICKET", "t1"],
    ["annonce diffusée", () => request(app).post("/admin/notifications").send({ title: "Maintenance", message: "Ce soir", targetAudience: "MERCHANTS" }), "BROADCAST_ANNOUNCEMENT", "an1"],
  ])("%s", async (_nom, appeler, action, cible) => {
    const res = await appeler();
    expect(res.status).toBeLessThan(300);
    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(dernierAudit()).toMatchObject({ adminId: "admin1", action, target: cible });
  });

  test("le secret d'un webhook n'est jamais écrit au journal", async () => {
    await request(app).post("/so/webhooks").send({ url: "https://x.test/h", events: ["order.created"] });
    expect(JSON.stringify(auditCreate.mock.calls)).not.toContain("whsec_TOP_SECRET");
  });

  test("sans permission : refus, aucune trace et aucun effet", async () => {
    autorise = false;
    const res = await request(app).post("/so/platform-invoices/issue-month").send({});
    expect(res.status).toBe(403);
    expect(auditCreate).not.toHaveBeenCalled();
  });
});
