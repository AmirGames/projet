import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const A = "cstorecharleroi00000000001", B = "cstorenamur00000000000002", C = "cstoreetranger00000000003";
const ORG = "corganisation000000000001", OTHER = "corganisation000000000002";
const PA = "cproductcharleroi00000001", PB = "cproductnamur000000000002", PC = "cproductetranger000000003";
const CA = "ccategorycharleroi0000001", CB = "ccategorynamur00000000002", CC = "ccategoryetranger00000003";
const SA = "cstaffcharleroi0000000001", SB = "cstaffnamur00000000000002", SC = "cstaffetranger00000000003";
let tables: Record<string, any[]>;
let memberships: any[];
const users = ["admin", "manager", "employee", "outsider", "client", "platform", "support", "revoked"];

function matches(value: any, where: any): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, filter]: [string, any]) => {
    if (filter === undefined) return true;
    if (key === "AND") return (Array.isArray(filter) ? filter : [filter]).every((f: any) => matches(value, f));
    if (key === "OR") return filter.some((f: any) => matches(value, f));
    if (key === "in") return filter.includes(value);
    if (key === "not") return !matches(value, filter === null ? { equals: null } : filter);
    if (key === "equals") return value === filter;
    if (key === "has") return value?.includes(filter);
    if (key === "contains") return String(value).toLowerCase().includes(String(filter).toLowerCase());
    if (key === "mode") return true;
    if (key === "some") return value.some((v: any) => matches(v, filter));
    if (filter === null || typeof filter !== "object") return value?.[key] === filter;
    return matches(value?.[key], filter);
  });
}

function related(model: string, record: any): any {
  if (!record) return null;
  if (model === "organization") return { ...record, memberships: memberships.filter(m => m.orgId === record.id) };
  if (model === "store") return { ...record, org: related("organization", tables.organization.find(o => o.id === record.orgId)) };
  if (model === "productVariant" || model === "productMedia") return { ...record, product: related("product", tables.product.find(p => p.id === record.productId)) };
  const result = { ...record, store: related("store", tables.store.find(s => s.id === record.storeId)) };
  if (model === "product") {
    result.category = tables.category.find(c => c.id === record.categoryId);
    result.images = [{ id: "image", url: "https://example.com/image.png", order: 0 }];
    result.media = [];
    result.variants = tables.productVariant.filter(v => v.productId === record.id);
  }
  if (model === "category") result.products = tables.product.filter(p => p.categoryId === record.id).map(p => related("product", p));
  return result;
}

function project(value: any, args: any): any {
  if (!value) return null;
  if (!args.select) return args.include ? { ...value } : { ...value };
  return Object.fromEntries(Object.entries(args.select).map(([key, selector]: [string, any]) => {
    let field = value[key];
    if (selector !== true && Array.isArray(field)) field = field.filter(v => matches(v, selector.where)).map(v => project(v, selector));
    else if (selector !== true && field) field = project(field, selector);
    return [key, field];
  }));
}

const db: any = { user: { findUnique: jest.fn() }, membership: { findMany: jest.fn() }, $transaction: jest.fn() };
for (const model of ["store", "organization", "staff", "product", "category", "productVariant", "productMedia"]) {
  db[model] = {};
  for (const method of ["findUnique", "findFirst", "findMany", "count", "update", "updateMany", "create", "delete"]) db[model][method] = jest.fn();
}
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../realtime/socket", () => ({ emitStoreEvent: jest.fn() }));
jest.mock("../auth.service", () => ({ AuthService: { verifyAccessToken: (token: string) => {
  if (!users.includes(token)) throw new Error("Jeton invalide");
  return { userId: token, sid: token };
} } }));
jest.mock("../sso.service", () => ({ SsoService: { sessionActive: async (sid: string) => sid !== "revoked" } }));

import { cloisonnement } from "../cloisonnement.middleware";
import { oublierCompte } from "../auth.middleware";
import staffRouter from "../../merchants/staff.routes";
import productRouter from "../../catalog/product.routes";
import categoryRouter from "../../catalog/category.routes";
import variantRouter from "../../catalog/variant.routes";
import mediaRouter from "../../catalog/product-media.routes";
import { ProductService } from "../../catalog/product.service";
import { CategoryService } from "../../catalog/category.service";
import { ProductMediaService } from "../../catalog/product-media.service";

