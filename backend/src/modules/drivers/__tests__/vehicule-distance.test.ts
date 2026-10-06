import { describe, expect, it } from "@jest/globals";
import {
  exceptionOuverte,
  limiteVehiculeKm,
  LIMITES_VEHICULE_PAR_DEFAUT,
  peutLivrer,
} from "../vehicule-distance.service";

const limites = LIMITES_VEHICULE_PAR_DEFAUT; // vélo 4, scooter 7, voiture 8 (rayon du site)

describe("limite de distance selon le véhicule", () => {
  it("vélo 4 km, scooter 7 km, voiture : le rayon du site", () => {
    expect(limiteVehiculeKm("bike", limites)).toBe(4);
    expect(limiteVehiculeKm("scooter", limites)).toBe(7);
    expect(limiteVehiculeKm("car", limites)).toBe(8);
  });

  it("jamais au-delà du rayon du site, même si le réglage du véhicule est plus large", () => {
    const reduit = { ...limites, maxRadiusKm: 5 };
    expect(limiteVehiculeKm("bike", reduit)).toBe(4);
    expect(limiteVehiculeKm("scooter", reduit)).toBe(5);
    expect(limiteVehiculeKm("car", reduit)).toBe(5);
  });

  it("la voiture suit le réglage du site quand on l'agrandit", () => {
    expect(limiteVehiculeKm("car", { ...limites, maxRadiusKm: 15 })).toBe(15);
  });

  it("un type de véhicule inconnu vaut la voiture", () => {
    expect(limiteVehiculeKm("trottinette", limites)).toBe(8);
    expect(limiteVehiculeKm(null, limites)).toBe(8);
  });

  it("la limite est incluse, un mètre de plus est refusé", () => {
    expect(peutLivrer("bike", 4, limites)).toBe(true);
    expect(peutLivrer("bike", 4.01, limites)).toBe(false);
    expect(peutLivrer("scooter", 7, limites)).toBe(true);
    expect(peutLivrer("scooter", 7.5, limites)).toBe(false);
    expect(peutLivrer("car", 8, limites)).toBe(true);
  });

  it("sans distance connue, la course n'est pas écartée", () => {
    expect(peutLivrer("bike", null, limites)).toBe(true);
    expect(peutLivrer("bike", Number.NaN, limites)).toBe(true);
  });
});

describe("ouverture de l'exception aux véhicules hors limite", () => {
  const maintenant = Date.parse("2026-10-07T12:00:00Z");
  const depuis = (secondes: number) => new Date(maintenant - secondes * 1000);

  it("reste fermée tant qu'un livreur adapté existe et que le délai n'est pas écoulé", () => {
    expect(exceptionOuverte({ aucunLivreurAdapte: false, rechercheDepuis: depuis(60), maintenant, limites })).toBe(false);
  });

  it("s'ouvre au bout du délai réglé", () => {
    expect(exceptionOuverte({ aucunLivreurAdapte: false, rechercheDepuis: depuis(179), maintenant, limites })).toBe(false);
    expect(exceptionOuverte({ aucunLivreurAdapte: false, rechercheDepuis: depuis(180), maintenant, limites })).toBe(true);
  });

  it("s'ouvre tout de suite quand aucun livreur adapté n'existe", () => {
    expect(exceptionOuverte({ aucunLivreurAdapte: true, rechercheDepuis: depuis(0), maintenant, limites })).toBe(true);
  });

  it("un délai de 0 ouvre toujours", () => {
    expect(
      exceptionOuverte({ aucunLivreurAdapte: false, rechercheDepuis: depuis(0), maintenant, limites: { ...limites, exceptionSeconds: 0 } })
    ).toBe(true);
  });
});
