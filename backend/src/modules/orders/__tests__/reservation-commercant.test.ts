import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../../../services/db", () => ({ db: {} }));
jest.mock("../../webhooks/webhook.service", () => ({ emitWebhook: jest.fn() }));
import { avecReservation } from "../order-management.service";

describe("course réservée vue par le commerçant", () => {
  it("indique qu'un livreur a réservé la course, sans révéler qui", () => {
    const res: any = avecReservation({ id: "cmd", delivery: { status: "PENDING", driverId: null, reservedDriverId: "livreur-42" } as any });
    expect(res.delivery.reservee).toBe(true);
    expect(res.delivery).not.toHaveProperty("reservedDriverId");
    expect(JSON.stringify(res)).not.toContain("livreur-42");
  });

  it("sans réservation, la course reste « en recherche »", () => {
    const res: any = avecReservation({ id: "cmd", delivery: { status: "PENDING", driverId: null, reservedDriverId: null } as any });
    expect(res.delivery.reservee).toBe(false);
  });

  it("une commande sans course est renvoyée telle quelle", () => {
    const commande = { id: "cmd", delivery: null };
    expect(avecReservation(commande)).toBe(commande);
  });
});
