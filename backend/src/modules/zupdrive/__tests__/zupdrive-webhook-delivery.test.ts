import { createHmac } from "node:crypto";
import { beforeEach, expect, jest, test } from "@jest/globals";

const mockDb: any = {
  webhookDeliveryDrive: { findMany: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
  webhookEvent: { update: jest.fn() },
};
const mockPoster = jest.fn() as any;
const mockDestination = jest.fn() as any;
jest.mock("../../../services/db", () => ({ db: mockDb }));
jest.mock("../../privacy/crypto", () => ({ decrypt: () => Buffer.from("test-secret"), encrypt: (value: string) => value }));
jest.mock("../../webhooks/webhook-destination", () => ({ posterWebhook: mockPoster, destinationWebhook: mockDestination }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import { ZupDriveWebhooksService } from "../zupdrive-webhooks.service";

const event = { id: "event-1", eventType: "DRIVER_SUSPENDED", resourceType: "DRIVER", resourceId: "driver-1", data: '{"reason":"review"}', timestamp: new Date("2026-10-11T10:00:00Z") };
const delivery = (extra: any = {}) => ({
  id: "delivery-stable-id", eventId: event.id, webhookId: "endpoint-1", status: "PENDING", attempt: 0, maxAttempts: 3,
  endpoint: { id: "endpoint-1", url: "https://example.com/hook", secret: "encrypted", active: true, retryPolicy: '{"initialDelayMs":1000,"backoffMultiplier":2}' },
  event, ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.ZUPDRIVE_WEBHOOKS_ENABLED = "true";
  mockDb.webhookDeliveryDrive.findMany.mockResolvedValue([delivery()]);
  mockDb.webhookDeliveryDrive.updateMany.mockResolvedValue({ count: 1 });
  mockDb.webhookDeliveryDrive.update.mockResolvedValue({});
  mockDb.webhookEvent.update.mockResolvedValue({});
  mockDb.webhookDeliveryDrive.findMany.mockImplementation(async (args: any) => args.select ? [{ status: "SENT" }] : [delivery()]);
  mockDestination.mockResolvedValue({});
  mockPoster.mockResolvedValue({ status: 204, ok: true });
});

test("signe le corps brut, versionne et conserve l'identifiant de dédoublonnage", async () => {
  expect(await ZupDriveWebhooksService.traiterLesLivraisonsDues()).toBe(1);
  const [url, headers, body] = mockPoster.mock.calls[0] as any[];
  const parsed = JSON.parse(body);
  expect(url).toBe("https://example.com/hook");
  expect(parsed).toMatchObject({ id: "delivery-stable-id", event: "DRIVER_SUSPENDED", version: "2026-10-11", data: { resourceType: "DRIVER", resourceId: "driver-1" } });
  expect(headers["X-Webhook-Id"]).toBe(parsed.id);
  expect(headers["X-Webhook-Version"]).toBe(parsed.version);
  expect(headers["X-Webhook-Signature"]).toBe(`sha256=${createHmac("sha256", "test-secret").update(body).digest("hex")}`);
  expect(mockDb.webhookDeliveryDrive.update.mock.calls[0][0].data.status).toBe("SENT");
});

test("réapplique la validation destination à l'envoi et ne suit pas une cible interdite", async () => {
  const denied: any = new Error("forbidden"); denied.code = "WEBHOOK_DESTINATION_FORBIDDEN";
  mockDestination.mockRejectedValue(denied);
  await ZupDriveWebhooksService.traiterLesLivraisonsDues();
  expect(mockDestination).toHaveBeenCalledWith("https://example.com/hook");
  expect(mockPoster).not.toHaveBeenCalled();
  expect(mockDb.webhookDeliveryDrive.update.mock.calls[0][0].data).toMatchObject({ status: "FAILED", errorMessage: "Destination webhook interdite" });
});

test.each([400, 500, 429])("classe les réponses HTTP %i selon leur caractère temporaire", async (status) => {
  mockPoster.mockResolvedValue({ status, ok: false });
  await ZupDriveWebhooksService.traiterLesLivraisonsDues();
  expect(mockDb.webhookDeliveryDrive.update.mock.calls[0][0].data.status).toBe(status === 400 ? "FAILED" : "PENDING");
});

test("un timeout conserve l'intention en attente et programme un délai progressif", async () => {
  mockPoster.mockRejectedValue(new Error("timeout"));
  await ZupDriveWebhooksService.traiterLesLivraisonsDues(20, new Date("2026-10-11T10:00:00Z"));
  const update = mockDb.webhookDeliveryDrive.update.mock.calls[0][0].data;
  expect(update.status).toBe("PENDING");
  expect(update.nextAttemptAt).toEqual(new Date("2026-10-11T10:00:01Z"));
});

test("un second worker perd la prise atomique et ne double pas l'envoi", async () => {
  mockDb.webhookDeliveryDrive.updateMany.mockResolvedValue({ count: 0 });
  expect(await ZupDriveWebhooksService.traiterLesLivraisonsDues()).toBe(0);
  expect(mockPoster).not.toHaveBeenCalled();
});

test("deux workers concurrents ne revendiquent et n'envoient qu'une fois", async () => {
  mockDb.webhookDeliveryDrive.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
  const results = await Promise.all([
    ZupDriveWebhooksService.traiterLesLivraisonsDues(),
    ZupDriveWebhooksService.traiterLesLivraisonsDues(),
  ]);
  expect(results.reduce((sum, count) => sum + count, 0)).toBe(1);
  expect(mockPoster).toHaveBeenCalledTimes(1);
});

test("une réponse reçue avant crash peut être renvoyée avec le même identifiant", async () => {
  const retried = delivery({ attempt: 1 });
  mockDb.webhookDeliveryDrive.findMany
    .mockImplementationOnce(async () => [delivery()])
    .mockImplementationOnce(async (args: any) => args.select ? [{ status: "SENT" }] : [retried]);
  mockDb.webhookDeliveryDrive.update.mockRejectedValueOnce(new Error("crash avant commit"));
  await ZupDriveWebhooksService.traiterLesLivraisonsDues();
  await ZupDriveWebhooksService.traiterLesLivraisonsDues();
  expect(mockPoster).toHaveBeenCalledTimes(2);
  expect((mockPoster.mock.calls[0] as any[])[1]["X-Webhook-Id"]).toBe("delivery-stable-id");
  expect((mockPoster.mock.calls[1] as any[])[1]["X-Webhook-Id"]).toBe("delivery-stable-id");
});

test("reprend un bail expiré après crash et renvoie le même identifiant", async () => {
  mockDb.webhookDeliveryDrive.findMany.mockImplementation(async (args: any) => args.select ? [{ status: "SENT" }] : [delivery({ status: "PROCESSING", attempt: 1, lockedUntil: new Date("2026-10-11T09:59:00Z") })]);
  await ZupDriveWebhooksService.traiterLesLivraisonsDues(20, new Date("2026-10-11T10:00:00Z"));
  expect(mockDb.webhookDeliveryDrive.updateMany.mock.calls[0][0].where).toMatchObject({ id: "delivery-stable-id", status: "PROCESSING", attempt: 1 });
  expect((mockPoster.mock.calls[0] as any[])[1]["X-Webhook-Id"]).toBe("delivery-stable-id");
});

test("le flag fermé garde les livraisons en attente", async () => {
  process.env.ZUPDRIVE_WEBHOOKS_ENABLED = "false";
  expect(await ZupDriveWebhooksService.traiterLesLivraisonsDues()).toBe(0);
  expect(mockDb.webhookDeliveryDrive.findMany).not.toHaveBeenCalled();
});
