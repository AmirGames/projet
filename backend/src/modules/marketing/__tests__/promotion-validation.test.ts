import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

/**
 * Les conditions d'un code promo, vérifiées côté serveur : un client ne choisit
 * ni l'heure, ni le jour, ni l'état du code.
 */

const db: any = { promotion: { findFirst: jest.fn() } };
jest.mock("../../../services/db", () => ({ db }));

import { PromotionService } from "../promotion.service";

const promo = (surcharge: object = {}) => ({
  id: "p1",
  storeId: "s1",
  code: "BIENVENUE",
  status: "ACTIVE",
  type: "PERCENTAGE",
  discountValue: 10,
  startDate: null,
  endDate: null,
  maxUses: null,
  currentUses: 0,
  activeFromTime: null,
  activeToTime: null,
  activeDays: [] as number[],
  applicableToAll: true,
  productIds: [] as string[],
  categoryIds: [] as string[],
  ...surcharge,
});

/** Un instant à l'heure locale du serveur (les plages horaires se lisent en heure locale). */
const a = (annee: number, mois: number, jour: number, h = 12, min = 0) => new Date(annee, mois - 1, jour, h, min, 0);

const valider = (surcharge: object = {}, total = 50, produits: string[] = ["pizza"], lignes?: any[]) => {
  db.promotion.findFirst.mockResolvedValue(promo(surcharge));
  return PromotionService.validateAndApply("s1", "bienvenue", total, produits, lignes);
};

describe("conditions d'un code promo", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(a(2026, 10, 7, 13, 0)); // mercredi 13 h
  });
  afterEach(() => { jest.useRealTimers(); });

  it("le code est cherché en majuscules, pour la boutique demandée", async () => {
    await valider();
    expect(db.promotion.findFirst).toHaveBeenCalledWith({ where: { storeId: "s1", code: "BIENVENUE" } });
  });

  it("code inconnu : 404", async () => {
    db.promotion.findFirst.mockResolvedValue(null);
    await expect(PromotionService.validateAndApply("s1", "x", 10)).rejects.toMatchObject({ code: "INVALID_CODE" });
  });

  it("refuse un code inactif, pas encore valable, expiré ou épuisé", async () => {
    await expect(valider({ status: "INACTIVE" })).rejects.toMatchObject({ code: "INACTIVE_CODE" });
    await expect(valider({ startDate: a(2026, 10, 8) })).rejects.toMatchObject({ code: "FUTURE_CODE" });
    await expect(valider({ endDate: a(2026, 10, 6) })).rejects.toMatchObject({ code: "EXPIRED_CODE" });
    await expect(valider({ maxUses: 5, currentUses: 5 })).rejects.toMatchObject({ code: "MAX_USES_REACHED" });
    await expect(valider({ maxUses: 5, currentUses: 4 })).resolves.toBeDefined();
  });

  it("plage horaire dans la journée : 12 h – 14 h", async () => {
    await expect(valider({ activeFromTime: "12:00", activeToTime: "14:00" })).resolves.toBeDefined(); // 13 h
    jest.setSystemTime(a(2026, 10, 7, 15, 0));
    await expect(valider({ activeFromTime: "12:00", activeToTime: "14:00" })).rejects.toMatchObject({ code: "OUTSIDE_TIME_WINDOW" });
    jest.setSystemTime(a(2026, 10, 7, 14, 0)); // la fin est exclue
    await expect(valider({ activeFromTime: "12:00", activeToTime: "14:00" })).rejects.toMatchObject({ code: "OUTSIDE_TIME_WINDOW" });
  });

  it("plage horaire qui passe minuit : 22 h – 2 h", async () => {
    const nuit = { activeFromTime: "22:00", activeToTime: "02:00" };
    jest.setSystemTime(a(2026, 10, 7, 23, 30));
    await expect(valider(nuit)).resolves.toBeDefined();
    jest.setSystemTime(a(2026, 10, 8, 1, 0));
    await expect(valider(nuit)).resolves.toBeDefined();
    jest.setSystemTime(a(2026, 10, 7, 12, 0));
    await expect(valider(nuit)).rejects.toMatchObject({ code: "OUTSIDE_TIME_WINDOW" });
  });

  it("jours de la semaine : mercredi = 3", async () => {
    await expect(valider({ activeDays: [3] })).resolves.toBeDefined();
    await expect(valider({ activeDays: [1, 5] })).rejects.toMatchObject({ code: "OUTSIDE_DAY_WINDOW" });
    await expect(valider({ activeDays: [] })).resolves.toBeDefined();
  });

  it("pourcentage et montant fixe, jamais plus que le total", async () => {
    expect((await valider({ type: "PERCENTAGE", discountValue: 10 }, 50)).discountAmount).toBe(5);
    expect((await valider({ type: "FIXED", discountValue: 8 }, 50)).discountAmount).toBe(8);
    const trop = await valider({ type: "FIXED", discountValue: 80 }, 50);
    expect(trop.discountAmount).toBe(50);
    expect(trop.finalTotal).toBe(0);
  });

  it("code limité à certains produits : refusé si le panier n'en contient aucun", async () => {
    const limitee = { applicableToAll: false, productIds: ["pizza"] };
    await expect(valider(limitee, 50, ["pizza", "boisson"])).resolves.toBeDefined();
    await expect(valider(limitee, 50, ["boisson"])).rejects.toMatchObject({ code: "NOT_APPLICABLE" });
  });

  it("avec les lignes du panier, la remise ne porte que sur les lignes éligibles", async () => {
    const lignes = [
      { productId: "pizza", price: 10, quantity: 1 },
      { productId: "boisson", price: 90, quantity: 1 },
    ];
    const res = await valider({ applicableToAll: false, productIds: ["pizza"], discountValue: 20 }, 100, ["pizza", "boisson"], lignes);
    expect(res.discountAmount).toBe(2); // 20 % de 10 €, pas de 100 €
    expect(res.finalTotal).toBe(98);
  });
});
