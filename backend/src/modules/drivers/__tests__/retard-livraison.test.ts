import { describe, expect, it } from "@jest/globals";

import { retardPourLeClient } from "../retard-livraison";

const attribution = new Date("2026-10-01T12:00:00Z");
const constat = new Date("2026-10-01T12:40:00Z");
const incident = (type: string, driverId = "l1", assignedAt = attribution) => ({
  type,
  driverId,
  assignedAt,
  createdAt: constat,
});

describe("retardPourLeClient", () => {
  it("ne dit rien d'une course sans constat", () => {
    expect(retardPourLeClient({ status: "PICKED_UP", driverId: "l1", assignedAt: attribution, incidents: [] })).toBeNull();
  });

  it("signale une livraison en retard ou hors trajet du livreur actuel", () => {
    for (const type of ["RETARD_LIVRAISON", "ECART_LIVRAISON"]) {
      expect(
        retardPourLeClient({ status: "PICKED_UP", driverId: "l1", assignedAt: attribution, incidents: [incident(type)] })
      ).toEqual({ motif: "LIVRAISON", depuis: constat });
    }
  });

  it("ignore un constat d'une attribution passée", () => {
    const autre = incident("RETARD_LIVRAISON", "l0", new Date("2026-10-01T11:00:00Z"));
    expect(
      retardPourLeClient({ status: "PICKED_UP", driverId: "l1", assignedAt: attribution, incidents: [autre] })
    ).toBeNull();
  });

  it("annonce un nouveau livreur tant que la commande n'est pas repartie", () => {
    const retiree = incident("COURSE_RETIREE", "l0");
    for (const status of ["PENDING", "ACCEPTED"]) {
      expect(retardPourLeClient({ status, driverId: null, assignedAt: null, incidents: [retiree] })).toEqual({
        motif: "NOUVEAU_LIVREUR",
        depuis: constat,
      });
    }
    // Récupérée par le nouveau livreur, à l'heure : plus rien à signaler.
    expect(
      retardPourLeClient({ status: "PICKED_UP", driverId: "l1", assignedAt: attribution, incidents: [retiree] })
    ).toBeNull();
  });

  it("ne dit plus rien une fois la course terminée", () => {
    for (const status of ["DELIVERED", "FAILED"]) {
      expect(
        retardPourLeClient({ status, driverId: "l1", assignedAt: attribution, incidents: [incident("RETARD_LIVRAISON")] })
      ).toBeNull();
    }
  });
});
