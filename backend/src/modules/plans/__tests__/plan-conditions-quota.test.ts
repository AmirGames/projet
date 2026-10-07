import { beforeEach, describe, expect, it, jest } from "@jest/globals";

/**
 * Les formules et les conditions négociées : elles fixent la commission prélevée
 * sur chaque vente et le nombre de boutiques qu'un commerçant peut ouvrir.
 */

const db: any = {
  organization: { findUnique: jest.fn() },
  store: { count: jest.fn() },
};
jest.mock("../../../services/db", () => ({ db }));

import {
  PlanService,
  aDesConditionsNegociees,
  appliquerConditions,
  promoSansCommissionActive,
} from "../plan.service";

const formule = (surcharge: object = {}) =>
  ({
    code: "FREE",
    libelle: "Gratuite",
    prixMensuel: 0,
    commission: 8,
    commissionLivreursPlateforme: 12,
    maxBoutiques: 1,
    avantages: [],
    ordre: 1,
    ...surcharge,
  }) as any;

describe("promoSansCommissionActive", () => {
  const maintenant = new Date("2026-10-07T12:00:00Z");

  it("inactive sans drapeau, active sans date de fin, active jusqu'à sa date de fin", () => {
    expect(promoSansCommissionActive(null, maintenant)).toBe(false);
    expect(promoSansCommissionActive({ commissionFreeActive: false, commissionFreeUntil: null }, maintenant)).toBe(false);
    expect(promoSansCommissionActive({ commissionFreeActive: true, commissionFreeUntil: null }, maintenant)).toBe(true);
    expect(
      promoSansCommissionActive({ commissionFreeActive: true, commissionFreeUntil: new Date("2026-10-08T00:00:00Z") }, maintenant),
    ).toBe(true);
  });

  it("s'arrête d'elle-même à sa date de fin, sans que personne ne la retire", () => {
    expect(
      promoSansCommissionActive({ commissionFreeActive: true, commissionFreeUntil: new Date("2026-10-06T00:00:00Z") }, maintenant),
    ).toBe(false);
  });
});

describe("conditions négociées", () => {
  it("aucune condition : la formule de la grille s'applique telle quelle", () => {
    expect(aDesConditionsNegociees(null)).toBe(false);
    expect(aDesConditionsNegociees({ customCommissionPercent: null, customMaxStores: null })).toBe(false);
    const f = formule();
    expect(appliquerConditions(f, {})).toBe(f);
  });

  it("chaque condition remplace la valeur de la formule, les autres restent celles de la grille", () => {
    const res = appliquerConditions(formule(), { customCommissionPercent: 5, customMaxStores: 4 });
    expect(res).toMatchObject({ commission: 5, maxBoutiques: 4, prixMensuel: 0, code: "FREE" });
  });

  it("une commission de 0 % négociée est une condition (pas « vide »)", () => {
    expect(aDesConditionsNegociees({ customCommissionPercent: 0 })).toBe(true);
    expect(appliquerConditions(formule(), { customCommissionPercent: 0 }).commission).toBe(0);
  });

  it("le tarif livreurs de la plateforme n'est jamais sous la commission de base", () => {
    // Commission négociée à 15 %, tarif livreurs de la grille à 12 % : 15 % s'applique.
    expect(appliquerConditions(formule(), { customCommissionPercent: 15 }).commissionLivreursPlateforme).toBe(15);
    // Tarif livreurs négocié sous la commission : relevé à la commission.
    expect(
      appliquerConditions(formule(), { customCommissionPercent: 10, customPlatformDeliveryCommissionPercent: 6 })
        .commissionLivreursPlateforme,
    ).toBe(10);
    expect(
      appliquerConditions(formule(), { customPlatformDeliveryCommissionPercent: 20 }).commissionLivreursPlateforme,
    ).toBe(20);
  });
});

describe("quota de boutiques", () => {
  const grille = [formule(), formule({ code: "PRO", libelle: "Pro", maxBoutiques: 5, ordre: 2, commission: 5 })];

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(PlanService, "grille").mockResolvedValue(grille);
    jest.spyOn(PlanService, "formule").mockImplementation(async (code) => grille.find((f) => f.code === code) ?? grille[0]);
    db.organization.findUnique.mockResolvedValue({
      id: "org-1",
      tier: "FREE",
      commissionFreeActive: false,
      commissionFreeUntil: null,
      customMaxStores: null,
    });
  });

  it("compte les boutiques non supprimées et propose la formule suivante", async () => {
    db.store.count.mockResolvedValue(0);
    const quota = await PlanService.quotaBoutiques("org-1");
    expect(db.store.count).toHaveBeenCalledWith({ where: { orgId: "org-1", deletedAt: null } });
    expect(quota).toMatchObject({ used: 0, max: 1, remaining: 1, canCreate: true, nextTier: "PRO", nextTierMax: 5 });
  });

  it("au quota : création refusée, avec la marche à suivre (changer de formule)", async () => {
    db.store.count.mockResolvedValue(1);
    await expect(PlanService.verifierCreationBoutique("org-1")).rejects.toMatchObject({
      statusCode: 403,
      code: "STORE_QUOTA_REACHED",
      message: expect.stringContaining("Passez à la formule Pro"),
    });
  });

  it("au sommet de la grille : la suite passe par le support", async () => {
    db.organization.findUnique.mockResolvedValue({ id: "org-1", tier: "PRO", customMaxStores: null });
    db.store.count.mockResolvedValue(5);
    await expect(PlanService.verifierCreationBoutique("org-1")).rejects.toMatchObject({
      code: "STORE_QUOTA_REACHED",
      message: expect.stringContaining("support"),
    });
  });

  it("un quota négocié prime sur la grille", async () => {
    db.organization.findUnique.mockResolvedValue({ id: "org-1", tier: "FREE", customMaxStores: 3 });
    db.store.count.mockResolvedValue(2);
    const quota = await PlanService.verifierCreationBoutique("org-1");
    expect(quota).toMatchObject({ max: 3, remaining: 1, canCreate: true, customTerms: true });
  });

  it("organisation inconnue : 404", async () => {
    db.organization.findUnique.mockResolvedValue(null);
    await expect(PlanService.quotaBoutiques("inconnue")).rejects.toMatchObject({ statusCode: 404 });
  });
});
