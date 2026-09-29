import { describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";
jest.mock("../../config/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { errorHandler } from "../errorHandler";
import { lecteursDeCorps } from "../corps";

const app = express();
app.use(lecteursDeCorps);
app.post("/x", (_req: express.Request, res: express.Response) => res.json({ ok: true }));
app.use(errorHandler);

describe("taille des corps JSON", () => {
  it("accepte un petit JSON", async () => {
    expect((await request(app).post("/x").send({ a: "b" })).status).toBe(200);
  });

  it("refuse 1 Mo de JSON sur une route ordinaire (413)", async () => {
    const res = await request(app).post("/x").send({ blob: "x".repeat(1024 * 1024) });
    expect(res.status).toBe(413);
  });
});
