import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../../../services/db", () => ({ db: {} }));
jest.mock("../../../config/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  ATTENTE_CLIENT_MS,
  exigerAttenteTerminee,
  exigerPresenceChezClient,
  exigerResteChezClient,
  finAttente,
  quitteLAdressePendantLAttente,
} from "../delivery-proof.service";

const debut = new Date("2026-09-27T12:00:00Z");

describe("attente du client injoignable", () => {
  it("dure six minutes", () => {
    expect(ATTENTE_CLIENT_MS).toBe(6 * 60 * 1000);
    expect(finAttente({ customerWaitStartedAt: debut })?.toISOString()).toBe("2026-09-27T12:06:00.000Z");
    expect(finAttente({ customerWaitStartedAt: null })).toBeNull();
  });

  it("refuse la photo tant que l'attente n'a pas commencé", () => {
    expect(() => exigerAttenteTerminee({ customerWaitStartedAt: null })).toThrow(/lancez l'attente/);
  });

  it("refuse la photo avant la fin des six minutes, en disant combien il reste", () => {
    const pendant = new Date(debut.getTime() + 4 * 60 * 1000 + 30 * 1000);
    expect(() => exigerAttenteTerminee({ customerWaitStartedAt: debut }, pendant)).toThrow(/1 min 30 s/);
  });

  it("accepte la photo une fois l'attente écoulée", () => {
    const apres = new Date(debut.getTime() + ATTENTE_CLIENT_MS);
    expect(() => exigerAttenteTerminee({ customerWaitStartedAt: debut }, apres)).not.toThrow();
  });
});

describe("présence chez le client pour lancer l'attente", () => {
  const adresse = { deliveryLat: 45.78, deliveryLng: 4.86 };

  it("l'accepte devant chez le client, GPS approximatif compris", () => {
    // ~150 m au nord de l'adresse
    expect(() => exigerPresenceChezClient({ latitude: 45.7813, longitude: 4.86 }, adresse)).not.toThrow();
  });

  it("la refuse loin de l'adresse, en disant à quelle distance", () => {
    expect(() => exigerPresenceChezClient({ latitude: 45.764, longitude: 4.8357 }, adresse)).toThrow(
      /à 2,6 km de l'adresse du client/
    );
  });

  it("la refuse sans position connue : couper le GPS ne doit pas ouvrir le dépôt", () => {
    expect(() => exigerPresenceChezClient(null, adresse)).toThrow(/activez la localisation/);
  });

  it("laisse passer une adresse jamais située, qu'on ne peut pas vérifier", () => {
    expect(() => exigerPresenceChezClient(null, { deliveryLat: null, deliveryLng: null })).not.toThrow();
  });
});

describe("livreur qui quitte l'adresse pendant l'attente", () => {
  const course = (extra = {}) => ({
    status: "PICKED_UP",
    customerWaitStartedAt: debut,
    deliveryLat: 45.78,
    deliveryLng: 4.86,
    ...extra,
  });

  it("est repéré au-delà de 500 m, pendant l'attente seulement", () => {
    const loin = { latitude: 45.764, longitude: 4.8357 };
    const proche = { latitude: 45.7813, longitude: 4.86 };
    expect(quitteLAdressePendantLAttente(loin, course())).toBe(true);
    expect(quitteLAdressePendantLAttente(proche, course())).toBe(false);
    expect(quitteLAdressePendantLAttente(loin, course({ customerWaitStartedAt: null }))).toBe(false);
    expect(quitteLAdressePendantLAttente(loin, course({ status: "DELIVERED" }))).toBe(false);
  });

  it("perd le dépôt en photo, même revenu à la porte", () => {
    expect(() => exigerResteChezClient({ customerWaitLeftAt: new Date() })).toThrow(/code du client/);
    expect(() => exigerResteChezClient({ customerWaitLeftAt: null })).not.toThrow();
  });
});