function app(global: boolean) {
  const api = express();
  api.use(express.json());
  if (global) api.use(cloisonnement);
  api.use("/api/staff", staffRouter);
  api.use("/api/products", variantRouter, productRouter);
  api.use("/api/categories", categoryRouter);
  api.use("/api/product-media", mediaRouter);
  api.get("/api/reports/:storeId", (_req, res) => res.json({ success: true }));
  api.patch("/api/organizations/:orgId", (_req, res) => res.json({ success: true }));
  api.use((error: any, _req: any, res: any, _next: any) => res.status(error.statusCode || (error.name === "ZodError" ? 400 : 500)).json({ code: error.code }));
  return api;
}

beforeEach(() => {
  users.forEach(oublierCompte);
  memberships = [
    { userId: "admin", orgId: ORG, role: "ADMIN", storeIds: [] },
    { userId: "manager", orgId: ORG, role: "STORE_MANAGER", storeIds: [A] },
    { userId: "employee", orgId: ORG, role: "STORE_STAFF", storeIds: [A] },
    { userId: "outsider", orgId: OTHER, role: "ADMIN", storeIds: [C] },
  ];
  const product = (id: string, storeId: string, categoryId: string, status = "ACTIVE") => ({ id, storeId, categoryId, status, deletedAt: null, name: "Pizza", price: 12, stock: 15, lowStockThreshold: 2, sku: "SECRET", variantLabel: "Taille", displayOrder: 0, isAvailable: true });
  tables = {
    organization: [{ id: ORG, status: "ACTIVE", approvedAt: new Date() }, { id: OTHER, status: "ACTIVE", approvedAt: new Date() }],
    store: [{ id: A, orgId: ORG, deletedAt: null }, { id: B, orgId: ORG, deletedAt: null }, { id: C, orgId: OTHER, deletedAt: null }],
    staff: [{ id: SA, storeId: A, role: "CASHIER" }, { id: SB, storeId: B, role: "CASHIER" }, { id: SC, storeId: C, role: "CASHIER" }],
    category: [{ id: CA, storeId: A, name: "Pizzas", displayOrder: 0 }, { id: CB, storeId: B, name: "Pizzas", displayOrder: 0 }, { id: CC, storeId: C, name: "Pizzas", displayOrder: 0 }],
    product: [product(PA, A, CA), product(PB, B, CB), product(PC, C, CC), product("draft", A, CA, "DRAFT"), product("archived", A, CA, "ARCHIVED"), { ...product("deleted", A, CA), deletedAt: new Date() }],
    productVariant: [{ id: "va", productId: PA, label: "Grande", sku: "SECRET", combination: { secret: true }, stock: 42, price: 14, isAvailable: true, displayOrder: 0 }],
    productMedia: [{ id: "ma", productId: PA, displayOrder: 0 }, { id: "mb", productId: PB, displayOrder: 0 }],
  };
  db.user.findUnique.mockImplementation(async ({ where }: any) => ({ id: where.id, isSuperOwner: where.id === "platform", isSystemAdmin: where.id === "support", accesEquipe: [], passwordChangedAt: null }));
  db.membership.findMany.mockImplementation(async ({ where }: any) => memberships.filter(m => m.userId === where.userId));
  for (const model of Object.keys(tables)) {
    const find = (args: any) => tables[model].map(r => related(model, r)).filter(r => matches(r, args.where));
    db[model].findUnique.mockImplementation(async (args: any) => project(find(args)[0], args));
    db[model].findFirst.mockImplementation(async (args: any) => project(find(args)[0], args));
    db[model].findMany.mockImplementation(async (args: any) => find(args).map(r => project(r, args)));
    db[model].count.mockImplementation(async (args: any) => find(args).length);
    db[model].updateMany.mockImplementation(async (args: any) => {
      const ids = find(args).map(r => r.id);
      tables[model].filter(r => ids.includes(r.id)).forEach(r => Object.assign(r, args.data));
      return { count: ids.length };
    });
    db[model].update.mockImplementation(async (args: any) => {
      const existing = find(args)[0];
      if (!existing) throw Object.assign(new Error("Missing"), { code: "P2025" });
      const record = tables[model].find(r => r.id === existing.id);
      Object.assign(record, args.data);
      return record;
    });
    db[model].delete.mockImplementation(async (args: any) => {
      const existing = find(args)[0];
      if (!existing) throw Object.assign(new Error("Missing"), { code: "P2025" });
      tables[model] = tables[model].filter(r => r.id !== existing.id);
      return existing;
    });
    db[model].create.mockImplementation(async (args: any) => { tables[model].push(args.data); return args.data; });
  }
  db.$transaction.mockImplementation(async (fn: any) => {
    const snapshot = structuredClone(tables);
    try { return await fn(db); } catch (error) { tables = snapshot; throw error; }
  });
});

