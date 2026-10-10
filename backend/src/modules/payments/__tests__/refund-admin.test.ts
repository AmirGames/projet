import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const reprendre = jest.fn<(...args: any[]) => Promise<any>>();
const examiner = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock("../refund.service", () => ({
  RefundService: { reprendre, aExaminer: examiner },
}));
jest.mock("../payment.service", () => ({ paymentService: {} }));
jest.mock("../../../services/db", () => ({
  db: { mfaFactor: { findUnique: async () => null }, user: { findUnique: async () => ({ email: "admin@example.test" }) } },
}));
jest.mock("../../../config/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../../auth/auth.middleware", () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    const role = req.headers["x-test-role"];
    if (!role) return res.sendStatus(401);
    req.userId = "admin-test";
    req.user = { userId: "admin-test" };
    req.compte = {
      isSuperOwner: role === "owner",
      isSystemAdmin: role !== "merchant",
      acces: { EAT: role },
    };
    next();
  },
}));

import router from "../payments.admin.routes";
import type { Permissions } from "../../auth/permissions-plateforme.service";
import { PermissionsPlateforme } from "../../auth/permissions-plateforme.service";
import { errorHandler } from "../../../middleware/errorHandler";
const app = express();
app.use(express.json());
app.use("/api/superowner", router);
app.use(errorHandler);
const route = "/api/superowner/orders/commande-test/refund/retry";

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .spyOn(PermissionsPlateforme, "permissionsDu")
    .mockImplementation(async (role): Promise<Permissions> =>
      role === "write"
        ? { billing: "write" }
        : role === "read"
          ? { billing: "read" }
          : {},
    );
  reprendre.mockResolvedValue({ id: "op-test", status: "RETRY" });
  examiner.mockResolvedValue([]);
});
describe("Reprise de remboursement — autorisation réelle du garde d'équipe", () => {
  it.each([undefined, "merchant", "other", "read"])(
    "refuse la mutation au profil %s",
    async (role) => {
      const req = request(app).post(route);
      if (role) req.set("x-test-role", role);
      expect((await req.send({ raison: "Reprise après panne" })).status).toBe(
        role ? 403 : 401,
      );
      expect(reprendre).not.toHaveBeenCalled();
    },
  );
  it.each(["owner", "write"])(
    "autorise %s et transmet l'acteur de l'audit",
    async (role) => {
      expect(
        (
          await request(app)
            .post(route)
            .set("x-test-role", role)
            .send({ raison: "Reprise après panne", amount: 1 })
        ).status,
      ).toBe(202);
      expect(reprendre).toHaveBeenCalledWith(
        "commande-test",
        "Reprise après panne",
        "admin-test",
      );
    },
  );
  it("lecture billing : liste autorisée, pagination validée", async () => {
    expect(
      (
        await request(app)
          .get("/api/superowner/orders/refunds/review?limit=10")
          .set("x-test-role", "read")
      ).status,
    ).toBe(200);
    expect(examiner).toHaveBeenCalledWith(undefined, 10);
    expect(
      (
        await request(app)
          .get("/api/superowner/orders/refunds/review?limit=1000")
          .set("x-test-role", "read")
      ).status,
    ).toBe(400);
  });
});
