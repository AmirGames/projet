/**
 * Tests de caractérisation de /api/client (vitrine publique et espace client).
 *
 * Ils figent le contrat actuel — statut HTTP, codes d'erreur, forme de la
 * réponse, requêtes Prisma envoyées — pour que l'extraction de la logique vers
 * des services (CLAUDE.md §5, « route mince ») reste sans effet pour la
 * vitrine, l'espace client et les applications mobiles. Seuls la base et les
 * services d'autres domaines sont simulés : le test ne dépend pas du fichier
 * qui porte chaque route.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const model = (...methods: string[]) => Object.fromEntries(methods.map((m) => [m, jest.fn()]));
const db: any = {
  store: model("findMany", "findUnique"),
  product: model("findMany"),
  review: model("groupBy", "aggregate"),
  customer: model("findUnique", "update"),
  order: model("count", "aggregate", "findMany", "findFirst"),
  orderDelivery: model("findUnique"),
  paymentMethod: model("findMany"),
  systemConfig: model("findFirst"),
  favoriteStore: model("findFirst", "create", "deleteMany"),
};

jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
jest.mock("../../auth/auth.middleware", () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "sans session" });
    req.userId = token;
    next();
  },
}));
jest.mock("../fiche-client.service", () => ({
  ficheClientDuCompte: jest.fn(async (id: string) => ({
    id: `client-${id}`, name: "Alice", email: "alice@test.fr", phone: "0612345678", address: "1 rue A", city: "Lyon",
    postalCode: "69000", status: "ACTIVE", createdAt: new Date("2026-01-01T00:00:00Z"), savedAddresses: [],
  })),
}));
jest.mock("../adresses-client.service", () => ({ adressesDuClient: jest.fn(async (c: any) => [{ id: "a", from: c.id }]) }));
jest.mock("../customer-account.service", () => ({
  CustomerAccountService: {
    apercu: jest.fn(async () => ({ commandesEnCours: 0 })),
    public: jest.fn((a: any) => ({ ...a, public: true })),
    supprimer: jest.fn(async () => ({ commandesEnCours: 0, supprime: true })),
    message: jest.fn(() => "Compte supprimé"),
  },
}));
jest.mock("../../reviews/review.service", () => ({
  avecLaVraieNote: jest.fn(async (stores: any[]) => stores.map((s) => ({ ...s, note: 4.5 }))),
}));
jest.mock("../../reviews/avis-client.service", () => ({
  avisARedemander: jest.fn(() => true),
  avisRestaurantParCommerce: jest.fn(async () => new Map()),
}));
jest.mock("../../catalog/tax.service", () => ({ TaxService: { prixAuClient: jest.fn(async (_id: string, p: any[]) => p) } }));
jest.mock("../../catalog/supplement.service", () => ({ SupplementService: { auClient: jest.fn(async () => new Map()) } }));
jest.mock("../../catalog/category.service", () => ({ trierProduitsSelonCategorie: jest.fn((produits: any[]) => produits) }));
jest.mock("../../delivery/delivery-zone.service", () => ({
  DeliveryZoneService: {
    verdict: jest.fn(async () => ({ livrable: true, frais: 3, minimum: 10, zone: { deliveryMinutes: 25 } })),
    getByStoreId: jest.fn(async () => [{ id: "z1", isActive: true }, { id: "z2", isActive: false }]),
  },
}));
jest.mock("../../delivery/store-hours.service", () => ({
  StoreHoursService: { isOpenNow: jest.fn(() => true), creneauxDeRetrait: jest.fn(async () => [{ debut: "12:00" }]) },
}));
jest.mock("../../delivery/delivery-mode.service", () => ({ fraisDeServiceEnVigueur: jest.fn(() => 0.99) }));
jest.mock("../../stores/store-type.service", () => ({ genreDuCommerce: jest.fn(() => ({ famille: "pizza" })) }));
jest.mock("../../orders/customer-cart.service", () => {
  const { z } = jest.requireActual("zod") as typeof import("zod");
  return {
    panierSchema: z.object({ lignes: z.array(z.object({ productId: z.string() })) }),
    CustomerCartService: {
      lister: jest.fn(async () => [{ storeId: "s1" }]),
      enregistrer: jest.fn(async (_c: any, storeId: string, recu: any) => ({ storeId, lignes: recu.lignes })),
    },
  };
});
jest.mock("../../drivers/driver-rating.service", () => ({
  COMMENTAIRE_MAX: 500, NOTE_MIN: 1, NOTE_MAX: 5,
  noterLivreur: jest.fn(async () => ({ note: { note: 5, commentaire: "Top", createdAt: new Date("2026-10-04T10:00:00Z") }, moyenne: 4.8, avis: 12 })),
}));

import clientVitrineRouter from "../client.routes";
import { DeliveryZoneService } from "../../delivery/delivery-zone.service";
import { StoreHoursService } from "../../delivery/store-hours.service";
import { CustomerAccountService } from "../customer-account.service";
import { CustomerCartService } from "../../orders/customer-cart.service";
import { noterLivreur } from "../../drivers/driver-rating.service";
import { errorHandler } from "../../../middleware/errorHandler";

const app = express();
app.use(express.json());
app.use("/api/client", clientVitrineRouter);
app.use(errorHandler);

const alice = (r: request.Test) => r.set("Authorization", "Bearer alice");

const boutique = (extra: any = {}) => ({
  id: "s1", name: "Chez Test", latitude: 45.7, longitude: 4.8, isOpen: true, operatingHours: null, deletedAt: null,
  org: { id: "o1", name: "Org", slug: "org", status: "ACTIVE", approvedAt: new Date("2026-01-01") }, products: [], ...extra,
});
const produit = (extra: any = {}) => ({
  id: "p1", name: "Margherita", price: 10, categoryId: "c1", category: { name: "Pizzas", displayOrder: 1, sortMode: null },
  variants: [], variantLabel: null, media: [], ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  for (const m of Object.values(db)) for (const f of Object.values(m as any)) (f as any).mockReset();
});

describe("vitrine publique", () => {
  it("GET /stores : filtre les commerces validés, hors démo, selon le pays", async () => {
    db.store.findMany.mockResolvedValue([boutique()]);
    const r = await request(app).get("/api/client/stores?pays=BE");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true, count: 1 });
    expect(r.body.data[0]).toMatchObject({ id: "s1", note: 4.5, isOpenNow: true, famille: "pizza" });
    expect(db.store.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { deletedAt: null, org: { status: "ACTIVE", approvedAt: { not: null }, isDemo: false }, OR: [{ countryCode: "be" }, { countryCode: null }] },
      orderBy: { name: "asc" },
    }));
  });
  it("GET /stores sans pays : pas de filtre de pays", async () => {
    db.store.findMany.mockResolvedValue([]);
    await request(app).get("/api/client/stores");
    expect((db.store.findMany.mock.calls[0][0] as any).where).toEqual({ deletedAt: null, org: { status: "ACTIVE", approvedAt: { not: null }, isDemo: false } });
  });
  it("GET /stores/nearby : coordonnées requises → 400", async () => {
    const r = await request(app).get("/api/client/stores/nearby");
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("INVALID_REQUEST");
    expect(db.store.findMany).not.toHaveBeenCalled();
  });
  it("GET /stores/nearby : distance, verdict de livraison et tri", async () => {
    db.store.findMany.mockResolvedValue([boutique({ id: "loin", latitude: 45.9, longitude: 4.8 }), boutique({ id: "proche", latitude: 45.71, longitude: 4.8 })]);
    const r = await request(app).get("/api/client/stores/nearby?latitude=45.7&longitude=4.8&maxDistance=30");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.map((s: any) => s.id)).toEqual(["proche", "loin"]);
    expect(r.body.data[0]).toMatchObject({
      isOpenNow: true, famille: "pizza", note: 4.5, estimatedDeliveryTime: expect.stringMatching(/ min$/),
      livraison: { livrable: true, frais: 3, minimum: 10, deliveryMinutes: 25 },
    });
    expect(DeliveryZoneService.verdict).toHaveBeenCalledWith("proche", { latitude: 45.7, longitude: 4.8 });
    expect((db.store.findMany.mock.calls[0][0] as any).where).toEqual({
      deletedAt: null, org: { status: "ACTIVE", approvedAt: { not: null } }, latitude: { not: null }, longitude: { not: null },
    });
  });
  it("GET /stores/search : q requis → 400, recherche insensible à la casse", async () => {
    expect((await request(app).get("/api/client/stores/search")).status).toBe(400);
    db.store.findMany.mockResolvedValue([boutique()]);
    const r = await request(app).get("/api/client/stores/search?q=PIZZA&city=Lyon&limit=5");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true, count: 1 });
    expect(db.store.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        deletedAt: null, org: { status: "ACTIVE", approvedAt: { not: null } },
        OR: [
          { name: { contains: "pizza", mode: "insensitive" } },
          { description: { contains: "pizza", mode: "insensitive" } },
          { city: { contains: "Lyon", mode: "insensitive" } },
        ],
      },
      take: 5,
    }));
  });
  it("GET /stores/search n'est pas lu comme /stores/:id", async () => {
    db.store.findMany.mockResolvedValue([]);
    await request(app).get("/api/client/stores/search?q=x");
    expect(db.store.findUnique).not.toHaveBeenCalled();
  });
  it("GET /stores/:id : introuvable → 404, fermée → 423", async () => {
    db.store.findUnique.mockResolvedValue(null);
    let r = await request(app).get("/api/client/stores/s1");
    expect(r.status).toBe(404);
    expect(r.body.code).toBe("NOT_FOUND");
    db.store.findUnique.mockResolvedValue(boutique({ org: { status: "SUSPENDED" } }));
    r = await request(app).get("/api/client/stores/s1");
    expect(r.status).toBe(423);
    expect(r.body.code).toBe("STORE_TEMPORARILY_CLOSED");
    db.store.findUnique.mockResolvedValue(boutique({ deletedAt: new Date() }));
    expect((await request(app).get("/api/client/stores/s1")).status).toBe(423);
  });
  it("GET /stores/:id : menu par catégorie, notes par plat et du commerce", async () => {
    db.store.findUnique.mockResolvedValue(boutique({
      products: [produit(), produit({ id: "p2", name: "Calzone", category: null, variants: [
        { id: "v2", label: "Grande", price: null, isAvailable: true, displayOrder: 2 },
        { id: "v1", label: "Petite", price: 8, isAvailable: true, displayOrder: 1 },
      ], variantLabel: "Taille" })],
    }));
    db.review.groupBy.mockResolvedValue([{ productId: "p1", _avg: { rating: 4.26 }, _count: { _all: 3 } }]);
    db.review.aggregate.mockResolvedValue({ _avg: { rating: 4.5 }, _count: { _all: 2 } });
    const r = await request(app).get("/api/client/stores/s1");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(Object.keys(r.body.data.menu)).toEqual(["Pizzas", "Autres"]);
    expect(r.body.data.menu.Pizzas[0]).toMatchObject({ id: "p1", note: { moyenne: 4.3, nombre: 3 }, variants: [], variantLabel: null, supplements: [] });
    expect(r.body.data.menu.Autres[0].variants).toEqual([
      { id: "v1", label: "Petite", price: 8, prixEffectif: 8, isAvailable: true },
      { id: "v2", label: "Grande", price: null, prixEffectif: 10, isAvailable: true },
    ]);
    expect(r.body.data).toMatchObject({ isOpenNow: true, enAttenteDeValidation: false, famille: "pizza", averageRating: "4.5", reviewCount: 2 });
    expect(db.review.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "s1", status: "APPROVED", productId: { not: null } } }));
  });
  it("GET /stores/:id : commerce non validé → lisible mais jamais ouvert", async () => {
    db.store.findUnique.mockResolvedValue(boutique({ org: { status: "ACTIVE", approvedAt: null } }));
    db.review.groupBy.mockResolvedValue([]);
    db.review.aggregate.mockResolvedValue({ _avg: { rating: null }, _count: { _all: 0 } });
    const r = await request(app).get("/api/client/stores/s1");
    expect(r.body.data).toMatchObject({ isOpenNow: false, enAttenteDeValidation: true, averageRating: 0, reviewCount: 0 });
  });
  it("GET /stores/:id/pickup-slots : jours bornés à 14", async () => {
    const r = await request(app).get("/api/client/stores/s1/pickup-slots?jours=30");
    expect(r.body).toEqual({ success: true, data: [{ debut: "12:00" }] });
    expect(StoreHoursService.creneauxDeRetrait).toHaveBeenCalledWith("s1", { jours: 14 });
    await request(app).get("/api/client/stores/s1/pickup-slots");
    expect(StoreHoursService.creneauxDeRetrait).toHaveBeenLastCalledWith("s1", { jours: 7 });
  });
  it("GET /stores/:id/zone-livraison", async () => {
    const r = await request(app).get("/api/client/stores/s1/zone-livraison?lat=45.7&lng=4.8&adresse=1%20rue%20A");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(DeliveryZoneService.verdict).toHaveBeenCalledWith("s1", { latitude: 45.7, longitude: 4.8, texte: "1 rue A" });
    await request(app).get("/api/client/stores/s1/zone-livraison");
    expect(DeliveryZoneService.verdict).toHaveBeenLastCalledWith("s1", { latitude: null, longitude: null, texte: null });
  });
  it("GET /stores/:id/zones : zones actives seulement", async () => {
    const r = await request(app).get("/api/client/stores/s1/zones");
    expect(r.body).toEqual({ success: true, data: [{ id: "z1", isActive: true }] });
  });
  it("GET /service-fee", async () => {
    db.systemConfig.findFirst.mockResolvedValue({ serviceFee: 1 });
    const r = await request(app).get("/api/client/service-fee");
    expect(r.body).toEqual({ success: true, data: { frais: 0.99 } });
    expect(db.systemConfig.findFirst).toHaveBeenCalledWith({ select: { serviceFee: true } });
  });
  it("GET /stores/:id/payment-methods : sans configuration (clés d'API)", async () => {
    db.paymentMethod.findMany.mockResolvedValue([{ id: "m1", type: "CARD", name: "Carte", isDefault: true }]);
    const r = await request(app).get("/api/client/stores/s1/payment-methods");
    expect(r.body).toEqual({ success: true, data: [{ id: "m1", type: "CARD", name: "Carte", isDefault: true }] });
    expect(db.paymentMethod.findMany).toHaveBeenCalledWith({
      where: { storeId: "s1", isActive: true },
      select: { id: true, type: true, name: true, isDefault: true },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
  });
  it("GET /stores/:id/menu", async () => {
    db.product.findMany.mockResolvedValue([produit()]);
    const r = await request(app).get("/api/client/stores/s1/menu");
    expect(r.status).toBe(200);
    expect(Object.keys(r.body.data)).toEqual(["Pizzas"]);
    expect(db.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { storeId: "s1", status: "ACTIVE", deletedAt: null, store: { deletedAt: null, org: { status: "ACTIVE" } } },
    }));
  });
});

describe("espace client : authentification", () => {
  const protegees: [string, string][] = [
    ["get", "/me/addresses"], ["put", "/me/addresses"], ["get", "/me/suppression"], ["post", "/me/suppression"], ["get", "/me"],
    ["put", "/me"], ["get", "/me/orders"], ["get", "/deliveries/o1"], ["post", "/deliveries/o1/rating"], ["get", "/me/favorites"],
    ["post", "/me/favorites"], ["delete", "/me/favorites/s1"], ["get", "/me/paniers"], ["put", "/me/paniers/s1"],
  ];
  it.each(protegees)("%s %s sans session → 401", async (method, path) => {
    const r = await (request(app) as any)[method](`/api/client${path}`).send({});
    expect(r.status).toBe(401);
  });
});

describe("espace client : compte", () => {
  it("GET /me/addresses : charge le carnet du client connecté", async () => {
    db.customer.findUnique.mockResolvedValue({ savedAddresses: [] });
    const r = await alice(request(app).get("/api/client/me/addresses"));
    expect(r.body).toEqual({ success: true, data: [{ id: "a", from: "client-alice" }] });
    expect(db.customer.findUnique).toHaveBeenCalledWith({ where: { id: "client-alice" }, select: { savedAddresses: true } });
  });
  it("PUT /me/addresses : écrit sur le client connecté, jamais sur un id fourni", async () => {
    const adresse = { id: "m", kind: "HOME", name: "", street: "Rue Neuve 2", city: "Namur", postalCode: "5000", latitude: 50.46, longitude: 4.86 };
    const r = await alice(request(app).put("/api/client/me/addresses").send({ addresses: [adresse], customerId: "client-bob" }));
    expect(r.status).toBe(200);
    expect(r.body.data[0]).toMatchObject({ street: "Rue Neuve 2", label: "Rue Neuve 2, Namur" });
    expect(db.customer.update).toHaveBeenCalledWith({ where: { id: "client-alice" }, data: { savedAddresses: [expect.objectContaining({ street: "Rue Neuve 2" })] } });
    expect((await alice(request(app).put("/api/client/me/addresses").send({ addresses: "x" }))).status).toBe(400);
  });
  it("GET et POST /me/suppression", async () => {
    let r = await alice(request(app).get("/api/client/me/suppression"));
    expect(r.body).toEqual({ success: true, data: { commandesEnCours: 0, public: true } });
    expect(CustomerAccountService.apercu).toHaveBeenCalledWith("alice");
    r = await alice(request(app).post("/api/client/me/suppression").send({ motif: "Je pars" }));
    expect(r.body).toEqual({ success: true, data: { commandesEnCours: 0, supprime: true, public: true }, message: "Compte supprimé" });
    expect(CustomerAccountService.supprimer).toHaveBeenCalledWith("alice", "Je pars");
    expect((await alice(request(app).post("/api/client/me/suppression").send({ motif: "x".repeat(501) }))).status).toBe(400);
  });
  it("GET /me : profil et totaux", async () => {
    db.order.count.mockResolvedValue(3);
    db.order.aggregate.mockResolvedValue({ _sum: { totalAmount: "42.5" } });
    const r = await alice(request(app).get("/api/client/me"));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      success: true,
      data: {
        id: "client-alice", name: "Alice", email: "alice@test.fr", phone: "0612345678", address: "1 rue A", city: "Lyon",
        postalCode: "69000", status: "ACTIVE", memberSince: "2026-01-01T00:00:00.000Z", totalOrders: 3, totalSpent: 42.5,
      },
    });
    expect(db.order.count).toHaveBeenCalledWith({ where: { customerId: "client-alice", deletedAt: null } });
  });
  it("PUT /me : met à jour sans toucher à l'e-mail", async () => {
    db.customer.update.mockResolvedValue({ name: "Alice B", email: "alice@test.fr", phone: "0612345678", address: "1 rue A", city: "Lyon", postalCode: "69000" });
    const r = await alice(request(app).put("/api/client/me").send({ name: "Alice B", email: "pirate@test.fr" }));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      message: "Profil mis à jour",
      data: { name: "Alice B", email: "alice@test.fr", phone: "0612345678", address: "1 rue A", city: "Lyon", postalCode: "69000" },
    });
    expect(db.customer.update).toHaveBeenCalledWith({ where: { id: "client-alice" }, data: { name: "Alice B" } });
    expect((await alice(request(app).put("/api/client/me").send({ name: "A" }))).status).toBe(400);
  });
});

describe("espace client : commandes et livraison", () => {
  it("GET /me/orders : les commandes du client seulement", async () => {
    db.order.findMany.mockResolvedValue([{
      id: "o1", status: "COMPLETED", paymentStatus: "PAID", deliveryType: "DELIVERY", deliveryAddress: "2 rue B", totalAmount: "20.5",
      createdAt: new Date("2026-10-01T10:00:00Z"), estimatedReadyAt: null, storeId: "s1", store: { id: "s1", name: "Chez Test", slug: "chez", city: "Lyon" },
      delivery: { status: "DELIVERED", deliveryTime: null },
      items: [{ productId: "p1", variantId: "v1", variant: { label: "Grande" }, product: { name: "Margherita" }, selectedOptions: { supplements: [{ id: "x", groupe: "g", label: "Fromage", price: 1 }] }, quantity: 2, price: "10", total: "20" }],
    }]);
    const r = await alice(request(app).get("/api/client/me/orders"));
    expect(r.status).toBe(200);
    expect(r.body.data[0]).toMatchObject({
      id: "o1", status: "COMPLETED", totalAmount: 20.5, deliveryStatus: "DELIVERED", avisARedemander: true,
      store: { id: "s1", name: "Chez Test", slug: "chez", city: "Lyon" },
      items: [{ productId: "p1", variantId: "v1", variantLabel: "Grande", supplements: [{ id: "x", groupe: "g", label: "Fromage", price: 1 }], name: "Margherita", quantity: 2, price: 10, total: 20 }],
    });
    expect(db.order.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { customerId: "client-alice", deletedAt: null }, take: 50, orderBy: { createdAt: "desc" } }));
  });
  it("GET /deliveries/:orderId : commande d'un autre → 404, sans course → data null", async () => {
    db.order.findFirst.mockResolvedValue(null);
    let r = await alice(request(app).get("/api/client/deliveries/o-bob"));
    expect(r.status).toBe(404);
    expect(r.body.code).toBe("ORDER_NOT_FOUND");
    expect(db.order.findFirst).toHaveBeenCalledWith({ where: { id: "o-bob", customerId: "client-alice", deletedAt: null }, select: { id: true } });
    expect(db.orderDelivery.findUnique).not.toHaveBeenCalled();
    db.order.findFirst.mockResolvedValue({ id: "o1" });
    db.orderDelivery.findUnique.mockResolvedValue(null);
    r = await alice(request(app).get("/api/client/deliveries/o1"));
    expect(r.body).toEqual({ success: true, data: null });
  });
  it("GET /deliveries/:orderId : suivi, code de remise et note", async () => {
    db.order.findFirst.mockResolvedValue({ id: "o1" });
    db.orderDelivery.findUnique.mockResolvedValue({
      id: "d1", orderId: "o1", status: "PICKED_UP", estimatedTime: 20, deliveryTime: null, pickupLat: 45.7, pickupLng: 4.8,
      deliveryLat: 45.72, deliveryLng: 4.82, driverLat: 45.71, driverLng: 4.81, driverLocationAt: new Date("2026-10-04T10:00:00Z"),
      driver: { name: "Léo", phone: "06", vehicleType: "bike", rating: 4.5, totalRatings: 2, gpsLostAt: null },
      order: { deliveryAddress: "2 rue B", store: { name: "Chez Test" } },
      rating: { note: 5, commentaire: "Top", createdAt: new Date("2026-10-04T11:00:00Z") },
      incidents: [], deliveryCode: "1234", proofType: null, proofAt: null, proofPhoto: null, proofNote: null,
      nearCustomerNotifiedAt: new Date(), customerWaitStartedAt: null, customerWaitLeftAt: null,
    });
    const r = await alice(request(app).get("/api/client/deliveries/o1"));
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data).toMatchObject({
      id: "d1", status: "PICKED_UP", boutique: "Chez Test", adresseLivraison: "2 rue B", gpsPerdu: false, codeRemise: "1234", preuve: null,
      photoDepot: null, livreurProche: true, attenteFinLe: null,
      driver: { name: "Léo", rating: 4.5, avis: 2 },
      maNote: { note: 5, commentaire: "Top", donneeLe: "2026-10-04T11:00:00.000Z" },
      retrait: { latitude: 45.7, longitude: 4.8 }, destination: { latitude: 45.72, longitude: 4.82 },
      position: { latitude: 45.71, longitude: 4.81, misAJourLe: "2026-10-04T10:00:00.000Z" },
    });
    expect(typeof r.body.data.distanceRestanteKm).toBe("number");
    expect(typeof r.body.data.distanceTotaleKm).toBe("number");
    expect(typeof r.body.data.maintenant).toBe("string");
  });
  it("GET /deliveries/:orderId : le code de remise se tait une fois livrée", async () => {
    db.order.findFirst.mockResolvedValue({ id: "o1" });
    db.orderDelivery.findUnique.mockResolvedValue({
      id: "d1", orderId: "o1", status: "DELIVERED", pickupLat: null, pickupLng: null, deliveryLat: null, deliveryLng: null, driverLat: null,
      driverLng: null, driver: { name: "Léo", phone: "06", vehicleType: "bike", rating: 5, totalRatings: 0, gpsLostAt: new Date() },
      order: null, rating: null, incidents: [], deliveryCode: "1234", proofType: null, nearCustomerNotifiedAt: null,
    });
    const r = await alice(request(app).get("/api/client/deliveries/o1"));
    expect(r.body.data).toMatchObject({ codeRemise: null, gpsPerdu: true, driver: { rating: null, avis: 0 }, maNote: null, position: null, destination: null, retrait: null, boutique: null });
  });
  it("POST /deliveries/:orderId/rating", async () => {
    let r = await alice(request(app).post("/api/client/deliveries/o1/rating").send({ note: 9 }));
    expect(r.status).toBe(400);
    expect(noterLivreur).not.toHaveBeenCalled();
    r = await alice(request(app).post("/api/client/deliveries/o1/rating").send({ note: 5, commentaire: "Top", customerId: "client-bob" }));
    expect(r.status).toBe(201);
    expect(r.body).toEqual({
      success: true, message: "Merci, votre note est enregistrée",
      data: { note: 5, commentaire: "Top", donneeLe: "2026-10-04T10:00:00.000Z", livreur: { moyenne: 4.8, avis: 12 } },
    });
    expect(noterLivreur).toHaveBeenCalledWith({ orderId: "o1", customerId: "client-alice", note: 5, commentaire: "Top" });
  });
});

describe("espace client : favoris et paniers", () => {
  it("GET /me/favorites", async () => {
    db.customer.findUnique.mockResolvedValue({ favorites: [{ id: "f1", store: boutique() }] });
    const r = await alice(request(app).get("/api/client/me/favorites"));
    expect(r.status).toBe(200);
    expect(r.body.data).toHaveLength(1);
    expect(r.body.data[0]).toMatchObject({ id: "f1", store: { id: "s1", note: 4.5, famille: "pizza" } });
    expect(db.customer.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "client-alice" } }));
  });
  it("GET /me/favorites : aucun favori", async () => {
    db.customer.findUnique.mockResolvedValue(null);
    const r = await alice(request(app).get("/api/client/me/favorites"));
    expect(r.body).toEqual({ success: true, data: [] });
  });
  it("POST /me/favorites : storeId requis → 400, doublon → 400, ajout → 201", async () => {
    let r = await alice(request(app).post("/api/client/me/favorites").send({}));
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("INVALID_REQUEST");
    db.favoriteStore.findFirst.mockResolvedValue({ id: "f" });
    r = await alice(request(app).post("/api/client/me/favorites").send({ storeId: "s1" }));
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("DUPLICATE");
    expect(db.favoriteStore.create).not.toHaveBeenCalled();
    db.favoriteStore.findFirst.mockResolvedValue(null);
    db.favoriteStore.create.mockResolvedValue({ id: "f2", storeId: "s1" });
    r = await alice(request(app).post("/api/client/me/favorites").send({ storeId: "s1", customerId: "client-bob" }));
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ success: true, message: "Ajouté aux favoris", data: { id: "f2", storeId: "s1" } });
    expect(db.favoriteStore.findFirst).toHaveBeenLastCalledWith({ where: { customerId: "client-alice", storeId: "s1" } });
    expect(db.favoriteStore.create).toHaveBeenCalledWith({
      data: { customerId: "client-alice", storeId: "s1" },
      include: { store: { include: { products: { where: { status: "ACTIVE" }, take: 3 } } } },
    });
  });
  it("DELETE /me/favorites/:storeId : borné au client connecté", async () => {
    const r = await alice(request(app).delete("/api/client/me/favorites/s1"));
    expect(r.body).toEqual({ success: true, message: "Supprimé des favoris" });
    expect(db.favoriteStore.deleteMany).toHaveBeenCalledWith({ where: { customerId: "client-alice", storeId: "s1" } });
  });
  it("GET et PUT /me/paniers", async () => {
    let r = await alice(request(app).get("/api/client/me/paniers"));
    expect(r.body).toEqual({ success: true, data: [{ storeId: "s1" }] });
    expect(CustomerCartService.lister).toHaveBeenCalledWith("client-alice");
    r = await alice(request(app).put("/api/client/me/paniers/s1").send({ lignes: [{ productId: "p1" }] }));
    expect(r.body).toEqual({ success: true, data: { storeId: "s1", lignes: [{ productId: "p1" }] } });
    expect((CustomerCartService.enregistrer as any).mock.calls[0]).toEqual([expect.objectContaining({ id: "client-alice" }), "s1", { lignes: [{ productId: "p1" }] }]);
    expect((await alice(request(app).put("/api/client/me/paniers/s1").send({ lignes: "x" }))).status).toBe(400);
  });
});