describe.each([true, false])("personnel : verrou global=%s", global => {
  it.each([SC, SB])("refuse lecture et modification de %s hors périmètre", async id => {
    const api = app(global);
    const read = await request(api).get(`/api/staff/${id}`).set("Authorization", "Bearer manager");
    const write = await request(api).put(`/api/staff/${id}`).set("Authorization", "Bearer manager").send({ role: "MANAGER", storeId: A });
    expect([403, 404]).toContain(read.status);
    expect([403, 404]).toContain(write.status);
    expect(tables.staff.find(s => s.id === id).role).toBe("CASHIER");
  });
  it.each(["patch", "delete"])("refuse %s sur un membre tiers", async method => {
    const r = method === "patch"
      ? await request(app(global)).patch(`/api/staff/${SC}/status`).set("Authorization", "Bearer manager").send({ status: "SUSPENDED" })
      : await request(app(global)).delete(`/api/staff/${SC}`).set("Authorization", "Bearer manager");
    expect([403, 404]).toContain(r.status);
    expect(tables.staff.find(s => s.id === SC)).toMatchObject({ role: "CASHIER" });
  });
  it("autorise le gérant dans sa boutique", async () => {
    const r = await request(app(global)).put(`/api/staff/${SA}`).set("Authorization", "Bearer manager").send({ role: "MANAGER" });
    expect(r.status).toBe(200);
    expect(tables.staff.find(s => s.id === SA).role).toBe("MANAGER");
  });
  it("autorise l'administrateur dans une autre boutique de son organisation", async () => {
    expect((await request(app(global)).get(`/api/staff/${SB}`).set("Authorization", "Bearer admin")).status).toBe(200);
  });
  it("réserve le personnel aux administrateurs et gérants", async () => {
    const r = await request(app(global)).put(`/api/staff/${SA}`).set("Authorization", "Bearer employee").send({ role: "MANAGER" });
    expect([403, 404]).toContain(r.status);
    expect(tables.staff.find(s => s.id === SA).role).toBe("CASHIER");
  });
  it("filtre la liste par organisation selon les boutiques autorisées", async () => {
    const r = await request(app(global)).get(`/api/staff?orgId=${ORG}`).set("Authorization", "Bearer manager");
    expect(r.status).toBe(200);
    expect(r.body.staff.map((s: any) => s.id)).toEqual([SA]);
  });
  it("refuse la création dans une boutique non autorisée", async () => {
    const r = await request(app(global)).post("/api/staff").set("Authorization", "Bearer manager").send({ storeId: B, name: "Employé", email: "test@example.com" });
    expect(r.status).toBe(403);
    expect(tables.staff).toHaveLength(3);
  });
});

describe("catalogue : autorisation locale", () => {
  it("un compte support sans appartenance ne contourne pas l'autorisation locale", async () => {
    const r = await request(app(false)).put(`/api/staff/${SA}`).set("Authorization", "Bearer support").send({ role: "MANAGER" });
    expect(r.status).toBe(404);
    expect(tables.staff.find(s => s.id === SA).role).toBe("CASHIER");
  });
  it("refuse la gestion des variantes par un employé", async () => {
    const r = await request(app(false)).put("/api/products/variants/va").set("Authorization", "Bearer employee").send({ label: "Intrusion" });
    expect(r.status).toBe(403);
    expect(tables.productVariant[0].label).toBe("Grande");
  });
  it("refuse la gestion des médias par un employé", async () => {
    const r = await request(app(false)).patch(`/api/product-media/${A}/${PA}/reorder`).set("Authorization", "Bearer employee").send({ mediaOrder: ["ma"] });
    expect(r.status).toBe(403);
    expect(db.productMedia.updateMany).not.toHaveBeenCalled();
  });
  it.each([PB, PC])("une boutique annoncée ne masque pas le propriétaire de %s", async id => {
    const r = await request(app(false)).put(`/api/products/${id}`).set("Authorization", "Bearer manager").send({ storeId: A, name: "Intrusion" });
    expect(r.status).toBe(403);
    expect(tables.product.find(p => p.id === id).name).toBe("Pizza");
  });
  it("refuse de rattacher un produit à une catégorie d'une autre boutique", async () => {
    const r = await request(app(false)).put(`/api/products/${PA}`).set("Authorization", "Bearer admin").send({ categoryId: CB });
    expect(r.status).toBe(400);
    expect(tables.product.find(p => p.id === PA).categoryId).toBe(CA);
  });
  it("un employé peut lire son catalogue mais ne peut pas le réordonner", async () => {
    const api = app(false);
    expect((await request(api).get(`/api/products?storeId=${A}`).set("Authorization", "Bearer employee")).status).toBe(200);
    expect((await request(api).post("/api/products/reorder").set("Authorization", "Bearer employee").send({ storeId: A, ordering: [{ id: PA, displayOrder: 9 }] })).status).toBe(403);
    expect(tables.product.find(p => p.id === PA).displayOrder).toBe(0);
  });
  it("filtre les produits et les totaux de l'organisation", async () => {
    const r = await request(app(true)).get(`/api/products?orgId=${ORG}`).set("Authorization", "Bearer manager");
    expect(r.status).toBe(200);
    expect(r.body.products.every((p: any) => p.storeId === A)).toBe(true);
    expect(r.body.pagination.total).toBe(3);
  });
  it("refuse un manager sans boutiques attribuées", async () => {
    memberships[1].storeIds = [];
    expect((await request(app(false)).get(`/api/products?storeId=${A}`).set("Authorization", "Bearer manager")).status).toBe(403);
  });
});

