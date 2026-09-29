import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

jest.mock("../../config/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const findFirst = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock("../../services/db", () => ({ db: { membership: { findFirst: (...a: any[]) => findFirst(...a) } } }));
jest.mock("../../modules/auth/auth.middleware", () => ({
  verifyToken: (jeton: string) => {
    if (jeton === "invalide") throw new Error("jeton invalide");
    return { userId: jeton };
  },
}));

import { compteDemo } from "../../modules/merchants/compte-demo.middleware";

const app = express();
app.use(compteDemo);
const ok = (_req: express.Request, res: express.Response) => res.json({ ok: true });
app.all("/api/merchant-profile/iban", ok);
app.all("/api/products", ok);
app.all("/api/auth/change-password", ok);

describe("compte démo", () => {
  beforeEach(() => {
    findFirst.mockReset();
  });

  it("ferme l'écriture sur les coordonnées bancaires", async () => {
    findFirst.mockResolvedValue({ id: "m" });
    const res = await request(app).put("/api/merchant-profile/iban").set("Authorization", "Bearer demo-1");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("DEMO_ACCOUNT");
  });

  it("ferme le changement de mot de passe", async () => {
    findFirst.mockResolvedValue({ id: "m" });
    const res = await request(app).post("/api/auth/change-password").set("Authorization", "Bearer demo-2");
    expect(res.status).toBe(403);
  });

  it("laisse lire ce qui est fermé en écriture", async () => {
    const res = await request(app).get("/api/merchant-profile/iban").set("Authorization", "Bearer demo-3");
    expect(res.status).toBe(200);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("laisse le catalogue modifiable", async () => {
    findFirst.mockResolvedValue({ id: "m" });
    const res = await request(app).post("/api/products").set("Authorization", "Bearer demo-4");
    expect(res.status).toBe(200);
  });

  it("ne touche pas un vrai commerçant", async () => {
    findFirst.mockResolvedValue(null);
    const res = await request(app).put("/api/merchant-profile/iban").set("Authorization", "Bearer reel-1");
    expect(res.status).toBe(200);
  });

  it("laisse passer un jeton illisible au middleware d'authentification", async () => {
    const res = await request(app).put("/api/merchant-profile/iban").set("Authorization", "Bearer invalide");
    expect(res.status).toBe(200);
  });
});
