import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const tx: any = {
  courier: { findUnique: jest.fn(), update: jest.fn() },
  orderDelivery: { count: jest.fn(), updateMany: jest.fn() },
  deliveryOffer: { updateMany: jest.fn() },
};
const db: any = {
  $transaction: jest.fn(),
  orderDelivery: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), updateMany: jest.fn(), findUniqueOrThrow: jest.fn() },
  deliveryOffer: { findFirst: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
  courier: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  systemConfig: { findFirst: jest.fn() },
};
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
const socket = { emitDeliveryUpdate: jest.fn(), emitDriverEvent: jest.fn() };
jest.mock("../../realtime/socket", () => socket);
const notifier = {
  pushLivreur: jest.fn(async () => true),
  etapeLivraisonClient: jest.fn(async (..._args: unknown[]) => undefined),
  livreurTrouveBoutique: jest.fn(async (..._args: unknown[]) => undefined),
};
jest.mock("../../notifications/notifier.service", () => ({ Notifier: notifier, enArrierePlan: (p: Promise<unknown>) => p }));
import { DispatchService } from "../dispatch.service";

const COMMERCE = { latitude: 48.85, longitude: 2.35 };
// Le client que le livreur « bientôt libre » est en train de livrer, à ~1,1 km du nouveau commerce.
const CLIENT_EN_COURS = { latitude: 48.86, longitude: 2.35 };

const course = (extra: Record<string, unknown> = {}) => ({
  id: "course-2",
  status: "PENDING",
  driverId: null,
  reservedDriverId: null,
  createdAt: new Date(),
  pickupLat: COMMERCE.latitude,
  pickupLng: COMMERCE.longitude,
  deliveryLat: 48.87,
  deliveryLng: 2.35, // ~2,2 km : à la portée de tous les véhicules
  deliveryLatObfusquee: 48.87,
  deliveryLngObfusquee: 2.35,
  offers: [],
  order: { deliveryMode: "PLATFORM", feesAmount: 4, tipAmount: 0, store: { name: "Chez Zup" } },
  ...extra,
});

const livreurLibre = (id: string) => ({ id, name: id, vehicleType: "scooter", latitude: 48.8505, longitude: 2.35, email: `${id}@z.t`, user: null });
const livreurEnFinDeCourse = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: id,
  vehicleType: "scooter",
  latitude: 48.859, // à ~100 m du client qu'il livre
  longitude: 2.35,
  email: `${id}@z.t`,
  user: null,
  deliveries: [
    {
      status: "PICKED_UP",
      deliveryLat: CLIENT_EN_COURS.latitude,
      deliveryLng: CLIENT_EN_COURS.longitude,
      nearCustomerNotifiedAt: null,
      customerWaitStartedAt: null,
      customerWaitLeftAt: null,
    },
  ],
  ...extra,
});

