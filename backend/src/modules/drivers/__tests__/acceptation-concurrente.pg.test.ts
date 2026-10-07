import "dotenv/config";

/**
 * Concurrence réelle sur PostgreSQL (C-16) : un livreur dont la capacité est
 * d'une course ne peut pas en accepter deux en même temps. Chaque acceptation
 * lisait « une place libre » avant l'autre ; sans verrou, les deux passaient.
 */

jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../realtime/socket", () => ({ emitDeliveryUpdate: jest.fn(), emitDriverEvent: jest.fn() }));
jest.mock("../../notifications/notifier.service", () => ({
  Notifier: { etapeLivraisonClient: jest.fn(), livreurTrouveBoutique: jest.fn() },
  enArrierePlan: jest.fn(),
}));

process.env.DATA_ENCRYPTION_KEYS = JSON.stringify({ pgtest: Buffer.alloc(32, 77).toString("base64") });
process.env.DATA_ENCRYPTION_ACTIVE_KEY = "pgtest";

import { db } from "../../../services/db";
import { DispatchService } from "../dispatch.service";

const unique = `acc-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
let orgId = "";
let courierId = "";
const orderIds: string[] = [];

async function course(n: number) {
  const store = await db.store.findFirst({ where: { orgId } });
  const order = await db.order.create({
    data: {
      storeId: store!.id,
      customerName: "Client",
      customerEmail: `c${n}-${unique}@example.test`,
      customerPhone: "0470000000",
      deliveryType: "DELIVERY",
      status: "READY",
      totalAmount: 20,
      taxAmount: 0,
      feesAmount: 3,
    },
  });
  orderIds.push(order.id);
  const delivery = await db.orderDelivery.create({ data: { orderId: order.id, status: "PENDING" } });
  const offre = await db.deliveryOffer.create({
    data: { deliveryId: delivery.id, driverId: courierId, status: "PENDING", distanceKm: 2, payout: 4, expiresAt: new Date(Date.now() + 5 * 60_000) },
  });
  return { delivery, offre };
}

beforeAll(async () => {
  const org = await db.organization.create({ data: { name: `Org ${unique}`, slug: unique } });
  orgId = org.id;
  await db.store.create({ data: { orgId, name: "Boutique", slug: `${unique}-s` } });
  const courier = await db.courier.create({
    data: { name: "Livreur", email: `l-${unique}@example.test`, phone: "0470000001", vehicleType: "bike", status: "ACTIVE" },
  });
  courierId = courier.id;
});

afterAll(async () => {
  await db.deliveryOffer.deleteMany({ where: { driverId: courierId } });
  await db.orderDelivery.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.order.deleteMany({ where: { id: { in: orderIds } } });
  await db.courier.deleteMany({ where: { id: courierId } });
  await db.store.deleteMany({ where: { orgId } });
  await db.organization.deleteMany({ where: { id: orgId } });
  await db.$disconnect();
});

describe("C-16 : acceptations simultanées pour une seule place", () => {
  it("une seule course est attribuée au livreur, même avec huit offres simultanées", async () => {
    jest.spyOn(DispatchService, "reglages").mockResolvedValue({ tournee: { maxCourses: 1 } } as any);
    // Plusieurs offres : la fenêtre de course est étroite, une paire peut passer
    // l'une après l'autre par hasard.
    const offres = await Promise.all(Array.from({ length: 8 }, (_, n) => course(n)));

    const resultats = await Promise.allSettled(offres.map((o) => DispatchService.accepter(o.offre.id, courierId)));

    const reussies = resultats.filter((r) => r.status === "fulfilled");
    const refusees = resultats.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(reussies).toHaveLength(1);
    expect(refusees).toHaveLength(7);
    expect(refusees.every((r) => r.reason.code === "TOO_MANY_DELIVERIES")).toBe(true);

    const enCours = await db.orderDelivery.count({ where: { driverId: courierId, status: { in: ["ACCEPTED", "PICKED_UP"] } } });
    expect(enCours).toBe(1);
  });
});
