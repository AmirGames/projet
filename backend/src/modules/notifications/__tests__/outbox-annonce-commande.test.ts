import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const db: any = { order: { findUnique: jest.fn() } };
const annoncer = jest.fn(async (_commande: any) => undefined);
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../orders/order.service", () => ({ OrderService: { annoncerAuCommercant: annoncer } }));
jest.mock("../email.service", () => ({ EmailService: {} }));
jest.mock("../../jobs/outbox.service", () => ({ Outbox: { declarer: jest.fn() } }));
import { annoncerCommande } from "../outbox-handlers";

beforeEach(() => { jest.clearAllMocks(); });

describe("annonce d'une commande payée, rejouée depuis l'outbox", () => {
  it("annonce la commande relue en base", async () => {
    db.order.findUnique.mockResolvedValue({ id: "cmd-1", deletedAt: null });
    await annoncerCommande({ orderId: "cmd-1" });
    expect(annoncer).toHaveBeenCalledWith({ id: "cmd-1", deletedAt: null });
  });

  it("n'annonce pas une commande retirée entre-temps", async () => {
    db.order.findUnique.mockResolvedValue({ id: "cmd-1", deletedAt: new Date() });
    await annoncerCommande({ orderId: "cmd-1" });
    expect(annoncer).not.toHaveBeenCalled();
  });
});
