import { describe, expect, it } from "@jest/globals";

import { payeEnLigne } from "../commande-transmise";

describe("payeEnLigne", () => {
  it("fait tout payer par Stripe, sauf les espèces", () => {
    for (const type of ["CREDIT_CARD", "DEBIT_CARD", "STRIPE", "PAYPAL", "BANK_TRANSFER", "APPLE_PAY", "GOOGLE_PAY"]) {
      expect(payeEnLigne(type, true)).toBe(true);
    }
    expect(payeEnLigne("CASH", true)).toBe(false);
  });

  it("fait payer en ligne une commande sans moyen de paiement choisi", () => {
    expect(payeEnLigne(undefined, true)).toBe(true);
    expect(payeEnLigne(null, true)).toBe(true);
  });

  it("ne retient rien quand Stripe n'est pas actif", () => {
    expect(payeEnLigne("CREDIT_CARD", false)).toBe(false);
    expect(payeEnLigne(undefined, false)).toBe(false);
  });
});
