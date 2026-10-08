import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

jest.mock("../../../services/db", () => ({ db: jest.requireActual<typeof import("../../../test-support/base-locataires")>("../../../test-support/base-locataires").db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../auth/security-event.service", () => ({ SecurityEventService: { record: jest.fn() } }));
// Seule la cryptographie du jeton est simulée : le jeton est le nom de l'utilisateur.
jest.mock("../../auth/auth.service", () => ({ AuthService: { verifyAccessToken: (jeton: string) => jest.requireActual<typeof import("../../../test-support/base-locataires")>("../../../test-support/base-locataires").verifierJetonFactice(jeton) } }));
jest.mock("../../auth/sso.service", () => ({ SsoService: { sessionActive: async () => true } }));
jest.mock("../../realtime/socket", () => ({ emitStoreEvent: jest.fn(), emitNotification: jest.fn() }));

import productRouter from "../product.routes";
import variantRouter from "../variant.routes";
import categoryRouter from "../category.routes";
import productMediaRouter from "../product-media.routes";
import productSeoRouter from "../product-seo.routes";
import productTagRouter from "../product-tag.routes";
import taxRouter from "../tax.routes";
import { cloisonnement } from "../../auth/cloisonnement.middleware";
import { errorHandler } from "../../../middleware/errorHandler";
import { ID, ecritures, reinitialiser } from "../../../test-support/base-locataires";

/** L'application telle que montée : verrou global puis routeurs (ordre de app.ts). */
function application(avecVerrouGlobal: boolean) {
  const app = express();
  app.use(express.json());
  if (avecVerrouGlobal) app.use(cloisonnement);
  app.use("/api/products", variantRouter);
  app.use("/api/products", productRouter);
  app.use("/api/categories", categoryRouter);
  app.use("/api/product-media", productMediaRouter);
  app.use("/api/product-seo", productSeoRouter);
  app.use("/api/product-tags", productTagRouter);
  app.use("/api/tax-settings", taxRouter);
  app.use(errorHandler);
  return app;
}
const AVEC_VERROU = application(true);
const SANS_VERROU = application(false);

const appeler = (app: express.Express, methode: string, chemin: string, corps?: unknown, qui?: string) => {
  const appel = (request(app) as any)[methode](chemin);
  if (qui) appel.set("Authorization", `Bearer ${qui}`);
  return corps === undefined ? appel : appel.send(corps);
};

type Operation = [string, string, unknown];

/** Les écritures et lectures de gestion sur les ressources de la boutique A1 (organisation A). */
const SUR_A1: Operation[] = [
  ["post", "/api/categories", { storeId: ID.storeA1, name: "Intrus" }],
  ["put", `/api/categories/${ID.catA1}`, { name: "Piraté" }],
  ["delete", `/api/categories/${ID.catA1}`, undefined],
  ["post", "/api/categories/reorder", { storeId: ID.storeA1, ids: [ID.catA1] }],
  ["get", `/api/categories?storeId=${ID.storeA1}`, undefined],
  ["post", "/api/products", { storeId: ID.storeA1, name: "Intrus", price: 5 }],
  ["put", `/api/products/${ID.prodA1}`, { name: "Piraté" }],
  ["delete", `/api/products/${ID.prodA1}`, undefined],
  ["patch", `/api/products/${ID.prodA1}/availability`, { isAvailable: false }],
  ["patch", `/api/products/${ID.prodA1}/stock`, { stock: 0 }],
  ["patch", `/api/products/${ID.prodA1}/low-stock-threshold`, { threshold: 1 }],
  ["post", "/api/products/reorder", { storeId: ID.storeA1, ids: [ID.prodA1] }],
  ["get", `/api/products?storeId=${ID.storeA1}`, undefined],
  ["get", `/api/products/low-stock/by-store/${ID.storeA1}`, undefined],
  ["get", `/api/products/low-stock/by-org/${ID.orgA}`, undefined],
  ["post", `/api/products/${ID.prodA1}/variants`, { label: "Grande", price: 9 }],
  ["put", `/api/products/variants/${ID.varA1}`, { label: "Piratée" }],
  ["patch", `/api/products/variants/${ID.varA1}/availability`, { isAvailable: false }],
  ["delete", `/api/products/variants/${ID.varA1}`, undefined],
  ["put", `/api/products/${ID.prodA1}/supplements`, { supplements: [] }],
  ["get", `/api/product-media/${ID.storeA1}/${ID.prodA1}`, undefined],
  ["post", `/api/product-media/${ID.storeA1}/${ID.prodA1}`, { url: "https://exemple.test/a.png" }],
  ["delete", `/api/product-media/${ID.storeA1}/media-a1`, undefined],
  ["patch", `/api/product-seo/${ID.storeA1}/${ID.prodA1}`, { metaTitle: "Piraté" }],
  ["get", `/api/product-tags/${ID.storeA1}`, undefined],
  ["post", `/api/product-tags/${ID.storeA1}`, { name: "Intrus" }],
  ["delete", `/api/product-tags/${ID.storeA1}/${ID.tagA1}`, undefined],
  ["post", `/api/product-tags/${ID.storeA1}/${ID.tagA1}/products/${ID.prodA1}`, {}],
  ["get", `/api/tax-settings/${ID.storeA1}`, undefined],
  ["post", `/api/tax-settings/${ID.storeA1}`, { name: "TVA", rate: 6 }],
  ["delete", `/api/tax-settings/${ID.storeA1}/taxe-a1`, undefined],
];

/** Idem pour la boutique A2, que ni Dave (gérant de A1) ni Carol ne voient. */
const SUR_A2: Operation[] = [
  ["post", "/api/categories", { storeId: ID.storeA2, name: "Intrus" }],
  ["put", `/api/categories/${ID.catA2}`, { name: "Piraté" }],
  ["delete", `/api/categories/${ID.catA2}`, undefined],
  ["post", "/api/products", { storeId: ID.storeA2, name: "Intrus", price: 5 }],
  ["put", `/api/products/${ID.prodA2}`, { name: "Piraté" }],
  ["delete", `/api/products/${ID.prodA2}`, undefined],
  ["patch", `/api/products/${ID.prodA2}/stock`, { stock: 0 }],
  ["get", `/api/products?storeId=${ID.storeA2}`, undefined],
  ["post", `/api/products/${ID.prodA2}/variants`, { label: "Grande", price: 9 }],
  ["post", `/api/product-tags/${ID.storeA2}`, { name: "Intrus" }],
  ["post", `/api/tax-settings/${ID.storeA2}`, { name: "TVA", rate: 6 }],
];

const REFUS = [403, 404];
const CODES_DE_REFUS = ["STORE_ACCESS_DENIED", "CROSS_TENANT_DENIED", "FORBIDDEN", "INVALID_CATEGORY"];
/** Un refus doit venir d'une garde (403 ou 400 explicite), pas d'une route inexistante. */
const refusParUneGarde = (r: { status: number; body: any }) => {
  expect(CODES_DE_REFUS).toContain(r.body?.code);
};

beforeEach(() => reinitialiser());

describe.each([["avec le verrou global", AVEC_VERROU], ["routeur monté seul (garde locale)", SANS_VERROU]])(
  "catalogue — Chacun chez soi, %s",
  (_nom, app) => {
    it.each(SUR_A1)("anonyme : %s %s → 401", async (methode, chemin, corps) => {
      const r = await appeler(app, methode, chemin, corps);
      expect(r.status).toBe(401);
      expect(ecritures).toEqual([]);
    });

    it.each(SUR_A1)("Bob (autre organisation) : %s %s → refusé, aucune écriture", async (methode, chemin, corps) => {
      const r = await appeler(app, methode, chemin, corps, "bob");
      expect(REFUS).toContain(r.status);
      refusParUneGarde(r);
      expect(ecritures).toEqual([]);
    });

    it.each(SUR_A1)("Erin (aucune organisation) : %s %s → refusé, aucune écriture", async (methode, chemin, corps) => {
      const r = await appeler(app, methode, chemin, corps, "erin");
      expect(REFUS).toContain(r.status);
      refusParUneGarde(r);
      expect(ecritures).toEqual([]);
    });

    it.each(SUR_A2)("Dave (gérant de A1 seulement) : %s %s sur A2 → refusé, aucune écriture", async (methode, chemin, corps) => {
      const r = await appeler(app, methode, chemin, corps, "dave");
      expect(REFUS).toContain(r.status);
      refusParUneGarde(r);
      expect(ecritures).toEqual([]);
    });

    it.each(SUR_A1.filter(([methode]) => methode !== "get"))("Carol (employée) : %s %s → ne modifie pas le catalogue", async (methode, chemin, corps) => {
      const r = await appeler(app, methode, chemin, corps, "carol");
      expect(REFUS).toContain(r.status);
      refusParUneGarde(r);
      expect(ecritures).toEqual([]);
    });

    it("Bob ne rattache pas son produit à la catégorie d'une autre organisation", async () => {
      const r = await appeler(app, "post", "/api/products", { storeId: ID.storeB1, name: "Détourné", price: 5, categoryId: ID.catA1 }, "bob");
      expect([400, 403, 404]).toContain(r.status);
      refusParUneGarde(r);
      expect(ecritures).toEqual([]);
    });

    it("Bob ne déplace pas son produit dans une catégorie voisine par PUT", async () => {
      const r = await appeler(app, "put", `/api/products/${ID.prodB1}`, { categoryId: ID.catA1 }, "bob");
      expect([400, 403, 404]).toContain(r.status);
      refusParUneGarde(r);
      expect(ecritures).toEqual([]);
    });

    it("l'identifiant de la ressource prime sur la boutique annoncée : Bob ne se déclare pas propriétaire", async () => {
      const r = await appeler(app, "put", `/api/products/${ID.prodA1}`, { storeId: ID.storeB1, name: "Piraté" }, "bob");
      expect(REFUS).toContain(r.status);
      refusParUneGarde(r);
      expect(ecritures).toEqual([]);
    });

    it("un identifiant de produit inconnu est un 404, sans écriture", async () => {
      const r = await appeler(app, "delete", "/api/products/produitinconnu0000000000", undefined, "alice");
      expect(REFUS).toContain(r.status);
      expect(ecritures).toEqual([]);
    });
  }
);

describe("catalogue — le propriétaire reste servi (le refus ne vient pas d'un blocage général)", () => {
  it.each([["avec verrou", AVEC_VERROU], ["sans verrou", SANS_VERROU]])("Alice modifie sa catégorie et son produit : %s", async (_nom, app) => {
    const categorie = await appeler(app, "put", `/api/categories/${ID.catA1}`, { name: "Entrées chaudes" }, "alice");
    expect(categorie.status).toBeLessThan(300);
    const produit = await appeler(app, "put", `/api/products/${ID.prodA1}`, { name: "Salade grecque" }, "alice");
    expect(produit.status).toBeLessThan(300);
    expect(ecritures).toEqual(expect.arrayContaining(["category.update", "product.update"]));
  });

  it("Dave, gérant de A1, gère sa boutique", async () => {
    const r = await appeler(AVEC_VERROU, "put", `/api/products/${ID.prodA1}`, { name: "Salade grecque" }, "dave");
    expect(r.status).toBeLessThan(300);
    expect(ecritures).toContain("product.update");
  });

  it("Carol, employée de A1, lit le catalogue de sa boutique", async () => {
    const r = await appeler(AVEC_VERROU, "get", `/api/categories?storeId=${ID.storeA1}`, undefined, "carol");
    expect(r.status).toBe(200);
  });
});
