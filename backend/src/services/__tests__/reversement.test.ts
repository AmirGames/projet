import { describe, expect, it } from "@jest/globals";
import { lignesDuReversement } from "../../utils/reversement";
import { debutDeSemaine, semaineEcoulee } from "../../utils/semaine-bruxelles";
import { fichierSepa, ibanValide, texteSepa } from "../../utils/sepa";

const commande = (champs: Partial<Parameters<typeof lignesDuReversement>[0][number]>) => ({
  totalAmount: 0,
  feesAmount: 0,
  serviceFeeAmount: 0,
  discountAmount: 0,
  commissionAmount: 0,
  deliveryMode: null,
  paymentId: "pi_1",
  ...champs,
});

describe("lignesDuReversement", () => {
  it("reverse les articles payés en ligne, commission retenue", () => {
    // 15 € d'articles + 5 € livreur plateforme + 0,25 € : payé 20,25 €.
    const { lignes, net } = lignesDuReversement([
      commande({ totalAmount: 20.25, feesAmount: 5, serviceFeeAmount: 0.25, commissionAmount: 1.2, deliveryMode: "PLATFORM" }),
    ]);
    expect(lignes.map((l) => [l.code, l.montant])).toEqual([
      ["100", 15],
      ["200", -1.2],
    ]);
    expect(net).toBe(13.8);
  });

  it("montre la remise, et reverse la livraison quand il livre lui-même", () => {
    // 15 € d'articles − 2 € de remise + 3 € de livraison propre + 0,25 €.
    const { lignes, net } = lignesDuReversement([
      commande({ totalAmount: 16.25, feesAmount: 3, serviceFeeAmount: 0.25, discountAmount: 2, commissionAmount: 1, deliveryMode: "OWN" }),
    ]);
    expect(lignes.map((l) => [l.code, l.montant])).toEqual([
      ["100", 15],
      ["110", -2],
      ["120", 3],
      ["200", -1],
    ]);
    expect(net).toBe(15);
  });

  it("retient ce qui revient à la plateforme sur une commande payée sur place", () => {
    const { lignes, net } = lignesDuReversement([
      commande({ paymentId: null, totalAmount: 10.25, serviceFeeAmount: 0.25, commissionAmount: 0.8 }),
    ]);
    expect(lignes.map((l) => [l.code, l.montant])).toEqual([
      ["200", -0.8],
      ["230", -0.25],
    ]);
    expect(net).toBe(-1.05);
  });

  it("reprend un solde négatif reporté", () => {
    const { lignes, net } = lignesDuReversement([commande({ totalAmount: 10, commissionAmount: 1 })], -1.05);
    expect(lignes.find((l) => l.code === "300")?.montant).toBe(-1.05);
    expect(net).toBe(7.95);
  });
});

describe("semaines à l'heure de Bruxelles", () => {
  it("commence le lundi à minuit, heure belge (été : UTC+2)", () => {
    // Mercredi 23 septembre 2026, 15 h UTC.
    expect(debutDeSemaine(new Date("2026-09-23T15:00:00Z")).toISOString()).toBe("2026-09-20T22:00:00.000Z");
  });

  it("commence le lundi à minuit, heure belge (hiver : UTC+1)", () => {
    expect(debutDeSemaine(new Date("2026-12-09T10:00:00Z")).toISOString()).toBe("2026-12-06T23:00:00.000Z");
  });

  it("une course du dimanche 23 h 30 reste dans sa semaine", () => {
    // Dimanche 27 septembre 2026, 23 h 30 à Bruxelles = 21 h 30 UTC.
    expect(debutDeSemaine(new Date("2026-09-27T21:30:00Z")).toISOString()).toBe("2026-09-20T22:00:00.000Z");
  });

  it("la semaine écoulée, vue le lundi à 00 h 05", () => {
    const { periodStart, periodEnd } = semaineEcoulee(new Date("2026-09-27T22:05:00Z"));
    expect(periodStart.toISOString()).toBe("2026-09-20T22:00:00.000Z");
    expect(periodEnd.toISOString()).toBe("2026-09-27T22:00:00.000Z");
  });

  it("traverse le passage à l'heure d'hiver", () => {
    // Lundi 26 octobre 2026 00 h 05 (hiver) : la semaine a commencé en été.
    const { periodStart, periodEnd } = semaineEcoulee(new Date("2026-10-25T23:05:00Z"));
    expect(periodStart.toISOString()).toBe("2026-10-18T22:00:00.000Z");
    expect(periodEnd.toISOString()).toBe("2026-10-25T23:00:00.000Z");
  });
});

describe("SEPA", () => {
  it("vérifie la clé des IBAN", () => {
    expect(ibanValide("BE68 5390 0754 7034")).toBe(true);
    expect(ibanValide("BE68 5390 0754 7035")).toBe(false);
    expect(ibanValide("")).toBe(false);
  });

  it("retire les caractères refusés par les banques", () => {
    expect(texteSepa("Pizzéria « Chez Momo » & fils", 70)).toBe("Pizzeria Chez Momo fils");
  });

  it("produit un fichier pain.001 avec le total contrôlé", () => {
    const fichier = fichierSepa(
      { nom: "Ma Plateforme", iban: "BE71096123456769" },
      [
        { id: "MP-1", nom: "Pizzéria Roma", iban: "BE68539007547034", montant: 1335, communication: "Relevé semaine 39" },
        { id: "DP-1", nom: "Livreur", iban: "BE68539007547034", montant: 0.1, communication: "Courses" },
      ],
      { reference: "VERSEMENTS-2026-W39", dateExecution: new Date("2026-09-27T22:05:00Z"), maintenant: new Date("2026-09-27T22:05:00Z") }
    );
    expect(fichier).toContain("pain.001.001.03");
    expect(fichier.match(/<NbOfTxs>2<\/NbOfTxs>/g)).toHaveLength(2);
    expect(fichier).toContain("<CtrlSum>1335.10</CtrlSum>");
    expect(fichier).toContain("<Nm>Pizzeria Roma</Nm>");
    // Lundi 00 h 05 à Bruxelles, encore dimanche en UTC : la date est lundi.
    expect(fichier).toContain("<ReqdExctnDt>2026-09-28</ReqdExctnDt>");
  });
});