describe("réordonnancement : tout ou rien", () => {
  it.each([true, false])("refuse un lot de produits mixtes, verrou=%s", async global => {
    const r = await request(app(global)).post("/api/products/reorder").set("Authorization", "Bearer manager").send({ storeId: A, ordering: [{ id: PA, displayOrder: 9 }, { id: PC, displayOrder: 10 }] });
    expect(r.status).toBe(400);
    expect(tables.product.every(p => p.displayOrder === 0)).toBe(true);
    expect(db.product.updateMany).not.toHaveBeenCalled();
  });
  it("refuse les catégories étrangères avant la première écriture", async () => {
    await expect(CategoryService.reorder(A, [{ id: CA, displayOrder: 9 }, { id: CC, displayOrder: 10 }], { userId: "manager" })).rejects.toMatchObject({ statusCode: 400 });
    expect(db.category.updateMany).not.toHaveBeenCalled();
  });
  it("vérifie la catégorie annoncée et chaque produit du lot", async () => {
    const r = await request(app(false)).post("/api/products/reorder-by-category").set("Authorization", "Bearer manager").send({ categoryId: CB, ordering: [{ id: PB, displayOrder: 8 }] });
    expect(r.status).toBe(403);
    await expect(ProductService.reorderByCategory(CA, [{ id: PA, displayOrder: 9 }, { id: PB, displayOrder: 10 }], { userId: "admin" })).rejects.toMatchObject({ statusCode: 400 });
    expect(tables.product.every(p => p.displayOrder === 0)).toBe(true);
  });
  it("refuse les médias d'un autre produit", async () => {
    await expect(ProductMediaService.reorderMedia(A, PA, ["ma", "mb"], { userId: "manager" })).rejects.toMatchObject({ statusCode: 400 });
    expect(db.productMedia.updateMany).not.toHaveBeenCalled();
  });
  it.each([
    [{ id: PA, displayOrder: 1 }, { id: PA, displayOrder: 2 }],
    [{ id: PA, displayOrder: -1 }],
    [{ id: PA, displayOrder: 1.5 }],
    [{ id: "missing", displayOrder: 1 }],
    [null],
  ].map(ordering => ({ ordering })))("refuse un lot invalide %#", async ({ ordering }) => {
    const r = await request(app(false)).post("/api/products/reorder").set("Authorization", "Bearer manager").send({ storeId: A, ordering });
    expect(r.status).toBe(400);
    expect(db.product.updateMany).not.toHaveBeenCalled();
  });
  it("enregistre un lot autorisé", async () => {
    await ProductService.reorder(A, [{ id: PA, displayOrder: 4 }], { userId: "manager" });
    expect(tables.product.find(p => p.id === PA).displayOrder).toBe(4);
  });
  it("annule les premières écritures si une écriture du lot échoue", async () => {
    db.product.updateMany.mockImplementationOnce(async ({ where, data }: any) => {
      Object.assign(tables.product.find(p => p.id === where.id), data);
      return { count: 1 };
    }).mockImplementationOnce(async () => { throw new Error("Incident SQL"); });
    await expect(ProductService.reorder(A, [{ id: PA, displayOrder: 4 }, { id: "draft", displayOrder: 5 }], { userId: "manager" })).rejects.toThrow("Incident SQL");
    expect(tables.product.every(p => p.displayOrder === 0)).toBe(true);
  });
});

