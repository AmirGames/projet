import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../db", () => ({ db: {} }));
jest.mock("../../config/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { ATTENTE_CLIENT_MS, exigerAttenteTerminee, finAttente } from "../delivery-proof.service";

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
