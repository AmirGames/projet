import { describe, expect, it } from "@jest/globals";
import { libreDansSecondes, REGLES_BIENTOT_LIBRE_PAR_DEFAUT, CourseEnCours, secondesAvantRetrait } from "../livreur-bientot-libre.service";

const maintenant = Date.parse("2026-10-07T12:00:00Z");
const CLIENT = { latitude: 48.85, longitude: 2.35 };
// ~0,56 km et ~1,67 km au nord du client
const PROCHE = { latitude: 48.855, longitude: 2.35 };
const LOIN = { latitude: 48.865, longitude: 2.35 };

const course = (extra: Partial<CourseEnCours> = {}): CourseEnCours => ({
  status: "PICKED_UP",
  deliveryLat: CLIENT.latitude,
  deliveryLng: CLIENT.longitude,
  nearCustomerNotifiedAt: null,
  attenteFinLe: null,
  customerWaitLeftAt: null,
  ...extra,
});
const dans = (secondes: number) => new Date(maintenant + secondes * 1000);

describe("livreur bientôt libre", () => {
  it("à moins de 1 km du client : bientôt libre", () => {
    expect(libreDansSecondes(course(), PROCHE, maintenant)).not.toBeNull();
  });

  it("à plus de 1 km : pas encore", () => {
    expect(libreDansSecondes(course(), LOIN, maintenant)).toBeNull();
  });

  it("à la porte, client prévenu (moins de 300 m) : bientôt libre même au-delà du rayon réglé", () => {
    const serre = { ...REGLES_BIENTOT_LIBRE_PAR_DEFAUT, rayonKm: 0.1 };
    expect(libreDansSecondes(course({ nearCustomerNotifiedAt: new Date(maintenant - 1000) }), PROCHE, maintenant, serre)).not.toBeNull();
    expect(libreDansSecondes(course(), PROCHE, maintenant, serre)).toBeNull();
  });

  it("attente à la porte : bientôt libre quand il reste 3 minutes ou moins", () => {
    expect(libreDansSecondes(course({ attenteFinLe: dans(150) }), LOIN, maintenant)).toBe(150);
    expect(libreDansSecondes(course({ attenteFinLe: dans(180) }), null, maintenant)).toBe(180);
  });

  it("attente à la porte : pas encore quand il reste plus de 3 minutes, même tout près du client", () => {
    expect(libreDansSecondes(course({ attenteFinLe: dans(300) }), PROCHE, maintenant)).toBeNull();
  });

  it("attente terminée : libre tout de suite", () => {
    expect(libreDansSecondes(course({ attenteFinLe: dans(-30) }), PROCHE, maintenant)).toBe(0);
  });

  it("parti de l'adresse pendant l'attente : écarté", () => {
    expect(libreDansSecondes(course({ attenteFinLe: dans(60), customerWaitLeftAt: new Date(maintenant - 1000) }), PROCHE, maintenant)).toBeNull();
  });

  it("commande pas encore récupérée : jamais bientôt libre", () => {
    expect(libreDansSecondes(course({ status: "ACCEPTED" }), PROCHE, maintenant)).toBeNull();
  });

  it("sans position connue (hors attente) : écarté", () => {
    expect(libreDansSecondes(course(), null, maintenant)).toBeNull();
  });

  it("réglages à 0 et 0 : fonction désactivée", () => {
    const off = { rayonKm: 0, secondes: 0 };
    expect(libreDansSecondes(course(), PROCHE, maintenant, off)).toBeNull();
    expect(libreDansSecondes(course({ attenteFinLe: dans(10) }), PROCHE, maintenant, off)).toBeNull();
  });
});

describe("heure d'arrivée au commerce", () => {
  it("1 km : 4 minutes à vélo, 2 min 24 en scooter, 3 minutes en voiture", () => {
    expect(secondesAvantRetrait(1, 0, "bike")).toBe(240);
    expect(secondesAvantRetrait(1, 0, "scooter")).toBe(144);
    expect(secondesAvantRetrait(1, 0, "car")).toBe(180);
  });

  it("un véhicule inconnu ou absent compte comme une voiture", () => {
    expect(secondesAvantRetrait(1, 0, "trottinette")).toBe(180);
    expect(secondesAvantRetrait(1)).toBe(180);
  });

  it("le temps avant libération s'ajoute au trajet", () => {
    expect(secondesAvantRetrait(1, 120, "bike")).toBe(360);
  });

  it("un vélo à 2 km arrive après un scooter à 3 km", () => {
    expect(secondesAvantRetrait(2, 0, "bike")).toBeGreaterThan(secondesAvantRetrait(3, 0, "scooter"));
  });

  it("un livreur libre à 7 km arrive après un livreur à 1 km qui se libère dans 2 minutes", () => {
    expect(secondesAvantRetrait(7, 0, "scooter")).toBeGreaterThan(secondesAvantRetrait(1, 120, "scooter"));
  });
});

describe("temps avant libération selon le véhicule", () => {
  it("à 0,56 km du client, un scooter est libre plus tôt qu'un vélo", () => {
    const scooter = libreDansSecondes(course(), PROCHE, maintenant, REGLES_BIENTOT_LIBRE_PAR_DEFAUT, "scooter");
    const velo = libreDansSecondes(course(), PROCHE, maintenant, REGLES_BIENTOT_LIBRE_PAR_DEFAUT, "bike");
    expect(scooter).not.toBeNull();
    expect(velo).not.toBeNull();
    expect(scooter!).toBeLessThan(velo!);
  });
});
