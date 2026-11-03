import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const db: any = {
  membership: { findMany: jest.fn() },
  store: { findFirst: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
  order: { findMany: jest.fn() },
};
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn() } }));
jest.mock("../../realtime/socket", () => ({ emitMerchantEvent: jest.fn() }));
jest.mock("../order-management.service", () => ({ OrderManagementService: {} }));
jest.mock("../order-acceptance.service", () => ({ OrderAcceptanceService: {}, MOTIFS_DU_COMMERCANT: ["TOO_BUSY", "PRODUCT_UNAVAILABLE", "EXCEPTIONAL_CLOSURE", "OTHER"] }));
jest.mock("../../auth/auth.middleware", () => ({ authMiddleware: (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.sendStatus(401);
  req.userId = token; next();
} }));
import router from "../order-management.routes";

const app = express();
app.use(express.json());
app.use('/api/order-management', router);
app.use((err: any, _req: any, res: any, _next: any) => res.status(err.name === 'ZodError' ? 400 : err.statusCode ?? 500).json({ error: err.message }));
const url = '/api/order-management/store-1/preparation';
const corps = { minutesParDefaut: 25, commandesParalleles: 3, supplementRush: 10, dureeRush: 60 };

beforeEach(() => {
  jest.clearAllMocks();
  db.membership.findMany.mockImplementation(async ({ where }: any) => [{ orgId: 'org-1', role: where.userId === 'staff' ? 'STORE_STAFF' : 'STORE_MANAGER', storeIds: [where.userId === 'etranger' ? 'store-2' : 'store-1'] }]);
  db.store.findFirst.mockImplementation(async ({ where }: any) => {
    const scope = where.AND[1];
    return scope.OR?.some((s: any) => s.orgId === 'org-1' && s.id.in.includes('store-1')) ? { id: 'store-1', orgId: 'org-1' } : null;
  });
  db.store.findUniqueOrThrow.mockResolvedValue({ kitchenDefaultMinutes: 20, kitchenParallelOrders: 3, kitchenRushExtraMinutes: 0, kitchenRushUntil: null });
  db.store.update.mockResolvedValue({}); db.order.findMany.mockResolvedValue([]);
});

describe('préparation cuisine — autorisations et réglages', () => {
  it('refuse une lecture sans session et une boutique étrangère avant les statistiques', async () => {
    expect((await request(app).get(url)).status).toBe(401);
    expect((await request(app).get(url).set('Authorization', 'Bearer etranger')).status).toBe(403);
    expect(db.order.findMany).not.toHaveBeenCalled();
  });
  it('permet au personnel de lire une suggestion, sans modifier les réglages', async () => {
    const lecture = await request(app).get(url).set('Authorization', 'Bearer staff');
    expect(lecture.status).toBe(200); expect(lecture.body.minutes).toBe(20);
    expect((await request(app).put(url).set('Authorization', 'Bearer staff').send(corps)).status).toBe(403);
    expect(db.store.update).not.toHaveBeenCalled();
  });
  it('active un rush borné pour le responsable, sans écrire les commandes', async () => {
    const avant = Date.now();
    expect((await request(app).put(url).set('Authorization', 'Bearer manager').send(corps)).status).toBe(200);
    const data = db.store.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ kitchenDefaultMinutes: 25, kitchenParallelOrders: 3, kitchenRushExtraMinutes: 10 });
    expect(data.kitchenRushUntil.getTime()).toBeGreaterThanOrEqual(avant + 60 * 60_000);
  });
  it('peut conserver un rush en changeant seulement la capacité, puis l’arrêter', async () => {
    expect((await request(app).put(url).set('Authorization', 'Bearer manager').send({ ...corps, dureeRush: null })).status).toBe(200);
    expect(db.store.update.mock.calls[0][0].data).not.toHaveProperty('kitchenRushUntil');
    expect((await request(app).put(url).set('Authorization', 'Bearer manager').send({ ...corps, dureeRush: 0 })).status).toBe(200);
    expect(db.store.update.mock.calls[1][0].data).toMatchObject({ kitchenRushUntil: null, kitchenRushExtraMinutes: 0 });
  });
  it.each([{ commandesParalleles: 0 }, { minutesParDefaut: 1000 }, { dureeRush: 999 }, { supplementRush: -1 }])('refuse les réglages invalides : %j', async (invalide) => {
    expect((await request(app).put(url).set('Authorization', 'Bearer manager').send({ ...corps, ...invalide })).status).toBe(400);
    expect(db.store.update).not.toHaveBeenCalled();
  });
});