describe("catalogue public", () => {
  it.each([undefined, "client", "outsider", "employee"])("masque brouillons et champs internes à %s hors périmètre", async token => {
    const store = token === "employee" ? B : A;
    let r = request(app(true)).get(`/api/products/store/${store}`);
    if (token) r = r.set("Authorization", `Bearer ${token}`);
    const response = await r;
    expect(response.status).toBe(200);
    expect(response.body.products).toHaveLength(1);
    expect(response.body.pagination.total).toBe(1);
    expect(response.body.products[0]).not.toHaveProperty("stock");
    expect(response.body.products[0]).not.toHaveProperty("sku");
  });
  it.each(["draft", "archived", "deleted"])("répond 404 sur %s", async id => {
    expect((await request(app(true)).get(`/api/products/${id}`)).status).toBe(404);
  });
  it("filtre les produits imbriqués dans les catégories", async () => {
    const r = await request(app(true)).get(`/api/categories/${CA}`);
    expect(r.status).toBe(200);
    expect(r.body.products.map((p: any) => p.id)).toEqual([PA]);
    expect(r.body.products[0]).not.toHaveProperty("lowStockThreshold");
  });
  it("filtre recherche, catégorie et listes de catégories", async () => {
    const api = app(true);
    expect((await request(api).get(`/api/products/search/${A}?q=Pizza`)).body.results.map((p: any) => p.id)).toEqual([PA]);
    expect((await request(api).get(`/api/products/category/${CA}`)).body.products.map((p: any) => p.id)).toEqual([PA]);
    expect((await request(api).get(`/api/categories/store/${A}`)).body.categories[0].products.map((p: any) => p.id)).toEqual([PA]);
  });
  it("les variantes publiques ne contiennent ni stock, ni SKU, ni combinaison interne", async () => {
    const r = await request(app(true)).get(`/api/products/${PA}/variants`);
    expect(r.status).toBe(200);
    expect(r.body.data.variantes[0]).toMatchObject({ label: "Grande", prixEffectif: 14 });
    expect(r.body.data.variantes[0]).not.toHaveProperty("sku");
    expect(r.body.data.variantes[0]).not.toHaveProperty("stock");
    tables.productVariant.push({ ...tables.productVariant[0], id: "vd", productId: "draft" });
    expect((await request(app(true)).get("/api/products/draft/variants")).status).toBe(404);
  });
  it("conserve les brouillons pour le gérant autorisé", async () => {
    const r = await request(app(true)).get(`/api/products/store/${A}`).set("Authorization", "Bearer manager");
    expect(r.status).toBe(200);
    expect(r.body.products.map((p: any) => p.id)).toContain("draft");
    expect(r.body.products[0]).toHaveProperty("stock");
  });
  it("un jeton dont la session est révoquée ne donne pas la vue de gestion", async () => {
    memberships.push({ userId: "revoked", orgId: ORG, role: "ADMIN", storeIds: [] });
    const r = await request(app(true)).get(`/api/products/store/${A}`).set("Authorization", "Bearer revoked");
    expect(r.status).toBe(200);
    expect(r.body.products.map((p: any) => p.id)).toEqual([PA]);
  });
  it("masque les produits d'une organisation suspendue ou non approuvée", async () => {
    tables.organization[0].status = "SUSPENDED";
    expect((await request(app(true)).get(`/api/products/${PA}`)).status).toBe(404);
    tables.organization[0].status = "ACTIVE";
    tables.organization[0].approvedAt = null;
    expect((await request(app(true)).get(`/api/products/store/${A}`)).body.products).toEqual([]);
  });
});

describe("verrou global", () => {
  it("refuse les autres boutiques de l'organisation", async () => {
    expect((await request(app(true)).get(`/api/reports/${B}`).set("Authorization", "Bearer manager")).status).toBe(403);
    expect((await request(app(true)).get(`/api/reports/${A}`).set("Authorization", "Bearer manager")).status).toBe(200);
  });
  it("réserve les mutations d'organisation à ADMIN", async () => {
    expect((await request(app(true)).patch(`/api/organizations/${ORG}`).set("Authorization", "Bearer manager")).status).toBe(403);
    expect((await request(app(true)).patch(`/api/organizations/${ORG}`).set("Authorization", "Bearer admin")).status).toBe(200);
  });
  it("une erreur de résolution du propriétaire ferme l'accès", async () => {
    db.staff.findUnique.mockImplementationOnce(async () => { throw new Error("Incident SQL"); });
    expect((await request(app(true)).get(`/api/staff/${SA}`).set("Authorization", "Bearer manager")).status).toBe(403);
  });
  it("le retrait d'une boutique autorisée est appliqué dès la requête suivante", async () => {
    const api = app(true);
    expect((await request(api).get(`/api/staff/${SA}`).set("Authorization", "Bearer manager")).status).toBe(200);
    memberships[1].storeIds = [];
    expect((await request(api).get(`/api/staff/${SA}`).set("Authorization", "Bearer manager")).status).toBe(403);
  });
});
