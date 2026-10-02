import { describe, expect, it } from "@jest/globals";
import { derniersJoursBruxelles, jourBruxelles } from "../semaine-bruxelles";

describe("Les jours à l'heure de Bruxelles", () => {
  it("une commande de 23 h 30 à Bruxelles reste sur son jour, pas sur le lendemain UTC", () => {
    // 2 octobre, 23 h 30 à Bruxelles (heure d'été, UTC+2) = 21 h 30 UTC.
    expect(jourBruxelles(new Date("2026-10-02T21:30:00Z"))).toBe("2026-10-02");
    // 0 h 30 à Bruxelles le 3 = 22 h 30 UTC le 2 : c'est déjà le 3.
    expect(jourBruxelles(new Date("2026-10-02T22:30:00Z"))).toBe("2026-10-03");
  });

  it("les sept derniers jours, du plus ancien à aujourd'hui", () => {
    expect(derniersJoursBruxelles(7, new Date("2026-10-02T10:00:00Z"))).toEqual([
      "2026-09-26",
      "2026-09-27",
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
  });

  it("un passage à l'heure d'hiver ne saute ni ne double aucun jour", () => {
    // Le 25 octobre 2026, la nuit dure 25 heures.
    const jours = derniersJoursBruxelles(3, new Date("2026-10-26T06:00:00Z"));
    expect(jours).toEqual(["2026-10-24", "2026-10-25", "2026-10-26"]);
  });

  it("un passage à l'heure d'été non plus", () => {
    // Le 29 mars 2026, la nuit dure 23 heures ; 0 h 30 à Bruxelles = 23 h 30 UTC la veille.
    const jours = derniersJoursBruxelles(2, new Date("2026-03-29T22:30:00Z"));
    expect(jours).toEqual(["2026-03-29", "2026-03-30"]);
  });
});
