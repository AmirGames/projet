import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../db", () => ({ db: {} }));
jest.mock("../../config/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { calculerPeriodes, disponibiliteSur, type Transition } from "../disponibilite.service";

const MIN = 60_000;
const T0 = Date.UTC(2026, 8, 1, 12, 0, 0);

/** Une transition à la minute `m`, comme la base les rend. */
const tr = (m: number, ok: boolean, precedent?: { m: number; ok: boolean }, error: string | null = null): Transition => ({
  ok,
  instant: new Date(T0 + m * MIN),
  okPrecedent: precedent ? precedent.ok : null,
  instantPrecedent: precedent ? new Date(T0 + precedent.m * MIN) : null,
  error,
  statusCode: null,
});

describe("calculerPeriodes", () => {
  it("ne trouve aucune panne dans une série sans échec", () => {
    const { pannes, aveugles } = calculerPeriodes([tr(0, true)], { trouEstUnePanne: true, maintenant: T0 + 60 * MIN });
    expect(pannes).toEqual([]);
    expect(aveugles).toEqual([]);
  });

  it("ouvre une panne au premier échec et la referme au retour", () => {
    const { pannes } = calculerPeriodes(
      [tr(0, true), tr(10, false, { m: 9, ok: true }, "HTTP 502"), tr(15, true, { m: 14, ok: false })],
      { trouEstUnePanne: false, maintenant: T0 + 60 * MIN }
    );
    expect(pannes).toHaveLength(1);
    expect(pannes[0]).toMatchObject({ debut: T0 + 10 * MIN, fin: T0 + 15 * MIN, cause: "HTTP 502" });
  });

  it("laisse ouverte une panne toujours en cours", () => {
    const maintenant = T0 + 30 * MIN;
    const { pannes } = calculerPeriodes([tr(0, true), tr(20, false, { m: 19, ok: true })], { trouEstUnePanne: false, maintenant });
    expect(pannes[0]).toMatchObject({ debut: T0 + 20 * MIN, fin: maintenant, enCours: true });
  });

  it("compte un trou de l'API comme une panne", () => {
    const { pannes, aveugles } = calculerPeriodes([tr(0, true), tr(30, true, { m: 10, ok: true })], {
      trouEstUnePanne: true,
      maintenant: T0 + 60 * MIN,
    });
    expect(aveugles).toEqual([]);
    expect(pannes).toEqual([{ debut: T0 + 10 * MIN, fin: T0 + 30 * MIN, cause: expect.stringContaining("aucun relevé") }]);
  });

  it("met de côté un trou pour une autre cible", () => {
    const { pannes, aveugles } = calculerPeriodes([tr(0, true), tr(30, true, { m: 10, ok: true })], {
      trouEstUnePanne: false,
      maintenant: T0 + 60 * MIN,
    });
    expect(pannes).toEqual([]);
    expect(aveugles).toEqual([{ debut: T0 + 10 * MIN, fin: T0 + 30 * MIN }]);
  });

  it("n'ouvre pas deux pannes quand un trou suit un échec", () => {
    const { pannes } = calculerPeriodes(
      [tr(0, true), tr(5, false, { m: 4, ok: true }, "Base"), tr(30, true, { m: 10, ok: false })],
      { trouEstUnePanne: true, maintenant: T0 + 60 * MIN }
    );
    expect(pannes).toHaveLength(1);
    expect(pannes[0]).toMatchObject({ debut: T0 + 5 * MIN, fin: T0 + 30 * MIN, cause: "Base" });
  });
});

describe("disponibiliteSur", () => {
  it("rend la part du temps sans panne", () => {
    const periodes = { pannes: [{ debut: T0 + 90 * MIN, fin: T0 + 100 * MIN, cause: "x" }], aveugles: [] };
    // 10 minutes de panne sur 1000 minutes observées.
    expect(disponibiliteSur(periodes, T0, T0, T0 + 1000 * MIN)).toBeCloseTo(99, 5);
  });

  it("ne compte pas le temps d'avant le premier relevé, ni les périodes aveugles", () => {
    const periodes = { pannes: [{ debut: T0 + 10 * MIN, fin: T0 + 20 * MIN, cause: "x" }], aveugles: [{ debut: T0 + 50 * MIN, fin: T0 + 100 * MIN }] };
    // Observé : de T0 à T0+100, moins 50 aveugles = 50 min ; 10 en panne.
    expect(disponibiliteSur(periodes, T0, T0 - 1000 * MIN, T0 + 100 * MIN)).toBeCloseTo(80, 5);
  });

  it("ne dit rien d'une fenêtre sans observation", () => {
    expect(disponibiliteSur({ pannes: [], aveugles: [] }, T0 + 10 * MIN, T0, T0 + 5 * MIN)).toBeNull();
  });
});
