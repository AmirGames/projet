import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const db: any = { store: { findMany: jest.fn(async () => []) } };
jest.mock("../../../services/db", () => ({ db }));
import mapsRouter from "../maps.routes";
import { errorHandler } from "../../../middleware/errorHandler";

const app = express();
app.use("/api/maps", mapsRouter);
app.use(errorHandler);

beforeEach(() => { jest.clearAllMocks(); });

describe("nearby-stores : route publique bornée", () => {
  it.each(["0", "-3", "51", "abc", "Infinity"])("refuse le rayon %s", async (radius) => {
    const res = await request(app).get("/api/maps/nearby-stores").query({ latitude: 50.85, longitude: 4.35, radius });
    expect(res.status).toBe(400);
    expect(db.store.findMany).not.toHaveBeenCalled();
  });

  it("limite la requête à une boîte autour du client, avec un plafond de lignes", async () => {
    await request(app).get("/api/maps/nearby-stores").query({ latitude: 50, longitude: 4, radius: 5 }).expect(200);
    const { where, take } = db.store.findMany.mock.calls[0][0];
    expect(take).toBe(500);
    expect(where.deletedAt).toBeNull();
    expect(where.latitude.gte).toBeCloseTo(50 - 5 / 111.32, 4);
    expect(where.latitude.lte).toBeCloseTo(50 + 5 / 111.32, 4);
    expect(where.longitude.gte).toBeLessThan(4);
  });

  it("ne sélectionne que des champs de vitrine", async () => {
    await request(app).get("/api/maps/nearby-stores").query({ latitude: 50, longitude: 4 }).expect(200);
    const { select, include } = db.store.findMany.mock.calls[0][0];
    expect(include).toBeUndefined();
    for (const interdit of ["vatNumber", "registrationNumber", "settings", "legalName", "email", "phone"])
      expect(select[interdit]).toBeUndefined();
  });

  it("estime un délai réaliste : 15 min de préparation + trajet à 20 km/h", async () => {
    db.store.findMany.mockResolvedValue([
      { id: "s1", name: "Proche", latitude: 50.0, longitude: 4.0 },
    ] as never);
    // ≈ 5,56 km au nord : 17 minutes de trajet à 20 km/h.
    const res = await request(app).get("/api/maps/nearby-stores").query({ latitude: 50.05, longitude: 4, radius: 10 }).expect(200);
    const { distance, estimatedDeliveryTime } = res.body.data[0];
    expect(distance).toBeGreaterThan(5);
    expect(estimatedDeliveryTime).toBe(15 + Math.ceil((distance / 20) * 60));
    expect(estimatedDeliveryTime).toBeLessThan(60);
  });

  it("route : refuse des coordonnées illisibles ou hors limites", async () => {
    for (const q of [{ startLat: "x", startLng: 4, endLat: 50, endLng: 4 }, { startLat: 91, startLng: 4, endLat: 50, endLng: 4 }]) {
      expect((await request(app).get("/api/maps/route").query(q)).status).toBe(400);
    }
    expect((await request(app).get("/api/maps/route").query({ startLat: 50, startLng: 4, endLat: 50.1, endLng: 4 })).status).toBe(200);
  });
});

