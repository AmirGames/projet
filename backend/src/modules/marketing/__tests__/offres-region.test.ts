jest.mock("../../../services/db", () => ({
  db: {
    store: { findMany: jest.fn() },
    order: { groupBy: jest.fn() },
    promotion: { findMany: jest.fn() },
    customer: { findUnique: jest.fn(), update: jest.fn() },
  },
}));

import { db } from "../../../services/db";
import {
  SEUIL_ACHETEURS,
  agregerTendances,
  promotionsDeLaRegion,
  tendancesDeLaRegion,
  viderLeCacheDesTendances,
} from "../offres-region.service";
import { CUISINES_SENSIBLES, cuisinesPreferees, recommandationsPourLeClient } from "../recommandations.service";

const mock = db as unknown as {
  store: { findMany: jest.Mock };
  order: { groupBy: jest.Mock };
  promotion: { findMany: jest.Mock };
  customer: { findUnique: jest.Mock };
};

beforeEach(() => {
  jest.clearAllMocks();
  viderLeCacheDesTendances();
});

const acheteurs = (n: number, storeId: string) =>
  Array.from({ length: n }, (_, i) => ({ storeId, acheteur: `c${storeId}-${i}`, commandes: 2 }));

describe("agregerTendances : seuil d'anonymat", () => {
  const cuisines = new Map<string, string | null>([["s1", "tacos"], ["s2", "tacos"], ["s3", "pizza"], ["s4", null]]);

  test("une cuisine sous le seuil n'est pas publiée", () => {
    const res = agregerTendances([...acheteurs(SEUIL_ACHETEURS - 1, "s3")], cuisines);
    expect(res).toEqual([]);
  });

  test("les acheteurs de plusieurs boutiques de même cuisine s'additionnent, sans doublon", () => {
    const achats = [...acheteurs(6, "s1"), ...acheteurs(6, "s2")];
    // Le même acheteur chez deux boutiques ne compte qu'une fois.
    achats.push({ storeId: "s2", acheteur: "cs1-0", commandes: 1 });
    const [tacos] = agregerTendances(achats, cuisines);
    expect(tacos).toMatchObject({ cuisineType: "tacos", acheteurs: 12, boutiques: 2, commandes: 25 });
  });

  test("une boutique sans cuisine est ignorée, et le classement suit le nombre de commandes", () => {
    const res = agregerTendances(
      [...acheteurs(10, "s4"), ...acheteurs(10, "s3"), ...acheteurs(12, "s1")],
      cuisines,
    );
    expect(res.map((t) => t.cuisineType)).toEqual(["tacos", "pizza"]);
  });
});

describe("tendancesDeLaRegion", () => {
  test("agrège les commandes terminées de la région et met le résultat en cache", async () => {
    mock.store.findMany.mockResolvedValue([{ id: "s1", cuisineType: "tacos" }]);
    mock.order.groupBy.mockResolvedValue(
      Array.from({ length: SEUIL_ACHETEURS }, (_, i) => ({
        storeId: "s1",
        customerId: null,
        customerEmail: `invite${i}@exemple.test`,
        _count: { _all: 1 },
      })),
    );

    const premier = await tendancesDeLaRegion("be");
    const second = await tendancesDeLaRegion("be");

    expect(premier[0]).toMatchObject({ cuisineType: "tacos", acheteurs: SEUIL_ACHETEURS });
    expect(second).toBe(premier);
    expect(mock.order.groupBy).toHaveBeenCalledTimes(1);
    expect(mock.order.groupBy.mock.calls[0][0].where).toMatchObject({ status: "COMPLETED", storeId: { in: ["s1"] } });
    // Le résultat public ne contient aucun identifiant ni e-mail d'acheteur.
    expect(JSON.stringify(premier)).not.toContain("exemple.test");
  });

  test("aucune boutique dans la région : liste vide, sans requête sur les commandes", async () => {
    mock.store.findMany.mockResolvedValue([]);
    expect(await tendancesDeLaRegion("fr", "Lille")).toEqual([]);
    expect(mock.order.groupBy).not.toHaveBeenCalled();
  });
});

