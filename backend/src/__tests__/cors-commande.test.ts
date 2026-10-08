/**
 * La commande part du navigateur avec un en-tête Idempotency-Key. Le site et
 * l'API n'ont pas la même origine : si le préflight ne l'autorise pas, le
 * navigateur annule l'envoi (« Erreur de connexion ») sans que l'API voie rien.
 */
import request from "supertest";
import { describe, expect, it } from "@jest/globals";
import { createApp } from "../app";

const ORIGINE_SITE = process.env.FRONTEND_URL || "http://localhost:3000";

describe("CORS de la création de commande", () => {
  it("le préflight de POST /api/orders autorise Idempotency-Key", async () => {
    const reponse = await request(createApp())
      .options("/api/orders")
      .set("Origin", ORIGINE_SITE)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type,idempotency-key,authorization");

    expect(reponse.headers["access-control-allow-origin"]).toBe(ORIGINE_SITE);
    expect(reponse.headers["access-control-allow-headers"]).toMatch(/Idempotency-Key/i);
  });
});
