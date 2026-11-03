import { describe, expect, it, jest } from "@jest/globals";
const db: any = { store: { findUniqueOrThrow: jest.fn() }, order: { count: jest.fn() } };
jest.mock("../../../services/db", () => ({ db }));
import { calculerPreparation, horodatagePreparation, PreparationCuisineService } from "../preparation-cuisine.service";

const maintenant = Date.parse("2026-11-03T12:00:00Z");
const config = { kitchenDefaultMinutes: 20, kitchenParallelOrders: 3, kitchenRushExtraMinutes: 10, kitchenRushUntil: null as Date | null };
const observation = (minutes: number) => ({ acceptedAt: new Date(maintenant - minutes * 60_000), readyAt: new Date(maintenant) });
const active = (finDans: number) => ({ acceptedAt: new Date(maintenant - 10 * 60_000), estimatedReadyAt: new Date(maintenant + finDans * 60_000) });

describe("suggestion de préparation", () => {
  it("utilise le réglage sans inventer une moyenne avec trop peu d'observations", () => {
    expect(calculerPreparation(config, [observation(30)], [], maintenant)).toMatchObject({ minutes: 20, source: "REGLAGE", echantillons: 1 });
  });
  it("propose 30 minutes quand les préparations observées durent 30 minutes", () => {
    expect(calculerPreparation(config, Array.from({ length: 5 }, () => observation(30)), [], maintenant)).toMatchObject({ minutes: 30, source: "HISTORIQUE" });
  });
  it("écarte les durées incohérentes et limite le poids des oublis du bouton prête", () => {
    const historique = [observation(-1), observation(500), observation(2), observation(100), ...Array.from({ length: 8 }, () => observation(20))];
    expect(calculerPreparation(config, historique, [], maintenant)).toMatchObject({ minutes: 20, echantillons: 10 });
  });
  it("ne met pas chaque commande en série quand plusieurs postes sont libres", () => {
    expect(calculerPreparation(config, [], [active(10), active(10)], maintenant)).toMatchObject({ minutes: 20, attenteMinutes: 0 });
    expect(calculerPreparation(config, [], [active(10), active(10), active(10)], maintenant)).toMatchObject({ minutes: 30, attenteMinutes: 10 });
  });
  it("tient compte des lots successifs et des commandes qui ne sont toujours pas prêtes", () => {
    const resultat = calculerPreparation({ ...config, kitchenParallelOrders: 1 }, [], [active(5), active(5)], maintenant);
    expect(resultat.minutes).toBeGreaterThanOrEqual(50);
    expect(calculerPreparation(config, [], [active(-50), active(-50), active(-50)], maintenant).minutes).toBeGreaterThan(20);
  });
  it("ajoute le rush temporaire puis l'expire automatiquement", () => {
    const reglage = { ...config, kitchenRushUntil: new Date(maintenant + 60_000) };
    expect(calculerPreparation(reglage, [], [], maintenant)).toMatchObject({ minutes: 30, rush: { supplementMinutes: 10 } });
    expect(calculerPreparation(reglage, [], [], maintenant + 60_000)).toMatchObject({ minutes: 20, rush: null });
  });
  it("borne le délai et distingue une surcharge de deux cents commandes", () => {
    expect(calculerPreparation(config, [], Array.from({ length: 200 }, () => active(120)), maintenant).minutes).toBe(240);
  });
  it("horodate READY une fois et invalide l'échantillon si la commande repart en préparation", () => {
    const date = new Date(maintenant);
    expect(horodatagePreparation("PREPARING", "READY", date)).toEqual({ readyAt: date });
    expect(horodatagePreparation("READY", "READY", date)).toEqual({});
    expect(horodatagePreparation("READY", "PREPARING", date)).toEqual({ readyAt: null, preparationCalmSample: false });
    expect(horodatagePreparation("READY", "COMPLETED", date)).toEqual({});
  });
  it("ne retient comme temps habituel que les acceptations sans surcharge ni retrait programmé", async () => {
    db.store.findUniqueOrThrow.mockResolvedValue(config);
    db.order.count.mockResolvedValue(2);
    expect(await PreparationCuisineService.echantillonCalme('s1', null, new Date(maintenant))).toBe(true);
    db.order.count.mockResolvedValue(3);
    expect(await PreparationCuisineService.echantillonCalme('s1', null, new Date(maintenant))).toBe(false);
    db.store.findUniqueOrThrow.mockResolvedValue({ ...config, kitchenRushUntil: new Date(maintenant + 60_000) });
    db.order.count.mockResolvedValue(0);
    expect(await PreparationCuisineService.echantillonCalme('s1', null, new Date(maintenant))).toBe(false);
    expect(await PreparationCuisineService.echantillonCalme('s1', new Date(maintenant + 60_000), new Date(maintenant))).toBe(false);
  });
});
