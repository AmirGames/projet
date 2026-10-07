import express from "express";
import request from "supertest";

jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../auth/auth.middleware", () => ({ authMiddleware: (_q: any, _r: any, n: any) => n() }));
jest.mock("../../orders/order.service", () => ({ OrderService: { tarifierLesLignes: jest.fn() } }));
jest.mock("../promotion.service", () => ({ PromotionService: { validateAndApply: jest.fn() } }));

import { OrderService } from "../../orders/order.service";
import { PromotionService } from "../promotion.service";
import { errorHandler } from "../../../middleware/errorHandler";
import router from "../promotion.routes";

const app = express();
app.use(express.json());
app.use("/api/promotions", router);
app.use(errorHandler);

const tarifier = OrderService.tarifierLesLignes as jest.Mock;
const valider = PromotionService.validateAndApply as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  valider.mockResolvedValue({ discountAmount: 2 });
});

describe("POST /promotions/validate : aperçu tarifé par le serveur", () => {
  test("avec des lignes, le total vient du catalogue et non du client", async () => {
    const lignes = [
      { productId: "p1", categoryId: null, quantity: 2, price: 10, supplements: [] },
      { productId: "p2", categoryId: null, quantity: 1, price: 5.5, supplements: [] },
    ];
    tarifier.mockResolvedValue(lignes);

    const res = await request(app)
      .post("/api/promotions/validate?storeId=s1")
      .send({ code: "PROMO", cartTotal: 0.01, lignes: [{ productId: "p1", quantity: 2 }, { productId: "p2", quantity: 1 }] });

    expect(res.status).toBe(200);
    expect(tarifier).toHaveBeenCalledWith("s1", [{ productId: "p1", quantity: 2 }, { productId: "p2", quantity: 1 }]);
    // 2 × 10 + 5,50 = 25,50 : le « 0,01 » annoncé est ignoré.
    expect(valider).toHaveBeenCalledWith("s1", "PROMO", 25.5, ["p1", "p2"], lignes);
  });

  test("ancien contrat : le total annoncé reste accepté", async () => {
    const res = await request(app)
      .post("/api/promotions/validate?storeId=s1")
      .send({ code: "PROMO", cartTotal: 30, productIds: ["p1"] });

    expect(res.status).toBe(200);
    expect(tarifier).not.toHaveBeenCalled();
    expect(valider).toHaveBeenCalledWith("s1", "PROMO", 30, ["p1"], undefined);
  });

  test.each([
    ["ni lignes ni total", { code: "PROMO" }],
    ["panier vide", { code: "PROMO", lignes: [] }],
    ["quantité nulle", { code: "PROMO", lignes: [{ productId: "p1", quantity: 0 }] }],
    ["quantité fractionnaire", { code: "PROMO", lignes: [{ productId: "p1", quantity: 1.5 }] }],
  ])("refuse %s", async (_nom, corps) => {
    const res = await request(app).post("/api/promotions/validate?storeId=s1").send(corps);
    expect(res.status).toBe(400);
    expect(valider).not.toHaveBeenCalled();
  });
});
