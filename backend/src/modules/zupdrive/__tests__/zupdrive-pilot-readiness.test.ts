import { describe, expect, it } from "@jest/globals";
import { exigerAgrementWalloniePourPilote, exigerPaiementStripePourPilote } from "../tarification-drive.service";

const agrementValide = {
  NODE_ENV: "production" as const,
  ZUPDRIVE_WALLONIE_AGREMENT_CONFIRME: true,
  ZUPDRIVE_WALLONIE_AGREMENT_REFERENCE: "SPW-2026-00123",
  ZUPDRIVE_WALLONIE_AGREMENT_EXPIRES_AT: "2099-12-31",
};

describe("ouverture du pilote ZupDrive", () => {
  it("ne bloque pas le développement et les tests", () => {
    expect(() => exigerPaiementStripePourPilote({
      NODE_ENV: "test",
      ENABLE_STRIPE: false,
      ZUPDRIVE_PAIEMENT_OBLIGATOIRE: false,
    })).not.toThrow();
    expect(() => exigerAgrementWalloniePourPilote({
      NODE_ENV: "test",
      ZUPDRIVE_WALLONIE_AGREMENT_CONFIRME: false,
      ZUPDRIVE_WALLONIE_AGREMENT_REFERENCE: undefined,
      ZUPDRIVE_WALLONIE_AGREMENT_EXPIRES_AT: undefined,
    })).not.toThrow();
  });

  it("bloque la production si Stripe ou l'obligation de paiement manque", () => {
    for (const config of [
      { NODE_ENV: "production" as const, ENABLE_STRIPE: false, ZUPDRIVE_PAIEMENT_OBLIGATOIRE: true },
      { NODE_ENV: "production" as const, ENABLE_STRIPE: true, ZUPDRIVE_PAIEMENT_OBLIGATOIRE: false },
    ]) {
      expect(() => exigerPaiementStripePourPilote(config)).toThrow(expect.objectContaining({
        statusCode: 503,
        code: "WALLONIE_PILOT_PAYMENT_NOT_READY",
      }));
    }
  });

  it("autorise la production uniquement avec Stripe actif et paiement obligatoire", () => {
    expect(() => exigerPaiementStripePourPilote({
      NODE_ENV: "production",
      ENABLE_STRIPE: true,
      ZUPDRIVE_PAIEMENT_OBLIGATOIRE: true,
    })).not.toThrow();
  });

  it("bloque la Wallonie en production tant que l'agrément n'est pas confirmé", () => {
    expect(() => exigerAgrementWalloniePourPilote({
      NODE_ENV: "production",
      ZUPDRIVE_WALLONIE_AGREMENT_CONFIRME: false,
      ZUPDRIVE_WALLONIE_AGREMENT_REFERENCE: undefined,
      ZUPDRIVE_WALLONIE_AGREMENT_EXPIRES_AT: undefined,
    })).toThrow(expect.objectContaining({
      statusCode: 503,
      code: "WALLONIE_INTERMEDIATION_NOT_APPROVED",
    }));
  });

  it("bloque une confirmation sans référence ni date de validité", () => {
    expect(() => exigerAgrementWalloniePourPilote({
      ...agrementValide,
      ZUPDRIVE_WALLONIE_AGREMENT_REFERENCE: " ",
    })).toThrow(expect.objectContaining({ code: "WALLONIE_INTERMEDIATION_NOT_APPROVED" }));
    expect(() => exigerAgrementWalloniePourPilote({
      ...agrementValide,
      ZUPDRIVE_WALLONIE_AGREMENT_EXPIRES_AT: undefined,
    })).toThrow(expect.objectContaining({ code: "WALLONIE_INTERMEDIATION_NOT_APPROVED" }));
    expect(() => exigerAgrementWalloniePourPilote({
      ...agrementValide,
      ZUPDRIVE_WALLONIE_AGREMENT_EXPIRES_AT: "2000-01-01",
    })).toThrow(expect.objectContaining({ code: "WALLONIE_INTERMEDIATION_NOT_APPROVED" }));
  });

  it("n'ouvre la Wallonie en production qu'avec une référence et une validité documentées", () => {
    expect(() => exigerAgrementWalloniePourPilote(agrementValide)).not.toThrow();
  });
});
