import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const db: any = {
  order: {
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  deliveryOffer: { updateMany: jest.fn() },
  orderDelivery: { update: jest.fn(), findUnique: jest.fn() },
  notification: { create: jest.fn() },
};

jest.mock("../db", () => ({ db }));
jest.mock("../../config/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../../config/socket", () => ({
  emitOrderUpdate: jest.fn(),
  emitNotification: jest.fn(),
  emitMerchantEvent: jest.fn(),
}));
jest.mock("../webhook.service", () => ({ emitWebhook: jest.fn() }));
jest.mock("../email.service", () => ({
  EmailService: { sendOrderStatusUpdate: jest.fn() },
}));
jest.mock("../notifier.service", () => ({
  Notifier: { pushLivreur: jest.fn(async () => true) },
  enArrierePlan: (envoi: Promise<unknown>) => envoi,
}));
jest.mock("../dispatch.service", () => ({
  DispatchService: {
    creerCourse: jest.fn(async () => ({ id: "course-1", driverId: null })),
    proposerAuSuivant: jest.fn(),
  },
}));

import {
  OrderAcceptanceService,
  echeanceDeReponse,
  verifierTransition,
} from "../order-acceptance.service";
import { EmailService } from "../email.service";
import { DispatchService } from "../dispatch.service";
import { Notifier } from "../notifier.service";

const MINUTE = 60 * 1000;

describe("echeanceDeReponse", () => {
  const passee = new Date("2026-09-24T08:00:00Z");

  it("laisse dix minutes pour une livraison", () => {
    const echeance = echeanceDeReponse({ createdAt: passee, deliveryType: "DELIVERY", pickupTime: null });
    expect(echeance.getTime() - passee.getTime()).toBe(10 * MINUTE);
  });

  it("attend jusqu'à vingt minutes avant un retrait programmé", () => {
    // Commandée à 10 h pour midi : réponse attendue avant 11 h 40.
    const midi = new Date(passee.getTime() + 2 * 60 * MINUTE);
    const echeance = echeanceDeReponse({ createdAt: passee, deliveryType: "PICKUP", pickupTime: midi });
    expect(echeance.getTime()).toBe(midi.getTime() - 20 * MINUTE);
  });

  it("ne laisse jamais moins de dix minutes, même pour un créneau proche", () => {
    const bientot = new Date(passee.getTime() + 25 * MINUTE);
    const echeance = echeanceDeReponse({ createdAt: passee, deliveryType: "PICKUP", pickupTime: bientot });
    expect(echeance.getTime() - passee.getTime()).toBe(10 * MINUTE);
  });
});

describe("verifierTransition", () => {
  it("renvoie accepter et refuser vers leurs propres routes", () => {
    expect(() => verifierTransition("PENDING", "ACCEPTED")).toThrow();
    expect(() => verifierTransition("ACCEPTED", "REJECTED")).toThrow();
  });

  it("interdit de préparer une commande pas encore acceptée", () => {
    expect(() => verifierTransition("PENDING", "PREPARING")).toThrow();
  });

  it("ne fait pas repartir une commande refusée", () => {
    expect(() => verifierTransition("REJECTED", "READY")).toThrow();
  });

  it("laisse avancer une commande acceptée", () => {
    expect(() => verifierTransition("ACCEPTED", "PREPARING")).not.toThrow();
    expect(() => verifierTransition("PREPARING", "READY")).not.toThrow();
    expect(() => verifierTransition("READY", "COMPLETED")).not.toThrow();
  });
});

describe("OrderAcceptanceService", () => {
  const base = {
    id: "cmd-1",
    storeId: "boutique-1",
    customerName: "Dupont",
    customerEmail: "dupont@example.com",
    totalAmount: 24,
    paymentStatus: "PENDING",
    deliveryMode: null,
    deletedAt: null,
    createdAt: new Date(),
  };

  beforeEach(() => {
    db.order.updateMany.mockResolvedValue({ count: 1 });
  });

  it("accepte un retrait en gardant le créneau choisi comme heure prévue", async () => {
    const creneau = new Date(Date.now() + 90 * MINUTE);
    db.order.findUnique.mockResolvedValue({ ...base, status: "PENDING", deliveryType: "PICKUP", pickupTime: creneau });
    db.order.findUniqueOrThrow.mockResolvedValue({
      ...base,
      status: "ACCEPTED",
      deliveryType: "PICKUP",
      pickupTime: creneau,
      estimatedReadyAt: creneau,
    });

    await OrderAcceptanceService.accepter("boutique-1", "cmd-1", 20);

    const ecrit = db.order.updateMany.mock.calls[0][0];
    expect(ecrit.where).toEqual({ id: "cmd-1", status: "PENDING" });
    expect(ecrit.data.estimatedReadyAt).toEqual(creneau);
    expect(EmailService.sendOrderStatusUpdate).toHaveBeenCalled();
  });

  it("refuse d'accepter une commande déjà refusée", async () => {
    db.order.findUnique.mockResolvedValue({ ...base, status: "REJECTED", deliveryType: "PICKUP", pickupTime: null });

    await expect(OrderAcceptanceService.accepter("boutique-1", "cmd-1", 20)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("cherche un livreur tout de suite quand la préparation est courte", async () => {
    db.order.findUnique.mockResolvedValue({ ...base, status: "PENDING", deliveryType: "DELIVERY", pickupTime: null });
    db.order.findUniqueOrThrow.mockResolvedValue({
      ...base,
      status: "ACCEPTED",
      deliveryType: "DELIVERY",
      deliveryMode: "PLATFORM",
      pickupTime: null,
      estimatedReadyAt: new Date(Date.now() + 10 * MINUTE),
    });

    await OrderAcceptanceService.accepter("boutique-1", "cmd-1", 10);

    expect(DispatchService.creerCourse).toHaveBeenCalledWith("cmd-1");
  });

  it("n'appelle pas le livreur trop tôt pour une longue préparation", async () => {
    db.order.findUnique.mockResolvedValue({ ...base, status: "PENDING", deliveryType: "DELIVERY", pickupTime: null });
    db.order.findUniqueOrThrow.mockResolvedValue({
      ...base,
      status: "ACCEPTED",
      deliveryType: "DELIVERY",
      deliveryMode: "PLATFORM",
      pickupTime: null,
      estimatedReadyAt: new Date(Date.now() + 45 * MINUTE),
    });

    await OrderAcceptanceService.accepter("boutique-1", "cmd-1", 45);

    expect(DispatchService.creerCourse).not.toHaveBeenCalled();
  });

  it("refuse avec le motif et prévient le client par e-mail", async () => {
    db.order.findUnique.mockResolvedValue({
      ...base,
      status: "ACCEPTED",
      deliveryType: "PICKUP",
      delivery: null,
      store: { name: "Chez Tamara", phone: "0612345678" },
    });
    db.order.findUniqueOrThrow.mockResolvedValue({ ...base, status: "REJECTED" });

    await OrderAcceptanceService.refuser("boutique-1", "cmd-1", "EXCEPTIONAL_CLOSURE");

    expect(db.order.updateMany.mock.calls[0][0].data.rejectionReason).toBe("EXCEPTIONAL_CLOSURE");
    const [, contenu] = (EmailService.sendOrderStatusUpdate as jest.Mock).mock.calls[0] as any[];
    expect(contenu.message).toContain("fermer exceptionnellement");
  });

  it("ne refuse pas une commande déjà prise par un livreur", async () => {
    db.order.findUnique.mockResolvedValue({
      ...base,
      status: "READY",
      deliveryType: "DELIVERY",
      delivery: { id: "course-1", driverId: "livreur-1" },
      store: { name: "Chez Tamara", phone: null },
    });

    await expect(
      OrderAcceptanceService.refuser("boutique-1", "cmd-1", "TOO_BUSY")
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("refuse d'elle-même une livraison restée sans réponse", async () => {
    db.order.findMany.mockResolvedValue([
      { id: "cmd-1", createdAt: new Date(Date.now() - 11 * MINUTE), deliveryType: "DELIVERY", pickupTime: null },
      // Retrait à midi commandé tôt : il reste du temps.
      {
        id: "cmd-2",
        createdAt: new Date(Date.now() - 60 * MINUTE),
        deliveryType: "PICKUP",
        pickupTime: new Date(Date.now() + 60 * MINUTE),
      },
    ]);
    db.order.findUnique.mockResolvedValue({
      ...base,
      status: "PENDING",
      deliveryType: "DELIVERY",
      delivery: null,
      store: { name: "Chez Tamara", phone: null },
    });
    db.order.findUniqueOrThrow.mockResolvedValue({ ...base, status: "REJECTED" });

    const refusees = await OrderAcceptanceService.refuserLesCommandesSansReponse();

    expect(refusees).toBe(1);
    expect(db.order.updateMany.mock.calls[0][0].data.rejectionReason).toBe("NO_RESPONSE");
  });
});

describe("OrderAcceptanceService.surAvancement", () => {
  const livraison = { id: "cmd-1", deliveryType: "DELIVERY", deliveryMode: "PLATFORM" };

  beforeEach(() => {
    jest.clearAllMocks();
    db.orderDelivery.findUnique.mockResolvedValue(null);
  });

  it("cherche le livreur le plus proche dès « En préparation »", async () => {
    await OrderAcceptanceService.surAvancement({ ...livraison, status: "PREPARING" });

    expect(DispatchService.creerCourse).toHaveBeenCalledWith("cmd-1");
    expect(DispatchService.proposerAuSuivant).toHaveBeenCalledWith("course-1");
  });

  it("cherche aussi à « Prête » si personne ne l'a encore fait", async () => {
    await OrderAcceptanceService.surAvancement({ ...livraison, status: "READY" });

    expect(DispatchService.creerCourse).toHaveBeenCalledWith("cmd-1");
  });

  it("ne relance pas une recherche déjà partie", async () => {
    db.orderDelivery.findUnique.mockResolvedValue({ id: "course-1", driverId: null, status: "PENDING" });

    await OrderAcceptanceService.surAvancement({ ...livraison, status: "PREPARING" });

    expect(DispatchService.creerCourse).not.toHaveBeenCalled();
  });

  it("prévient le livreur déjà en route quand la commande est prête", async () => {
    db.orderDelivery.findUnique.mockResolvedValue({ id: "course-1", driverId: "livreur-1", status: "ACCEPTED" });

    await OrderAcceptanceService.surAvancement({ ...livraison, status: "READY" });

    expect(DispatchService.creerCourse).not.toHaveBeenCalled();
    expect(Notifier.pushLivreur).toHaveBeenCalledWith("livreur-1", expect.objectContaining({ title: "Commande prête" }));
  });

  it("ne cherche personne pour un retrait ou une livraison du commerçant", async () => {
    await OrderAcceptanceService.surAvancement({ ...livraison, deliveryType: "PICKUP", status: "PREPARING" });
    await OrderAcceptanceService.surAvancement({ ...livraison, deliveryMode: "OWN", status: "PREPARING" });

    expect(DispatchService.creerCourse).not.toHaveBeenCalled();
  });
});
