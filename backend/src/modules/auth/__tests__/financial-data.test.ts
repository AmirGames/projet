import { describe, expect, it } from "@jest/globals";
import { filtrerDonneesFinancieres } from "../financial-data";

describe("réponses support sans Facturation", () => {
  it("retire revenus, coordonnées bancaires, prix et pièces bancaires imbriqués", () => {
    const corps = {
      name: "Boutique", revenue: 100, customTerms: { commission: 5 },
      driver: { id: "driver", totalEarnings: 150, totalDeliveries: 20 },
      stores: [{ name: "Commerce", iban: "BE12345678901234", accountHolder: "Titulaire", stats: { totalRevenue: 50, ordersCount: 2 } }],
      documents: [{ type: "bank", documentUrl: "https://secret" }, { type: "identity", documentUrl: "https://identity" }],
    };
    expect(filtrerDonneesFinancieres(corps)).toEqual({
      name: "Boutique", driver: { id: "driver", totalDeliveries: 20 },
      stores: [{ name: "Commerce", stats: { ordersCount: 2 } }],
      documents: [{ type: "identity", documentUrl: "https://identity" }],
    });
    expect(corps.documents).toHaveLength(2);
  });
});