describe("promotionsDeLaRegion", () => {
  test("écarte les promotions épuisées et ne montre pas leurs compteurs", async () => {
    const magasin = { id: "s1", name: "Tacos Bar", slug: "tacos-bar", city: "Lille", cuisineType: "tacos", org: { id: "o1", slug: "o" } };
    mock.promotion.findMany.mockResolvedValue([
      { code: "OK", maxUses: 10, currentUses: 3, store: magasin },
      { code: "EPUISEE", maxUses: 5, currentUses: 5, store: magasin },
      { code: "SANSLIMITE", maxUses: null, currentUses: 99, store: magasin },
    ]);

    const res = await promotionsDeLaRegion("fr");

    expect(res.map((p) => p.code)).toEqual(["OK", "SANSLIMITE"]);
    expect(res[0]).not.toHaveProperty("maxUses");
    expect(res[0]).not.toHaveProperty("currentUses");
    expect(mock.promotion.findMany.mock.calls[0][0].where).toMatchObject({
      status: "ACTIVE",
      store: { deletedAt: null, OR: [{ countryCode: "fr" }, { countryCode: null }] },
    });
  });
});

describe("cuisinesPreferees : jamais de catégorie sensible", () => {
  const cuisines = new Map<string, string | null>([
    ["a", "tacos"], ["b", "halal"], ["c", "kosher"], ["d", "israeli"], ["e", "pizza"], ["f", null], ["g", "burgers"], ["h", "sushi"],
  ]);

  test("halal, casher et israélienne sont écartées même si elles dominent", () => {
    const res = cuisinesPreferees(
      [
        { storeId: "b", commandes: 50 },
        { storeId: "c", commandes: 40 },
        { storeId: "d", commandes: 30 },
        { storeId: "a", commandes: 5 },
        { storeId: "e", commandes: 3 },
      ],
      cuisines,
    );
    expect(res).toEqual(["tacos", "pizza"]);
    for (const c of CUISINES_SENSIBLES) expect(res).not.toContain(c);
  });

  test("garde les trois plus commandées, à égalité par ordre alphabétique", () => {
    const res = cuisinesPreferees(
      [
        { storeId: "a", commandes: 2 },
        { storeId: "e", commandes: 2 },
        { storeId: "g", commandes: 2 },
        { storeId: "h", commandes: 2 },
        { storeId: "f", commandes: 9 },
      ],
      cuisines,
    );
    expect(res).toEqual(["burgers", "pizza", "sushi"]);
  });
});

describe("recommandationsPourLeClient", () => {
  test("opposition active : aucune lecture des commandes", async () => {
    mock.customer.findUnique.mockResolvedValue({ personnalisationDesactivee: true });
    const res = await recommandationsPourLeClient("cust1", "fr");
    expect(res).toEqual({ personnalisationActive: false, cuisines: [], boutiques: [] });
    expect(mock.order.groupBy).not.toHaveBeenCalled();
  });

  test("ne lit que les commandes du client demandé, et met les nouveautés avant les habitudes", async () => {
    mock.customer.findUnique.mockResolvedValue({ personnalisationDesactivee: false });
    mock.order.groupBy.mockResolvedValue([{ storeId: "s1", _count: { _all: 4 } }]);
    mock.store.findMany
      .mockResolvedValueOnce([{ id: "s1", cuisineType: "tacos" }])
      .mockResolvedValueOnce([
        { id: "s1", name: "Habitude", cuisineType: "tacos", rating: 4.9, org: {} },
        { id: "s2", name: "Nouveau", cuisineType: "tacos", rating: 4.2, org: {} },
      ]);

    const res = (await recommandationsPourLeClient("cust1", "fr")) as any;

    expect(mock.order.groupBy.mock.calls[0][0].where).toMatchObject({ customerId: "cust1", status: "COMPLETED" });
    expect(res.cuisines).toEqual(["tacos"]);
    expect(res.boutiques.map((b: any) => b.name)).toEqual(["Nouveau", "Habitude"]);
    expect(res.boutiques[1].dejaCommande).toBe(true);
  });

  test("un client sans commande n'a aucune suggestion", async () => {
    mock.customer.findUnique.mockResolvedValue({ personnalisationDesactivee: false });
    mock.order.groupBy.mockResolvedValue([]);
    const res = await recommandationsPourLeClient("cust1");
    expect(res).toEqual({ personnalisationActive: true, cuisines: [], boutiques: [] });
  });
});
