import { describe, expect, it } from "@jest/globals";
import { verifierTransition, echeanceDeReponse } from "../order-acceptance.service";

/**
 * A04 — garde-fous de la machine à états d'une commande.
 * Tests sans Stripe ni base de données : ils ne remplacent pas le scénario E2E.
 */
describe("A04 : transitions de commande", () => {
  it.each(["ACCEPTED", "REJECTED"])(
    "interdit le passage direct vers %s sans route métier", (status) => {
      expect(() => verifierTransition("PENDING", status)).toThrow();
    }
  );

  it("interdit de préparer une commande en attente", () => {
    expect(() => verifierTransition("PENDING", "PREPARING")).toThrow();
  });

  it("interdit de relancer une commande refusée", () => {
    expect(() => verifierTransition("REJECTED", "PREPARING")).toThrow();
  });

  it("interdit de remettre une commande terminée en préparation", () => {
    expect(() => verifierTransition("COMPLETED", "PREPARING")).toThrow();
  });

  it("interdit de remettre une commande acceptée en attente", () => {
    expect(() => verifierTransition("ACCEPTED", "PENDING")).toThrow();
  });

  it("réserve la clôture d'une livraison plateforme au parcours livreur", () => {
    expect(() => verifierTransition("READY", "COMPLETED", {
      deliveryType: "DELIVERY", deliveryMode: "PLATFORM",
    })).toThrow();
  });

  it("autorise la progression normale vers la préparation", () => {
    expect(() => verifierTransition("ACCEPTED", "PREPARING")).not.toThrow();
  });

  it("autorise le retour en préparation pour une commande prête", () => {
    expect(() => verifierTransition("READY", "PREPARING")).not.toThrow();
  });
});

describe("A04 : échéance de réponse du restaurant", () => {
  const createdAt = new Date("2026-10-13T10:00:00.000Z");

  it("donne dix minutes pour répondre à une livraison transmise", () => {
    expect(echeanceDeReponse({
      createdAt, submittedAt: createdAt, deliveryType: "DELIVERY", pickupTime: null,
    }).toISOString()).toBe("2026-10-13T10:10:00.000Z");
  });

  it("tient compte de l'heure de transmission après paiement", () => {
    const submittedAt = new Date("2026-10-13T10:04:00.000Z");
    expect(echeanceDeReponse({
      createdAt, submittedAt, deliveryType: "DELIVERY", pickupTime: null,
    }).toISOString()).toBe("2026-10-13T10:14:00.000Z");
  });

  it("ne force pas une réponse trop tôt pour un retrait programmé", () => {
    expect(echeanceDeReponse({
      createdAt, submittedAt: createdAt, deliveryType: "PICKUP",
      pickupTime: new Date("2026-10-13T12:00:00.000Z"),
    }).toISOString()).toBe("2026-10-13T11:40:00.000Z");
  });
});
