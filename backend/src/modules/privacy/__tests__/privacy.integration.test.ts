import "dotenv/config";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import express from "express";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../../modules/realtime/socket", () => ({ emitOrderUpdate: jest.fn(), emitDriverUpdate: jest.fn() }));

import { db } from "../../../services/db";
import { AuthService } from "../../auth/auth.service";
import { middlewareOrigine } from "../../auth/origine";
import { errorHandler } from "../../../middleware/errorHandler";
import privacyRouter from "../privacy.routes";
import { collectExport, exportZip } from "../export.service";
import { completeErasure, requestErasure } from "../erasure.service";
import { runRetention } from "../retention.service";
import { recordAudit } from "../audit";
import { encryptionExtension } from "../encrypted-fields";
import { BackupService } from "../../monitoring/backup.service";
import { FileUploadService } from "../../files/file-upload.service";
import { readPrivate } from "../../files/private-storage";
import { cheminRelatif } from "../../files/fichiers-prives.service";

const enabled = process.env.PRIVACY_INTEGRATION === "true";
const integration = enabled ? describe : describe.skip;
const raw = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const password = "Phase6-local-test-only!";
const app = express(); app.use(express.json()); app.use(middlewareOrigine); app.use("/api/privacy", privacyRouter); app.use(errorHandler);
let userId: string, otherId: string, courierId: string, customerId: string, orgId: string, storeId: string, orderId: string, sessionId: string, token: string, fileUrl: string, directory: string;

