import { describe, expect, it } from "@jest/globals";
import { evaluerRegroupement, planifierTournee, positionExploitable, versCoursePlanifiable } from "../planification-livraison.service";
import { CourseTournee, ordonner, REGLES_TOURNEE_PAR_DEFAUT } from "../tournee.service";

const maintenant = Date.parse("2026-11-02T12:00:00Z");
const commerce = { latitude: 50.46, longitude: 4.86 };
const client = { latitude: 50.47, longitude: 4.86 };
const course = (id: string, extra = {}): CourseTournee => ({ id, retrait: commerce, remise: client, recuperee: false, ...extra });

describe("planification des livraisons", () => {
  it("inclut la préparation restant à faire et le temps de retrait/remise", () => {
    const immediate = planifierTournee(commerce, [course("a")], "bike", maintenant)!;
    const preparation = planifierTournee(commerce, [{ ...course("a"), preteA: new Date(maintenant + 10 * 60_000) }], "bike", maintenant)!;
    expect(preparation.retraits.get("a")).toBe(660);
    expect(preparation.remises.get("a")! - immediate.remises.get("a")!).toBe(600);
  });

  it("une commande READY n'attend plus l'ancienne heure de préparation", () => {
    const prete = versCoursePlanifiable({ id: "a", status: "ACCEPTED", pickupLat: 50.46, pickupLng: 4.86, deliveryLat: 50.47, deliveryLng: 4.86,
      order: { status: "READY", estimatedReadyAt: new Date(maintenant + 30 * 60_000) } });
    expect(planifierTournee(commerce, [prete], "car", maintenant)!.retraits.get("a")).toBe(60);
  });

  it("une préparation passée n'ajoute pas d'attente et une commande récupérée n'ajoute pas de retrait", () => {
    const plan = planifierTournee(commerce, [{ ...course("a"), recuperee: true, preteA: new Date(maintenant + 30 * 60_000) }], "car", maintenant)!;
    expect(plan.retraits.size).toBe(0);
    expect(plan.finSecondes).toBeLessThan(600);
    expect(planifierTournee(commerce, [{ ...course("a"), preteA: new Date(maintenant - 60_000) }], "car", maintenant)!.retraits.get("a")).toBe(60);
  });

  it("tient compte du véhicule et du temps avant de se libérer", () => {
    const velo = planifierTournee(commerce, [course("a")], "bike", maintenant)!;
    const voiture = planifierTournee(commerce, [course("a")], "car", maintenant)!;
    const reservee = planifierTournee(commerce, [course("a")], "car", maintenant, 120)!;
    expect(velo.finSecondes).toBeGreaterThan(voiture.finSecondes);
    expect(reservee.finSecondes - voiture.finSecondes).toBe(120);
  });

  it("refuse un regroupement proche si la préparation retarde le client existant de plus de cinq minutes", () => {
    const nouvelle = { ...course("b"), preteA: new Date(maintenant + 20 * 60_000) };
    expect(evaluerRegroupement(commerce, [course("a")], nouvelle, REGLES_TOURNEE_PAR_DEFAUT, "car", maintenant)).toBeNull();
  });

  it("permet deux commandes prêtes voisines en tenant compte des arrêts", () => {
    const estimation = evaluerRegroupement(commerce, [course("a")], course("b"), REGLES_TOURNEE_PAR_DEFAUT, "bike", maintenant)!;
    expect(estimation).not.toBeNull();
    expect(estimation.retardMaxSecondes).toBe(60);
    expect(estimation.scoreSecondes).toBeGreaterThan(estimation.livraisonSecondes);
  });

  it("garde les retraits avant les remises et les remises figées avant les nouvelles", () => {
    const courses = [course("loin", { recuperee: true, ordreRemise: 1, remise: { latitude: 50.48, longitude: 4.86 } }),
      course("proche", { recuperee: true, ordreRemise: 2 }), course("nouvelle")];
    expect(ordonner(commerce, courses).arrets.map((a) => `${a.type}:${a.deliveryId}`)).toEqual([
      "RETRAIT:nouvelle", "REMISE:loin", "REMISE:proche", "REMISE:nouvelle",
    ]);
  });

  it("respecte la capacité et le détour kilométrique configurés", () => {
    expect(evaluerRegroupement(commerce, [course("a")], course("b"), { ...REGLES_TOURNEE_PAR_DEFAUT, maxCourses: 1 }, "car", maintenant)).toBeNull();
    expect(evaluerRegroupement(commerce, [course("a")], course("b", { remise: { latitude: 50.48, longitude: 4.86 } }),
      { ...REGLES_TOURNEE_PAR_DEFAUT, detourMaxKm: 0 }, "car", maintenant)).toBeNull();
  });

  it.each([NaN, Infinity, 91])("écarte une latitude invalide (%s)", (latitude) => {
    expect(positionExploitable({ latitude, longitude: 4 })).toBe(false);
    expect(planifierTournee({ latitude, longitude: 4 }, [course("a")], "car", maintenant)).toBeNull();
  });

  it("ne simule pas un trajet nul quand une destination manque, mais accepte les coordonnées zéro", () => {
    expect(positionExploitable({ latitude: 0, longitude: 0 })).toBe(true);
    expect(planifierTournee(commerce, [course("a", { remise: { latitude: null, longitude: null } })], "car", maintenant)).toBeNull();
  });
});
