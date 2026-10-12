jest.mock("../../../services/db", () => ({
  db: { order: { findMany: jest.fn(), groupBy: jest.fn() }, product: { findMany: jest.fn() }, $queryRaw: jest.fn() },
}));

import { db } from "../../../services/db";
import { TRANSMISE } from "../../../utils/commande-transmise";
import { ReportsService } from "../reports.service";

const findOrders = (db as any).order.findMany as jest.Mock;
const raw = (db as any).$queryRaw as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  findOrders.mockResolvedValue([]);
  (db as any).order.groupBy.mockResolvedValue([]);
  raw.mockResolvedValue([{ totalOrders: 0n, totalRevenue: 0, totalTax: 0, totalFees: 0 }]);
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
    expect(raw.mock.calls[0][1].values).toContain("s1");
    expect(raw.mock.calls[0].flatMap((part: any) => part?.values || [])).not.toContain("o1");
  });

  test("la période borne la date de création", async () => {
    const startDate = new Date("2026-01-01");
    const endDate = new Date("2026-01-31");
    await ReportsService.getSalesReport({ storeId: "s1", startDate, endDate });
    expect(findOrders.mock.calls[0][0].where.createdAt).toEqual({ gte: startDate, lte: endDate });
  });

  test("rapport de produits : limité à la boutique et aux commandes transmises", async () => {
    raw.mockResolvedValueOnce([]);
    const result = await ReportsService.getProductPerformance("s1");
    expect(raw.mock.calls[0]).toContain("s1");
    expect(result.pagination).toMatchObject({ total: 0, limit: 50, offset: 0, hasMore: false });
  });
});

describe("chiffres", () => {
  test("rapport de ventes sans commande : zéros, pas de division par zéro", async () => {
    const r = await ReportsService.getSalesReport({ storeId: "s1" });
    expect(r).toMatchObject({ totalOrders: 0, totalRevenue: 0, averageOrderValue: 0 });
  });

  test("chiffre par jour : regroupé, trié par date", async () => {
    raw.mockResolvedValueOnce([
      { date: "2026-03-01", revenue: 20, tax: 2, fees: 0, count: 1n },
      { date: "2026-03-02", revenue: 15, tax: 1.5, fees: 0, count: 2n },
    ]);
    const jours = await ReportsService.getRevenueByDate({ storeId: "s1" });
    expect(jours.map((j) => j.date)).toEqual(["2026-03-01", "2026-03-02"]);
    expect(jours[1].count).toBe(2);
    expect(jours[1].tax).toBeCloseTo(1.5);
  });

  test("ventes : pagination stable, totaux sur toutes les commandes", async () => {
    raw.mockResolvedValueOnce([{ totalOrders: 151n, totalRevenue: 3000.25, totalTax: 120.1, totalFees: 80 }]);
    findOrders.mockResolvedValue([{ id: "order-51", createdAt: new Date("2026-03-01") }]);
    const result = await ReportsService.getSalesReport({ storeId: "s1", limit: 1, offset: 50 });
    expect(findOrders.mock.calls.at(-1)?.[0]).toMatchObject({ take: 1, skip: 50, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    expect(result).toMatchObject({ totalOrders: 151, totalRevenue: 3000.25, pagination: { total: 151, limit: 1, offset: 50, hasMore: true } });
  });

  test("clients : une adresse en capitales et en minuscules est un seul client", async () => {
    raw.mockResolvedValueOnce([{ email: "ana@example.com", name: "Ana", totalSpent: 40, orderCount: 2n, lastOrder: new Date("2026-03-05"), total: 1n }]);
    const result = await ReportsService.getCustomerAnalytics("s1");
    expect(result.customers).toHaveLength(1);
    expect(result.customers[0]).toMatchObject({ email: "ana@example.com", orderCount: 2 });
    expect(result.customers[0].lastOrder).toEqual(new Date("2026-03-05"));
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