integration("RGPD sur PostgreSQL réel", () => {
  beforeAll(async () => {
    if (process.env.NODE_ENV !== "test" || !new URL(process.env.DATABASE_URL!).pathname.includes("test")) throw new Error("Base de test dédiée requise");
    process.env.PRIVACY_AUDIT_KEY = randomBytes(32).toString("base64");
    process.env.DATA_ENCRYPTION_KEYS = JSON.stringify({ integration: Buffer.alloc(32, 91).toString("base64") });
    process.env.DATA_ENCRYPTION_ACTIVE_KEY = "integration";
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "zup-privacy-integration-")); process.env.PRIVATE_DOCUMENTS_DIR = path.join(directory, "documents");
    const user = await db.user.create({ data: { email: `privacy-${Date.now()}@example.test`, name: "Compte test", passwordHash: await AuthService.hashPassword(password), emailVerified: true, customer: { create: { email: `customer-${Date.now()}@example.test`, name: "Client", phone: "secret-phone", savedAddresses: [{ address: "Adresse privée" }] } } }, include: { customer: { omit: { savedAddresses: false } } } });
    userId = user.id; customerId = user.customer!.id;
    otherId = (await db.user.create({ data: { email: `other-${Date.now()}@example.test`, passwordHash: await AuthService.hashPassword(password) } })).id;
    orgId = (await db.organization.create({ data: { name: "Commerce test", slug: `privacy-${Date.now()}`, iban: "BE68539007547034" } })).id;
    storeId = (await db.store.create({ data: { orgId, name: "Boutique", slug: `store-${Date.now()}` } })).id;
    orderId = (await db.order.create({ data: { storeId, customerId, customerName: "Client privé", customerEmail: "private@example.test", customerPhone: "secret-phone", deliveryAddress: "Adresse privée", deliveryLat: 50, deliveryLng: 4, deliveryType: "DELIVERY", status: "COMPLETED", totalAmount: 10, taxAmount: 1, feesAmount: 0, paymentStatus: "SUCCEEDED", payments: { create: { amount: 10, status: "SUCCEEDED", stripeClientSecret: "never-export-this" } } } })).id;
    courierId = (await db.courier.create({ data: { userId, name: "Livreur test", email: `driver-${Date.now()}@example.test`, phone: "secret-phone", vehicleType: "bike", status: "ACTIVE", iban: "BE68539007547034" } })).id;
    const upload = await FileUploadService.uploadDocument(Buffer.from("%PDF-1.4\nTest document"), "identity.pdf", "drivers", "application/pdf"); fileUrl = upload.url;
    await db.courierDocument.create({ data: { driverId: courierId, type: "identity", documentUrl: fileUrl, status: "APPROVED" } });
    sessionId = (await db.sessionConnexion.create({ data: { userId, expiresAt: new Date(Date.now() + 3600000) } })).id;
    token = AuthService.generateAccessToken(userId, sessionId);
  }, 30000);
  afterAll(async () => { await db.$disconnect(); await raw.$disconnect(); if (directory) await fs.rm(directory, { recursive: true, force: true }); });

  test("chiffrement réel en base, transaction et lecture imbriquée", async () => {
    const row = await raw.customer.findUnique({ where: { id: customerId } });
    expect(row!.phone).toContain("zupenc:v1:"); expect(JSON.stringify(row!.savedAddresses)).not.toContain("Adresse privée");
    expect((await raw.organization.findUnique({ where: { id: orgId } }))!.iban).not.toBe("BE68539007547034");
    await db.$transaction(async (tx) => { await tx.courier.update({ where: { id: courierId }, data: { phone: "new-phone" } }); });
    expect((await raw.courier.findUnique({ where: { id: courierId } }))!.phone).not.toBe("new-phone");
    expect((await db.user.findUnique({ where: { id: userId }, include: { customer: { omit: { savedAddresses: false } } } }))!.customer!.savedAddresses).toEqual([{ address: "Adresse privée" }]);
  });

  test("défauts JSON des créations et createMany sont chiffrés", async () => {
    const email = `default-${Date.now()}@example.test`;
    await db.customer.createMany({ data: [{ email, name: "Client" }] });
    const row = await raw.customer.findUnique({ where: { email } }); expect(JSON.stringify(row!.savedAddresses)).toContain("_encrypted");
    expect((await db.customer.findUnique({ where: { email }, omit: { savedAddresses: false } }))!.savedAddresses).toEqual([]);
    expect(encryptionExtension).toBeDefined();
  });

  test("fichier chiffré isolé, ZIP lisible et sans secrets de connexion", async () => {
    const relative = cheminRelatif(fileUrl)!;
    const stored = await fs.readFile(path.join(process.env.PRIVATE_DOCUMENTS_DIR!, relative), "utf8");
    expect(stored).not.toContain("Test document"); expect((await readPrivate(relative)).toString()).toContain("%PDF");
    const data = await collectExport(userId), archive = await exportZip(data, { userId });
    const archivePath = path.join(directory, "export.zip"); await fs.writeFile(archivePath, archive);
    const list = execFileSync("unzip", ["-l", archivePath]).toString(); expect(list).toContain("donnees.json"); expect(list).toContain("documents/");
    execFileSync("unzip", ["-t", archivePath]);
    const json = execFileSync("unzip", ["-p", archivePath, "donnees.json"]).toString(); expect(json).not.toContain("never-export-this"); expect(json).not.toContain("passwordHash");
  });

  test("export HTTP exige session et mot de passe, aucun userId arbitraire", async () => {
    expect((await request(app).post("/api/privacy/export").send({ password })).status).toBe(401);
    expect((await request(app).post("/api/privacy/export").set("Authorization", `Bearer ${token}`).send({ password: "wrong" })).status).toBe(403);
    const response = await request(app).post("/api/privacy/export").set("Authorization", `Bearer ${token}`).send({ password, format: "json" });
    expect(response.status).toBe(200); expect(response.body.profile.id).toBe(userId); expect(response.headers["cache-control"]).toContain("no-store");
    expect((await request(app).post("/api/privacy/export").set("Authorization", `Bearer ${token}`).send({ password, userId: otherId })).status).toBe(400);
  });

  test("journal append-only protégé dans PostgreSQL", async () => {
    await recordAudit(userId, "DOCUMENT_VIEW", "test");
    const log = await raw.privacyAuditEvent.findFirstOrThrow({ where: { target: "test" } });
    expect(log.actor).not.toBe(userId);
    await expect(raw.privacyAuditEvent.update({ where: { id: log.id }, data: { outcome: "ALTERED" } })).rejects.toThrow();
    await expect(raw.privacyAuditEvent.delete({ where: { id: log.id } })).rejects.toThrow();
    await expect(raw.$executeRawUnsafe('TRUNCATE "PrivacyAuditEvent"')).rejects.toThrow();
  });

  test("purge bornée et gel légal", async () => {
    const old = new Date(Date.now() - 100 * 86400000);
    await db.courier.update({ where: { id: courierId }, data: { latitude: 50, longitude: 4, lastLocationUpdate: old } });
    await db.order.update({ where: { id: orderId }, data: { createdAt: old } });
    await runRetention();
    expect((await db.courier.findUnique({ where: { id: courierId } }))!.latitude).toBeNull();
    expect((await db.order.findUnique({ where: { id: orderId } }))!.deliveryAddress).toBeNull();
    expect(await db.payment.count({ where: { orderId } })).toBe(1);
  });

  test("effacement complet : sessions, pièces, coordonnées historiques et sauvegardes", async () => {
    const backup = await BackupService.create(userId);
    const stored = await fs.readFile(backup.filePath!, "utf8"); expect(stored.startsWith("zupenc:v1:")).toBe(true); expect(stored).not.toContain("BE68539007547034");
    expect((await requestErasure(userId)).status).toBe("COMPLETED");
    expect(await db.sessionConnexion.count({ where: { userId } })).toBe(0);
    expect(await db.courierDocument.count({ where: { driverId: courierId } })).toBe(0);
    expect((await db.order.findUnique({ where: { id: orderId } }))!.customerId).toBeNull();
    expect((await db.user.findUnique({ where: { id: userId } }))!.status).toBe("DELETED");
    await expect(readPrivate(cheminRelatif(fileUrl)!)).rejects.toThrow();
    await expect(BackupService.restore(backup.id)).rejects.toMatchObject({ code: "RESTORE_ERASURE_CONFLICT" });
    expect((await completeErasure(userId)).status).toBe("COMPLETED");
    expect(await db.payment.count({ where: { orderId } })).toBe(1);
    await BackupService.remove(backup.id);
  }, 30000);
});
