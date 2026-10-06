import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const tx: any = {
  courier: { findUnique: jest.fn(), update: jest.fn() },
  orderDelivery: { updateMany: jest.fn() },
  deliveryOffer: { updateMany: jest.fn() },
};
const db: any = {
  $transaction: jest.fn(),
  orderDelivery: { count: jest.fn(), findUniqueOrThrow: jest.fn() },
  deliveryOffer: { findUnique: jest.fn() },
};
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../realtime/socket", () => ({ emitDeliveryUpdate: jest.fn(), emitDriverEvent: jest.fn() }));
jest.mock("../../notifications/notifier.service", () => ({ Notifier: { etapeLivraisonClient: jest.fn(), livreurTrouveBoutique: jest.fn() }, enArrierePlan: jest.fn() }));
import { DispatchService } from "../dispatch.service";

beforeEach(() => {
  db.deliveryOffer.findUnique.mockResolvedValue({ id: "offre-alice", deliveryId: "course-alice", driverId: "alice", status: "PENDING", expiresAt: new Date(Date.now() + 60000), delivery: { driverId: null }, payout: 5, distanceKm: 2 });
  db.orderDelivery.count.mockResolvedValue(0);
  db.orderDelivery.findUniqueOrThrow.mockResolvedValue({ id: "course-alice" });
  jest.spyOn(DispatchService, "reglages").mockResolvedValue({ tournee: { maxCourses: 2 } } as any);
  tx.courier.findUnique.mockResolvedValue({ status: "ACTIVE", currentOrderId: null });
  tx.orderDelivery.updateMany.mockResolvedValue({ count: 1 });
  tx.deliveryOffer.updateMany.mockResolvedValue({ count: 1 });
  db.$transaction.mockImplementation(async (callback: any) => callback(tx));
});

describe("attribution transactionnelle d'une course", () => {
  it("Alice accepte sa propre offre encore ouverte et reçoit sa course", async () => {
    const result = await DispatchService.accepter("offre-alice", "alice");
    expect(result.lot).toEqual(["course-alice"]);
    expect(tx.courier.update).toHaveBeenCalledWith({ where: { id: "alice" }, data: { currentOrderId: "course-alice", isAvailable: false } });
    expect(tx.orderDelivery.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "course-alice", driverId: null, status: "PENDING" }, data: expect.objectContaining({ driverId: "alice", status: "ACCEPTED" }) }));
  });
  it("Bob ne peut pas accepter l'offre d'Alice", async () => {
    await expect(DispatchService.accepter("offre-alice", "bob")).rejects.toMatchObject({ code: "OFFER_NOT_FOUND" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("une attribution intercalée ne peut jamais être écrasée", async () => {
    tx.orderDelivery.updateMany.mockResolvedValue({ count: 0 });
    await expect(DispatchService.accepter("offre-alice", "alice")).rejects.toMatchObject({ statusCode: 409, code: "ALREADY_ASSIGNED" });
    expect(tx.orderDelivery.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "course-alice", driverId: null, status: "PENDING" } }));
    expect(tx.deliveryOffer.updateMany).not.toHaveBeenCalled();
    expect(tx.courier.update).not.toHaveBeenCalled();
  });
  it("une proposition devenue fermée fait échouer la transaction", async () => {
    tx.deliveryOffer.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(DispatchService.accepter("offre-alice", "alice")).rejects.toMatchObject({ code: "OFFER_CLOSED" });
    expect(tx.deliveryOffer.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "offre-alice", driverId: "alice", status: "PENDING", expiresAt: { gt: expect.any(Date) } } }));
    expect(tx.courier.update).not.toHaveBeenCalled();
  });
  it.each(["PENDING", "SUSPENDED", "INACTIVE", "REJECTED"])("un compte %s ne peut pas accepter une ancienne offre", async state => {
    tx.courier.findUnique.mockResolvedValue({ status: state });
    await expect(DispatchService.accepter("offre-alice", "alice")).rejects.toMatchObject({ code: "DRIVER_NOT_ACTIVE" });
    expect(tx.orderDelivery.updateMany).not.toHaveBeenCalled();
    expect(tx.deliveryOffer.updateMany).not.toHaveBeenCalled();
  });
});
