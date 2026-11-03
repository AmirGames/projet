import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const db = { courier: { findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>() } };
jest.mock("../../../services/db", () => ({ db }));
import { estimerPourClient, estimationCommandeAutorisee } from "../estimation-client.service";

const maintenant = Date.parse("2026-11-02T12:00:00Z");
const course = (id = "cible") => ({
  id, status: "PICKED_UP", pickupLat: 50.46, pickupLng: 4.86, deliveryLat: 50.47, deliveryLng: 4.86,
  ordreRemise: 1, customerWaitStartedAt: null as Date | null, customerWaitLeftAt: null as Date | null,
  order: { status: "READY", estimatedReadyAt: null as Date | null },
});
const livreur = () => ({ vehicleType: "bike", latitude: 50.46, longitude: 4.86,
  lastLocationUpdate: new Date(maintenant), gpsLostAt: null as Date | null, deliveries: [course()] });
const commande = () => ({ status: "READY", deliveryType: "DELIVERY", deliveryMode: "PLATFORM", estimatedReadyAt: null as Date | null,
  delivery: { ...course(), reservedDriverId: null as string | null, driver: livreur() as ReturnType<typeof livreur> | null } });

beforeEach(() => { jest.clearAllMocks(); });

describe("fourchette publique de livraison", () => {
  it("calcule une fourchette arrondie et ne divulgue aucune donnée de tournée", () => {
    const estimation = estimerPourClient(commande(), null, maintenant)!;
    expect(estimation.etape).toBe("EN_ROUTE");
    expect(Date.parse(estimation.fourchette!.debut)).toBeGreaterThanOrEqual(maintenant);
    expect(Date.parse(estimation.fourchette!.fin) - Date.parse(estimation.fourchette!.debut)).toBeGreaterThanOrEqual(300_000);
    expect(JSON.stringify(estimation)).not.toMatch(/cible|50\.4|4\.86|vehicleType|deliveries/);
  });

  it.each([null, new Date(maintenant - 121_000), new Date(maintenant + 31_000)])("ne promet pas d'arrivée avec un GPS manquant ou ancien : %s", (date) => {
    const c = commande(); c.delivery.driver!.lastLocationUpdate = date as Date;
    expect(estimerPourClient(c, null, maintenant)).toMatchObject({ fourchette: null, motif: "GPS_INDISPONIBLE" });
  });

  it("expire dès que le dernier GPS atteint deux minutes", () => {
    const c = commande(); c.delivery.driver!.lastLocationUpdate = new Date(maintenant - 110_000);
    expect(estimerPourClient(c, null, maintenant)!.valideJusqua).toBe(new Date(maintenant + 10_000).toISOString());
  });

  it("inclut la préparation, puis la retire quand le restaurant déclare la commande prête", () => {
    const c = commande(); c.status = "PREPARING"; c.delivery.status = "ACCEPTED";
    c.estimatedReadyAt = new Date(maintenant + 900_000);
    const preparation = estimerPourClient(c, null, maintenant)!;
    c.status = "READY";
    const prete = estimerPourClient(c, null, maintenant)!;
    expect(preparation.etape).toBe("PREPARATION");
    expect(prete.etape).toBe("LIVREUR_EN_APPROCHE");
    expect(Date.parse(preparation.fourchette!.fin)).toBeGreaterThan(Date.parse(prete.fourchette!.fin));
  });

  it("signale un dépassement de préparation au lieu de repousser indéfiniment l'heure", () => {
    const c = commande(); c.status = "PREPARING"; c.delivery.status = "ACCEPTED";
    c.estimatedReadyAt = new Date(maintenant - 180_000);
    expect(estimerPourClient(c, null, maintenant)).toMatchObject({ etape: "PREPARATION", fourchette: null, motif: "PREPARATION_EN_RETARD" });
  });

  it("n'invente pas le délai de recherche d'un livreur ou une préparation inconnue", () => {
    const c = commande(); c.delivery.driver = null;
    expect(estimerPourClient(c, null, maintenant)).toMatchObject({ etape: "RECHERCHE_LIVREUR", fourchette: null });
    c.delivery.driver = livreur(); c.delivery.status = "ACCEPTED"; c.status = "PREPARING";
    expect(estimerPourClient(c, null, maintenant)).toMatchObject({ fourchette: null, motif: "PREPARATION_INCONNUE" });
  });

  it("respecte une remise précédente et explique l'autre livraison", () => {
    const c = commande(); c.delivery.ordreRemise = 2;
    c.delivery.driver!.deliveries.push({ ...course("autre"), deliveryLat: 50.48 });
    const estimation = estimerPourClient(c, null, maintenant)!;
    expect(estimation.etape).toBe("AUTRE_LIVRAISON");
    expect(Date.parse(estimation.fourchette!.fin)).toBeGreaterThan(Date.parse(estimerPourClient(commande(), null, maintenant)!.fourchette!.fin));
  });

  it("termine la tournée actuelle avant le retrait d'une réservation", () => {
    const c = commande(); c.delivery.driver = null; c.delivery.reservedDriverId = "reserve"; c.delivery.status = "PENDING";
    const reserve = livreur(); reserve.deliveries = [{ ...course("autre"), deliveryLat: 50.50 }];
    const estimation = estimerPourClient(c, reserve, maintenant)!;
    expect(estimation.etape).toBe("AUTRE_LIVRAISON");
    expect(Date.parse(estimation.fourchette!.fin)).toBeGreaterThan(maintenant + 20 * 60_000);
  });

  it("explique les autres retraits et attend la fin d'une absence chez un autre client", () => {
    const c = commande();
    c.delivery.driver!.deliveries.push({ ...course("autre"), status: "ACCEPTED" });
    expect(estimerPourClient(c, null, maintenant)!.etape).toBe("COLLECTE");
    c.delivery.driver!.deliveries[1] = { ...course("autre"), customerWaitStartedAt: new Date(maintenant) };
    c.delivery.ordreRemise = 2;
    const estimation = estimerPourClient(c, null, maintenant)!;
    expect(Date.parse(estimation.fourchette!.fin)).toBeGreaterThanOrEqual(maintenant + 6 * 60_000);
  });

  it("ne produit pas de trajet avec des coordonnées invalides", () => {
    const c = commande(); c.delivery.deliveryLat = NaN;
    expect(estimerPourClient(c, null, maintenant)).toMatchObject({ fourchette: null, motif: "TRAJET_INCONNU" });
  });

  it("retire la fourchette après livraison, annulation, à la porte et pour le retrait sur place", () => {
    const c = commande(); c.delivery.status = "DELIVERED";
    expect(estimerPourClient(c, null, maintenant)).toMatchObject({ etape: "LIVREE", fourchette: null });
    c.status = "REJECTED";
    expect(estimerPourClient(c, null, maintenant)).toMatchObject({ etape: "ANNULEE", fourchette: null });
    c.status = "READY"; c.delivery.status = "PICKED_UP"; c.delivery.customerWaitStartedAt = new Date(maintenant);
    expect(estimerPourClient(c, null, maintenant)).toMatchObject({ etape: "ATTENTE_CLIENT", fourchette: null });
    c.deliveryType = "PICKUP";
    expect(estimerPourClient(c, null, maintenant)).toBeNull();
  });

  it("ne recherche un livreur réservé que lorsque nécessaire", async () => {
    const c = commande();
    await estimationCommandeAutorisee(c);
    expect(db.courier.findUnique).not.toHaveBeenCalled();
    c.delivery.driver = null; c.delivery.reservedDriverId = "reserve";
    db.courier.findUnique.mockResolvedValue(null);
    await estimationCommandeAutorisee(c);
    expect(db.courier.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "reserve" } }));
  });
});
