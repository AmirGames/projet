jest.mock("../../../services/db", () => ({
  db: { order: { findMany: jest.fn() }, product: { findMany: jest.fn() } },
}));

import { db } from "../../../services/db";
import { TRANSMISE } from "../../../utils/commande-transmise";
import { ReportsService } from "../reports.service";

const findOrders = (db as any).order.findMany as jest.Mock;
const findProducts = (db as any).product.findMany as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  findOrders.mockResolvedValue([]);
});

describe("périmètre des rapports", () => {
  test("une boutique : seules les commandes transmises de cette boutique", async () => {
    await ReportsService.getSalesReport({ storeId: "s1" });
    expect(findOrders.mock.calls[0][0].where).toEqual({ ...TRANSMISE, storeId: "s1" });
  });

  test("un commerce : toutes ses boutiques, et pas celles des autres", async () => {
    await ReportsService.getSalesReport({ orgId: "o1" });
    expect(findOrders.mock.calls[0][0].where).toEqual({ ...TRANSMISE, store: { orgId: "o1" } });
  });

  test("la boutique l'emporte sur le commerce quand les deux sont donnés", async () => {
    await ReportsService.getRevenueByDate({ storeId: "s1", orgId: "o1" });
    const { where } = findOrders.mock.calls[0][0];
    expect(where.storeId).toBe("s1");
    expect(where.store).toBeUndefined();
  });

  test("la période borne la date de création", async () => {
    const startDate = new Date("2026-01-01");
    const endDate = new Date("2026-01-31");
    await ReportsService.getSalesReport({ storeId: "s1", startDate, endDate });
    expect(findOrders.mock.calls[0][0].where.createdAt).toEqual({ gte: startDate, lte: endDate });
  });

  test("rapport de produits : limité à la boutique et aux commandes transmises", async () => {
    findProducts.mockResolvedValue([]);
    await ReportsService.getProductPerformance("s1");
    const arg = findProducts.mock.calls[0][0];
    expect(arg.where).toEqual({ storeId: "s1" });
    expect(arg.include.orderItems.where).toEqual({ order: TRANSMISE });
  });
});

describe("chiffres", () => {
  test("rapport de ventes sans commande : zéros, pas de division par zéro", async () => {
    const r = await ReportsService.getSalesReport({ storeId: "s1" });
    expect(r).toMatchObject({ totalOrders: 0, totalRevenue: 0, averageOrderValue: 0 });
  });

  test("chiffre par jour : regroupé, trié par date", async () => {
    findOrders.mockResolvedValue([
      { createdAt: new Date("2026-03-02T10:00:00Z"), totalAmount: 10, taxAmount: 1, feesAmount: 0, serviceFeeAmount: 0 },
      { createdAt: new Date("2026-03-01T23:00:00Z"), totalAmount: 20, taxAmount: 2, feesAmount: 0, serviceFeeAmount: 0 },
      { createdAt: new Date("2026-03-02T18:00:00Z"), totalAmount: 5, taxAmount: 0.5, feesAmount: 0, serviceFeeAmount: 0 },
    ]);
    const jours = await ReportsService.getRevenueByDate({ storeId: "s1" });
    expect(jours.map((j) => j.date)).toEqual(["2026-03-01", "2026-03-02"]);
    expect(jours[1].count).toBe(2);
    expect(jours[1].tax).toBeCloseTo(1.5);
  });

  test("clients : une adresse en capitales et en minuscules est un seul client", async () => {
    findOrders.mockResolvedValue([
      { customerEmail: "Ana@Example.com", customerName: "Ana", totalAmount: 10, feesAmount: 0, serviceFeeAmount: 0, createdAt: new Date("2026-03-01") },
      { customerEmail: "ana@example.com", customerName: "Ana", totalAmount: 30, feesAmount: 0, serviceFeeAmount: 0, createdAt: new Date("2026-03-05") },
    ]);
    const clients = await ReportsService.getCustomerAnalytics("s1");
    expect(clients).toHaveLength(1);
    expect(clients[0]).toMatchObject({ email: "ana@example.com", orderCount: 2 });
    expect(clients[0].lastOrder).toEqual(new Date("2026-03-05"));
  });
});

describe("export CSV", () => {
  test("vide : chaîne vide", () => {
    expect(ReportsService.exportToCSV([], "x.csv")).toBe("");
  });

  test("guillemets doublés, séparateur et retour à la ligne préservés dans la cellule", () => {
    const csv = ReportsService.exportToCSV([{ Nom: 'Jo "le" boss, SA', N: 3 }], "x.csv");
    expect(csv).toBe('Nom,N\n"Jo ""le"" boss, SA","3"');
  });

  test.each(["=HYPERLINK(\"http://x\")", "+1+1", "-2+3", "@SUM(A1)", "\tcmd", "\rcmd"])(
    "texte pouvant s'exécuter comme formule (%j) : neutralisé par une apostrophe",
    (nom) => {
      const csv = ReportsService.exportToCSV([{ Customer: nom }], "x.csv");
      expect(csv.split("\n")[1].startsWith(`"'`)).toBe(true);
    }
  );

  test("un nombre négatif garde son signe, sans apostrophe", () => {
    expect(ReportsService.exportToCSV([{ Total: -4.5 }], "x.csv")).toBe('Total\n"-4.5"');
  });

  test("valeur absente : cellule vide, pas « null »", () => {
    expect(ReportsService.exportToCSV([{ A: null, B: undefined }], "x.csv")).toBe('A,B\n"",""');
  });
});
