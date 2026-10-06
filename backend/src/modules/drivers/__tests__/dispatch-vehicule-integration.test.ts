import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { db } from "../../../services/db";

jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
const socket = { emitDeliveryUpdate: jest.fn(), emitDriverEvent: jest.fn() };
jest.mock("../../realtime/socket", () => socket);
const notifier = {
  pushLivreur: jest.fn(async (..._a: unknown[]) => true),
  etapeLivraisonClient: jest.fn(async (..._a: unknown[]) => undefined),
  livreurTrouveBoutique: jest.fn(async (..._a: unknown[]) => undefined),
};
jest.mock("../../notifications/notifier.service", () => ({ Notifier: notifier, enArrierePlan: (p: Promise<unknown>) => p }));
import { DispatchService } from "../dispatch.service";

/**
 * Distance par véhicule et livreurs bientôt libres, contre une vraie base
 * PostgreSQL de test (jamais une autre : le nom finit par _test, en local).
 *
 *   DISPATCH_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/saas_test?schema=public \
 *   DATABASE_URL=$DISPATCH_TEST_DATABASE_URL npx jest dispatch-vehicule-integration
 */
const enabled = !!process.env.DISPATCH_TEST_DATABASE_URL;
const suite = enabled ? describe : describe.skip;

suite("Dispatch par véhicule et livreurs bientôt libres : base PostgreSQL de test", () => {
  const p = "dispatch-it-";
  const org = p + "org";
  const store = p + "store";
  const COMMERCE = { latitude: 48.85, longitude: 2.35 };
  // ~5,6 km au nord : trop loin pour un vélo, dans la limite d'un scooter.
  const CLIENT_LOIN = { latitude: 48.9, longitude: 2.35 };
  // Le client que le livreur « bientôt libre » termine de livrer (~1,1 km du commerce).
  const CLIENT_EN_COURS = { latitude: 48.86, longitude: 2.35 };

  let compteur = 0;
  const nouvelId = (nom: string) => `${p}${nom}-${++compteur}`;

  async function nettoyer() {
    await db.deliveryOffer.deleteMany({ where: { id: { startsWith: p } } });
    await db.deliveryOffer.deleteMany({ where: { delivery: { id: { startsWith: p } } } });
    await db.orderDelivery.deleteMany({ where: { id: { startsWith: p } } });
    await db.order.deleteMany({ where: { storeId: store } });
    await db.courier.deleteMany({ where: { id: { startsWith: p } } });
    await db.store.deleteMany({ where: { id: store } });
    await db.organization.deleteMany({ where: { id: org } });
    await db.systemConfig.deleteMany({});
  }

  beforeAll(async () => {
    const url = process.env.DISPATCH_TEST_DATABASE_URL!;
    if (
      process.env.DATABASE_URL !== url ||
      !new URL(url).pathname.endsWith("_test") ||
      !["127.0.0.1", "localhost"].includes(new URL(url).hostname)
    ) {
      throw new Error("Ce test ne tourne que sur une base locale dont le nom finit par _test");
    }
    await nettoyer();
    await db.organization.create({ data: { id: org, slug: org, name: org } });
    await db.store.create({ data: { id: store, orgId: org, slug: store, name: "Chez Zup", ...COMMERCE } });
  });

  afterAll(async () => {
    await nettoyer();
    await db.$disconnect();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await db.deliveryOffer.deleteMany({ where: { delivery: { id: { startsWith: p } } } });
    await db.orderDelivery.deleteMany({ where: { id: { startsWith: p } } });
    await db.order.deleteMany({ where: { storeId: store } });
    await db.courier.deleteMany({ where: { id: { startsWith: p } } });
    await db.systemConfig.deleteMany({});
    await db.systemConfig.create({ data: {} }); // réglages par défaut : vélo 4, scooter 7, rayon 8
  });

  async function livreur(nom: string, vehicleType: string, position = { latitude: 48.8505, longitude: 2.35 }) {
    return db.courier.create({
      data: {
        id: nouvelId(nom), name: nom, email: `${nom}-${compteur}@dispatch-it.invalid`, phone: "000", vehicleType,
        status: "ACTIVE", isOnline: true, isAvailable: true, ...position,
      },
    });
  }

  async function course(destination: { latitude: number; longitude: number }, extra: Record<string, unknown> = {}) {
    const order = await db.order.create({
      data: {
        storeId: store, customerName: "Client", customerEmail: "c@dispatch-it.invalid", customerPhone: "000",
        deliveryType: "DELIVERY", deliveryMode: "PLATFORM", status: "PREPARING",
        totalAmount: 20, taxAmount: 0, feesAmount: 4,
        deliveryAddress: "1 rue du Test", deliveryCity: "Paris", deliveryPostal: "75001",
        deliveryLat: destination.latitude, deliveryLng: destination.longitude,
      },
    });
    return db.orderDelivery.create({
      data: {
        id: nouvelId("course"), orderId: order.id, status: "PENDING",
        pickupLat: COMMERCE.latitude, pickupLng: COMMERCE.longitude,
        deliveryLat: destination.latitude, deliveryLng: destination.longitude,
        deliveryLatObfusquee: destination.latitude, deliveryLngObfusquee: destination.longitude,
        deliveryCode: "1234", ...extra,
      },
    });
  }

  /** Un livreur qui livre son dernier client et en est à ~100 m, commande déjà récupérée. */
  async function livreurEnFinDeCourse(nom: string) {
    const sophie = await livreur(nom, "scooter", { latitude: 48.859, longitude: 2.35 });
    const enCours = await course(CLIENT_EN_COURS, {
      status: "PICKED_UP", driverId: sophie.id, assignedAt: new Date(), pickupTime: new Date(),
    });
    await db.courier.update({ where: { id: sophie.id }, data: { currentOrderId: enCours.id, isAvailable: false } });
    return { sophie, enCours };
  }

  it("vélo et scooter en ligne, course de 5,6 km : le scooter la reçoit", async () => {
    const velo = await livreur("velo", "bike", { latitude: 48.8502, longitude: 2.35 });
    const scooter = await livreur("scooter", "scooter", { latitude: 48.853, longitude: 2.35 });
    const c = await course(CLIENT_LOIN);

    await DispatchService.proposerAuSuivant(c.id);

    const offres = await db.deliveryOffer.findMany({ where: { deliveryId: c.id } });
    expect(offres).toHaveLength(1);
    expect(offres[0]).toMatchObject({ driverId: scooter.id, horsLimite: false, bientotLibre: false });
    expect(velo.id).not.toBe(offres[0].driverId);
  });

  it("seul un vélo en ligne : la course lui est proposée, marquée hors limite", async () => {
    const velo = await livreur("velo", "bike");
    const c = await course(CLIENT_LOIN);

    await DispatchService.proposerAuSuivant(c.id);

    const offre = await db.deliveryOffer.findFirstOrThrow({ where: { deliveryId: c.id } });
    expect(offre).toMatchObject({ driverId: velo.id, horsLimite: true });
  });

  it("le superowner peut resserrer les limites : le scooter à 5 km ne prend plus 5,6 km", async () => {
    await db.systemConfig.updateMany({ data: { driverScooterMaxKm: 5 } });
    const scooter = await livreur("scooter", "scooter");
    const c = await course(CLIENT_LOIN);

    await DispatchService.proposerAuSuivant(c.id);

    const offre = await db.deliveryOffer.findFirstOrThrow({ where: { deliveryId: c.id } });
    expect(offre).toMatchObject({ driverId: scooter.id, horsLimite: true });
  });

  it("livreur bientôt libre : l'offre est réservée sans masquer sa livraison en cours, puis démarre à sa libération", async () => {
    const { sophie, enCours } = await livreurEnFinDeCourse("sophie");
    const suivante = await course({ latitude: 48.87, longitude: 2.35 });

    // 1. La course est proposée à Sophie, qui termine sa livraison.
    await DispatchService.proposerAuSuivant(suivante.id);
    const offre = await db.deliveryOffer.findFirstOrThrow({ where: { deliveryId: suivante.id } });
    expect(offre).toMatchObject({ driverId: sophie.id, bientotLibre: true, ajout: false });

    // 2. Elle accepte : réservée, pas attribuée, sa livraison en cours n'est pas touchée.
    const res: any = await DispatchService.accepter(offre.id, sophie.id);
    expect(res.reservee).toBe(true);
    expect(res).not.toHaveProperty("deliveryCode");
    const reservee = await db.orderDelivery.findUniqueOrThrow({ where: { id: suivante.id } });
    expect(reservee).toMatchObject({ status: "PENDING", driverId: null, reservedDriverId: sophie.id });
    expect(Number(reservee.driverPayout)).toBeGreaterThan(0);
    const etat = await DispatchService.etatTournee(sophie.id);
    expect(etat.courses).toBe(1);
    expect(DispatchService.masquage(etat, enCours.id)).toBeNull(); // le client en cours n'est pas masqué

    // 3. Personne d'autre ne reçoit la course réservée, même avec un livreur libre.
    const paul = await livreur("paul", "scooter");
    expect(await DispatchService.proposerAuSuivant(suivante.id)).toBeNull();
    expect(await db.deliveryOffer.count({ where: { driverId: paul.id } })).toBe(0);

    // 4. Pas libérée : rien ne démarre.
    expect(await DispatchService.activerReservation(sophie.id)).toBeNull();

    // 5. Elle remet la commande : la course réservée démarre.
    await db.orderDelivery.update({ where: { id: enCours.id }, data: { status: "DELIVERED", deliveryTime: new Date() } });
    expect(await DispatchService.liberer(sophie.id)).toBe(0);
    const demarree = await db.orderDelivery.findUniqueOrThrow({ where: { id: suivante.id } });
    expect(demarree).toMatchObject({ status: "ACCEPTED", driverId: sophie.id, reservedDriverId: null });
    expect(demarree.assignedAt).not.toBeNull();
    const apres = await db.courier.findUniqueOrThrow({ where: { id: sophie.id } });
    expect(apres).toMatchObject({ currentOrderId: suivante.id, isAvailable: false });
    expect(socket.emitDeliveryUpdate).toHaveBeenCalledTimes(1);

    // 6. Idempotent : rejouer ne réattribue rien.
    expect(await DispatchService.activerReservation(sophie.id)).toBeNull();
    expect(socket.emitDeliveryUpdate).toHaveBeenCalledTimes(1);
  });

  it("deux libérations simultanées ne démarrent la course qu'une fois", async () => {
    const { sophie, enCours } = await livreurEnFinDeCourse("sophie");
    const suivante = await course({ latitude: 48.87, longitude: 2.35 });
    await DispatchService.proposerAuSuivant(suivante.id);
    const offre = await db.deliveryOffer.findFirstOrThrow({ where: { deliveryId: suivante.id } });
    await DispatchService.accepter(offre.id, sophie.id);
    await db.orderDelivery.update({ where: { id: enCours.id }, data: { status: "DELIVERED" } });

    const resultats = await Promise.all([
      DispatchService.activerReservation(sophie.id),
      DispatchService.activerReservation(sophie.id),
      DispatchService.activerReservation(sophie.id),
    ]);

    expect(resultats.filter(Boolean)).toHaveLength(1);
    expect(socket.emitDeliveryUpdate).toHaveBeenCalledTimes(1);
  });

  it("un livreur encore loin de son client ne reçoit pas la course à enchaîner", async () => {
    await db.systemConfig.updateMany({ data: { driverMaxCourses: 1 } }); // pas de « +1 course » : seul « à enchaîner » est en jeu
    const { sophie } = await livreurEnFinDeCourse("sophie");
    await db.courier.update({ where: { id: sophie.id }, data: { latitude: 48.9 } }); // à ~4 km du client
    const suivante = await course({ latitude: 48.87, longitude: 2.35 });

    expect(await DispatchService.proposerAuSuivant(suivante.id)).toBeNull();
    expect(await db.deliveryOffer.count({ where: { deliveryId: suivante.id } })).toBe(0);
  });

  it("commande refusée pendant la réservation : rien n'est attribué à la libération", async () => {
    const { sophie, enCours } = await livreurEnFinDeCourse("sophie");
    const suivante = await course({ latitude: 48.87, longitude: 2.35 });
    await DispatchService.proposerAuSuivant(suivante.id);
    const offre = await db.deliveryOffer.findFirstOrThrow({ where: { deliveryId: suivante.id } });
    await DispatchService.accepter(offre.id, sophie.id);

    await db.order.update({ where: { id: suivante.orderId }, data: { status: "REJECTED" } });
    await db.orderDelivery.update({ where: { id: enCours.id }, data: { status: "DELIVERED" } });
    await DispatchService.liberer(sophie.id);

    const apres = await db.orderDelivery.findUniqueOrThrow({ where: { id: suivante.id } });
    expect(apres).toMatchObject({ driverId: null, reservedDriverId: null });
    expect(await db.courier.findUniqueOrThrow({ where: { id: sophie.id } })).toMatchObject({ currentOrderId: null, isAvailable: true });
  });

  it("une réservation restée en plan depuis plus de 20 min est relâchée et la course repart en recherche", async () => {
    const { sophie } = await livreurEnFinDeCourse("sophie");
    const suivante = await course({ latitude: 48.87, longitude: 2.35 }, {
      reservedDriverId: sophie.id, reservedAt: new Date(Date.now() - 25 * 60000),
    });

    await DispatchService.solderReservations();

    expect(await db.orderDelivery.findUniqueOrThrow({ where: { id: suivante.id } })).toMatchObject({
      reservedDriverId: null, driverId: null, status: "PENDING",
    });
  });
});