/** Trois requêtes sur les livreurs : libres, en tournée (ajout), bientôt libres. */
function livreurs({ libres = [], bientot = [] }: { libres?: any[]; bientot?: any[] }) {
  db.courier.findMany.mockImplementation(async (args: any) => {
    if (args.where.currentOrderId === null) return libres;
    // La requête « bientôt libres » exclut des ids ; celle de la tournée (ajout) non.
    return args.where.id ? bientot : [];
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  db.systemConfig.findFirst.mockResolvedValue(null);
  db.deliveryOffer.findFirst.mockResolvedValue(null);
  db.orderDelivery.findMany.mockResolvedValue([]);
  db.orderDelivery.count.mockResolvedValue(0);
  db.deliveryOffer.upsert.mockImplementation(async ({ create }: any) => ({ id: "offre-2", expiresAt: new Date(Date.now() + 30000), ...create }));
  db.$transaction.mockImplementation(async (cb: any) => cb(tx));
  tx.courier.findUnique.mockResolvedValue({ status: "ACTIVE" });
  tx.orderDelivery.count.mockResolvedValue(1);
  tx.orderDelivery.updateMany.mockResolvedValue({ count: 1 });
  tx.deliveryOffer.updateMany.mockResolvedValue({ count: 1 });
});

const offre = () => db.deliveryOffer.upsert.mock.calls[0]?.[0]?.create;

describe("proposition à un livreur bientôt libre", () => {
  it("sans livreur libre, la course est proposée à celui qui termine sa livraison", async () => {
    db.orderDelivery.findUnique.mockResolvedValue(course());
    livreurs({ bientot: [livreurEnFinDeCourse("sophie")] });

    await DispatchService.proposerAuSuivant("course-2");

    expect(offre()).toMatchObject({ driverId: "sophie", bientotLibre: true, ajout: false, batchId: null });
    expect(offre().libreDansSecondes).toBeGreaterThanOrEqual(0);
    expect(socket.emitDriverEvent).toHaveBeenCalledWith("sophie@z.t", "course-proposee", expect.objectContaining({ bientotLibre: true }));
  });

  it("un livreur libre passe avant un livreur bientôt libre", async () => {
    db.orderDelivery.findUnique.mockResolvedValue(course());
    livreurs({ libres: [livreurLibre("paul")], bientot: [livreurEnFinDeCourse("sophie")] });

    await DispatchService.proposerAuSuivant("course-2");

    expect(offre()).toMatchObject({ driverId: "paul", bientotLibre: false });
  });

  it("un livreur libre très loin passe après un livreur qui termine tout près : on classe par heure d'arrivée", async () => {
    db.orderDelivery.findUnique.mockResolvedValue(course());
    // Paul est libre mais à ~6 km du commerce (dans le rayon de 8 km) ; Sophie se libère dans ~1 min, à ~1 km.
    livreurs({ libres: [{ ...livreurLibre("paul"), latitude: 48.9 }], bientot: [livreurEnFinDeCourse("sophie")] });

    await DispatchService.proposerAuSuivant("course-2");

    expect(offre()).toMatchObject({ driverId: "sophie", bientotLibre: true });
  });

  it("un livreur libre tout près du commerce passe avant un livreur qui se libère", async () => {
    db.orderDelivery.findUnique.mockResolvedValue(course());
    // Paul libre, juste à côté du commerce : bien avant Sophie.
    livreurs({ libres: [livreurLibre("paul")], bientot: [livreurEnFinDeCourse("sophie")] });

    await DispatchService.proposerAuSuivant("course-2");

    expect(offre()).toMatchObject({ driverId: "paul", bientotLibre: false });
  });

  it("un livreur encore loin de son client n'est pas proposé", async () => {
    db.orderDelivery.findUnique.mockResolvedValue(course());
    livreurs({ bientot: [livreurEnFinDeCourse("loin", { latitude: 48.9 })] });

    const res = await DispatchService.proposerAuSuivant("course-2");

    expect(res).toBeNull();
    expect(db.deliveryOffer.upsert).not.toHaveBeenCalled();
  });

  it("un livreur avec plusieurs clients à remettre n'est pas proposé", async () => {
    const deux = livreurEnFinDeCourse("occupe");
    deux.deliveries.push({ ...deux.deliveries[0] });
    db.orderDelivery.findUnique.mockResolvedValue(course());
    livreurs({ bientot: [deux] });

    expect(await DispatchService.proposerAuSuivant("course-2")).toBeNull();
  });

  it("un livreur qui a déjà une course réservée n'en reçoit pas une deuxième", async () => {
    db.orderDelivery.findUnique.mockResolvedValue(course());
    db.orderDelivery.findMany.mockImplementation(async (args: any) =>
      args.where.reservedDriverId ? [{ reservedDriverId: "sophie" }] : []
    );
    livreurs({ bientot: [livreurEnFinDeCourse("sophie")] });

    // La requête filtre par id : le mock rend sophie quand même, comme si le filtre avait échoué.
    // On vérifie donc que l'id est bien exclu dans la requête.
    await DispatchService.proposerAuSuivant("course-2");
    const requete = db.courier.findMany.mock.calls.map((c: any) => c[0]).find((a: any) => a.where.id && a.where.currentOrderId !== null);
    expect(requete.where.id.notIn).toContain("sophie");
  });

  it("une course déjà réservée n'est proposée à personne d'autre", async () => {
    db.orderDelivery.findUnique.mockResolvedValue(course({ reservedDriverId: "sophie" }));
    livreurs({ libres: [livreurLibre("paul")] });

    expect(await DispatchService.proposerAuSuivant("course-2")).toBeNull();
    expect(db.deliveryOffer.upsert).not.toHaveBeenCalled();
  });

  it("réglages à 0 et 0 : on ne cherche pas de livreur bientôt libre", async () => {
    db.systemConfig.findFirst.mockResolvedValue({
      driverBaseFee: 2.5, driverPerKmFee: 0.8, driverOfferSeconds: 30, driverMaxRadiusKm: 8,
      driverBikeMaxKm: 4, driverScooterMaxKm: 7, driverExceptionSeconds: 180,
      driverSoonFreeKm: 0, driverSoonFreeSeconds: 0,
      driverMaxCourses: 3, driverGroupClientKm: 2, driverGroupDetourKm: 2,
    });
    db.orderDelivery.findUnique.mockResolvedValue(course());
    livreurs({ bientot: [livreurEnFinDeCourse("sophie")] });

    expect(await DispatchService.proposerAuSuivant("course-2")).toBeNull();
  });
});

describe("réservation et activation", () => {
  const proposition = (extra: Record<string, unknown> = {}) => ({
    id: "offre-2", deliveryId: "course-2", driverId: "sophie", status: "PENDING", bientotLibre: true,
    expiresAt: new Date(Date.now() + 30000), batchId: null, distanceKm: 2.2, payout: 4,
    delivery: { driverId: null, orderId: "cmd-2" }, ...extra,
  });

  it("accepter une course à enchaîner la réserve sans l'attribuer ni toucher à la tournée", async () => {
    db.deliveryOffer.findUnique.mockResolvedValue(proposition());
    // Il a encore sa livraison en cours : l'activation ne fait rien.
    db.orderDelivery.count.mockResolvedValue(1);
    tx.orderDelivery.count.mockImplementation(async (a: any) => (a.where.reservedDriverId ? 0 : 1));
    db.orderDelivery.findUniqueOrThrow.mockResolvedValue({ id: "course-2", driverId: null, status: "PENDING", deliveryCode: "1234", deliveryLat: 48.87, deliveryLng: 2.35 });

    const res: any = await DispatchService.accepter("offre-2", "sophie");

    expect(tx.orderDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "course-2", driverId: null, status: "PENDING", reservedDriverId: null },
        data: expect.objectContaining({ reservedDriverId: "sophie", driverPayout: 4, distanceKm: 2.2 }),
      })
    );
    // Pas d'attribution, pas de changement d'état du livreur : sa livraison en cours reste intacte.
    expect(tx.orderDelivery.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "ACCEPTED" }) }));
    expect(tx.courier.update).not.toHaveBeenCalled();
    expect(socket.emitDeliveryUpdate).not.toHaveBeenCalled();
    expect(res.reservee).toBe(true);
    // Ni le code de remise ni les coordonnées exactes du client avant l'attribution.
    expect(res).not.toHaveProperty("deliveryCode");
    expect(res).not.toHaveProperty("deliveryLat");
  });

  it("une deuxième réservation est refusée", async () => {
    db.deliveryOffer.findUnique.mockResolvedValue(proposition());
    tx.orderDelivery.count.mockImplementation(async (a: any) => (a.where.reservedDriverId ? 1 : 1));

    await expect(DispatchService.accepter("offre-2", "sophie")).rejects.toMatchObject({ code: "ALREADY_RESERVED" });
  });

  it("une réservation concurrente ne peut pas écraser la première", async () => {
    db.deliveryOffer.findUnique.mockResolvedValue(proposition());
    tx.orderDelivery.count.mockImplementation(async (a: any) => (a.where.reservedDriverId ? 0 : 1));
    tx.orderDelivery.updateMany.mockResolvedValue({ count: 0 });

    await expect(DispatchService.accepter("offre-2", "sophie")).rejects.toMatchObject({ code: "ALREADY_ASSIGNED" });
    expect(tx.deliveryOffer.updateMany).not.toHaveBeenCalled();
  });

  it("libérée, la course réservée lui est attribuée et le client est prévenu", async () => {
    db.orderDelivery.count.mockResolvedValue(0);
    db.orderDelivery.findFirst.mockResolvedValue({ id: "course-2", orderId: "cmd-2", order: { status: "PREPARING" } });
    db.courier.findUnique.mockResolvedValue({ status: "ACTIVE", isOnline: true });

    const id = await DispatchService.activerReservation("sophie");

    expect(id).toBe("course-2");
    expect(tx.orderDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "course-2", driverId: null, status: "PENDING", reservedDriverId: "sophie" },
        data: expect.objectContaining({ driverId: "sophie", status: "ACCEPTED", reservedDriverId: null }),
      })
    );
    expect(tx.courier.update).toHaveBeenCalledWith({ where: { id: "sophie" }, data: { currentOrderId: "course-2", isAvailable: false } });
    expect(socket.emitDeliveryUpdate).toHaveBeenCalledWith("cmd-2", { status: "ACCEPTED" });
    expect(notifier.livreurTrouveBoutique).toHaveBeenCalledWith("cmd-2");
  });

  it("tant qu'il a une livraison en cours, rien n'est attribué", async () => {
    db.orderDelivery.count.mockResolvedValue(1);

    expect(await DispatchService.activerReservation("sophie")).toBeNull();
    expect(db.orderDelivery.findFirst).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("sans réservation, rien ne se passe", async () => {
    db.orderDelivery.count.mockResolvedValue(0);
    db.orderDelivery.findFirst.mockResolvedValue(null);

    expect(await DispatchService.activerReservation("sophie")).toBeNull();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("commande annulée entre-temps : la réservation tombe, personne n'est assigné", async () => {
    db.orderDelivery.count.mockResolvedValue(0);
    db.orderDelivery.findFirst.mockResolvedValue({ id: "course-2", orderId: "cmd-2", order: { status: "CANCELLED" } });
    db.courier.findUnique.mockResolvedValue({ status: "ACTIVE", isOnline: true });

    expect(await DispatchService.activerReservation("sophie")).toBeNull();
    expect(db.orderDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { reservedDriverId: null, reservedAt: null } })
    );
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("livreur hors ligne en se libérant : la réservation tombe, la course repart en recherche", async () => {
    db.orderDelivery.count.mockResolvedValue(0);
    db.orderDelivery.findFirst.mockResolvedValue({ id: "course-2", orderId: "cmd-2", order: { status: "PREPARING" } });
    db.courier.findUnique.mockResolvedValue({ status: "ACTIVE", isOnline: false });

    expect(await DispatchService.activerReservation("sophie")).toBeNull();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("une attribution déjà faite n'est pas refaite (idempotent)", async () => {
    db.orderDelivery.count.mockResolvedValue(0);
    db.orderDelivery.findFirst.mockResolvedValue({ id: "course-2", orderId: "cmd-2", order: { status: "PREPARING" } });
    db.courier.findUnique.mockResolvedValue({ status: "ACTIVE", isOnline: true });
    tx.orderDelivery.updateMany.mockResolvedValue({ count: 0 });

    expect(await DispatchService.activerReservation("sophie")).toBeNull();
    expect(socket.emitDeliveryUpdate).not.toHaveBeenCalled();
    expect(tx.courier.update).not.toHaveBeenCalled();
  });

  it("liberer démarre la course réservée quand il ne lui reste rien d'autre", async () => {
    const activer = jest.spyOn(DispatchService, "activerReservation").mockResolvedValue("course-2");
    jest.spyOn(DispatchService, "coursesActives").mockResolvedValue([]);

    await DispatchService.liberer("sophie");

    expect(db.courier.update).toHaveBeenCalledWith({ where: { id: "sophie" }, data: { currentOrderId: null, isAvailable: true } });
    expect(activer).toHaveBeenCalledWith("sophie");
  });

  it("liberer n'active rien s'il reste une course dans la tournée", async () => {
    const activer = jest.spyOn(DispatchService, "activerReservation").mockResolvedValue(null);
    jest.spyOn(DispatchService, "coursesActives").mockResolvedValue([{ id: "autre" }] as any);

    await DispatchService.liberer("sophie");

    expect(activer).not.toHaveBeenCalled();
  });

  it("un échec d'activation ne défait pas la livraison terminée", async () => {
    jest.spyOn(DispatchService, "activerReservation").mockRejectedValue(new Error("base indisponible"));
    jest.spyOn(DispatchService, "coursesActives").mockResolvedValue([]);

    await expect(DispatchService.liberer("sophie")).resolves.toBe(0);
  });

  it("une réservation de plus de 20 minutes qui n'aboutit pas est relâchée", async () => {
    db.orderDelivery.findMany.mockResolvedValue([
      { id: "course-2", status: "PENDING", reservedDriverId: "sophie", reservedAt: new Date(Date.now() - 25 * 60000) },
    ]);
    jest.spyOn(DispatchService, "activerReservation").mockResolvedValue(null);

    await DispatchService.solderReservations();

    expect(db.orderDelivery.updateMany).toHaveBeenCalledWith({
      where: { id: "course-2", reservedDriverId: "sophie", driverId: null },
      data: { reservedDriverId: null, reservedAt: null },
    });
  });

  it("une réservation récente est conservée", async () => {
    db.orderDelivery.findMany.mockResolvedValue([
      { id: "course-2", status: "PENDING", reservedDriverId: "sophie", reservedAt: new Date(Date.now() - 2 * 60000) },
    ]);
    jest.spyOn(DispatchService, "activerReservation").mockResolvedValue(null);

    await DispatchService.solderReservations();

    expect(db.orderDelivery.updateMany).not.toHaveBeenCalled();
  });

  it("une réservation sur une course annulée est effacée", async () => {
    db.orderDelivery.findMany.mockResolvedValue([
      { id: "course-2", status: "CANCELLED", reservedDriverId: "sophie", reservedAt: new Date() },
    ]);

    await DispatchService.solderReservations();

    expect(db.orderDelivery.updateMany).toHaveBeenCalledWith({
      where: { id: "course-2", reservedDriverId: "sophie" },
      data: { reservedDriverId: null, reservedAt: null },
    });
  });
});
