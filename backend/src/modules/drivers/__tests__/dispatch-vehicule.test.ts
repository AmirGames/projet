import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const db: any = {
  orderDelivery: { findUnique: jest.fn(), findMany: jest.fn() },
  deliveryOffer: { findFirst: jest.fn(), upsert: jest.fn() },
  courier: { findMany: jest.fn() },
  systemConfig: { findFirst: jest.fn() },
};
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../realtime/socket", () => ({ emitDeliveryUpdate: jest.fn(), emitDriverEvent: jest.fn() }));
jest.mock("../../notifications/notifier.service", () => ({
  Notifier: { pushLivreur: jest.fn(async () => true) },
  enArrierePlan: (envoi: Promise<unknown>) => envoi,
}));
import { DispatchService } from "../dispatch.service";

// Commerce à Paris ; client ~5,6 km au nord : trop loin pour un vélo (4 km),
// dans la limite d'un scooter (7 km) et d'une voiture (8 km).
const COMMERCE = { latitude: 48.85, longitude: 2.35 };
const CLIENT = { latitude: 48.9, longitude: 2.35 };

const course = (extra: Record<string, unknown> = {}) => ({
  id: "course-1",
  status: "PENDING",
  driverId: null,
  createdAt: new Date(),
  pickupLat: COMMERCE.latitude,
  pickupLng: COMMERCE.longitude,
  deliveryLat: CLIENT.latitude,
  deliveryLng: CLIENT.longitude,
  deliveryLatObfusquee: CLIENT.latitude,
  deliveryLngObfusquee: CLIENT.longitude,
  offers: [],
  order: { deliveryMode: "PLATFORM", feesAmount: 4, tipAmount: 0, store: { name: "Chez Zup" } },
  ...extra,
});

const livreur = (id: string, vehicleType: string, decalage = 0.001) => ({
  id,
  name: id,
  vehicleType,
  latitude: COMMERCE.latitude + decalage,
  longitude: COMMERCE.longitude,
  email: `${id}@zup.test`,
  user: null,
});

/** Les livreurs libres (currentOrderId: null) et ceux déjà en tournée ({ not: null }). */
function livreursEnLigne(libres: ReturnType<typeof livreur>[]) {
  db.courier.findMany.mockImplementation(async (args: any) => (args.where.currentOrderId === null ? libres : []));
}

beforeEach(() => {
  jest.clearAllMocks();
  db.systemConfig.findFirst.mockResolvedValue(null); // réglages par défaut : vélo 4, scooter 7, rayon 8, 180 s
  db.deliveryOffer.findFirst.mockResolvedValue(null);
  db.orderDelivery.findMany.mockResolvedValue([]);
  db.deliveryOffer.upsert.mockImplementation(async ({ create }: any) => ({ id: "offre-1", ...create }));
});

const proposeA = () => db.deliveryOffer.upsert.mock.calls[0]?.[0]?.create;

describe("distance de livraison selon le véhicule (attribution)", () => {
  it("une course de 5,6 km va au scooter plutôt qu'au vélo, même plus proche", async () => {
    db.orderDelivery.findUnique.mockResolvedValue(course());
    livreursEnLigne([livreur("velo", "bike", 0.0005), livreur("scooter", "scooter", 0.003)]);

    await DispatchService.proposerAuSuivant("course-1");

    expect(proposeA()).toMatchObject({ driverId: "scooter", horsLimite: false });
  });

  it("une course de 5,6 km n'est pas proposée à un vélo seul avant le délai si un scooter existe (mais occupé)", async () => {
    // Un scooter existe dans le secteur mais a déjà refusé : il est en attente de relance.
    db.orderDelivery.findUnique.mockResolvedValue(
      course({ offers: [{ driverId: "scooter", status: "DECLINED", attempts: 1, expiresAt: new Date(), respondedAt: new Date() }] })
    );
    livreursEnLigne([livreur("velo", "bike"), livreur("scooter", "scooter", 0.003)]);

    const res = await DispatchService.proposerAuSuivant("course-1");

    expect(res).toBeNull();
    expect(db.deliveryOffer.upsert).not.toHaveBeenCalled();
  });

  it("sans scooter ni voiture, la course s'ouvre au vélo, marquée hors limite", async () => {
    db.orderDelivery.findUnique.mockResolvedValue(course());
    livreursEnLigne([livreur("velo", "bike")]);

    await DispatchService.proposerAuSuivant("course-1");

    expect(proposeA()).toMatchObject({ driverId: "velo", horsLimite: true });
  });

  it("le délai écoulé ouvre aussi la course au vélo quand le scooter n'a pas répondu", async () => {
    db.orderDelivery.findUnique.mockResolvedValue(
      course({
        createdAt: new Date(Date.now() - 200 * 1000),
        offers: [{ driverId: "scooter", status: "DECLINED", attempts: 1, expiresAt: new Date(), respondedAt: new Date() }],
      })
    );
    livreursEnLigne([livreur("velo", "bike"), livreur("scooter", "scooter", 0.003)]);

    await DispatchService.proposerAuSuivant("course-1");

    expect(proposeA()).toMatchObject({ driverId: "velo", horsLimite: true });
  });

  it("une course courte reste proposée au plus proche, vélo compris, sans marque hors limite", async () => {
    db.orderDelivery.findUnique.mockResolvedValue(course({ deliveryLat: 48.875 })); // ~2,8 km
    livreursEnLigne([livreur("velo", "bike", 0.0005), livreur("scooter", "scooter", 0.003)]);

    await DispatchService.proposerAuSuivant("course-1");

    expect(proposeA()).toMatchObject({ driverId: "velo", horsLimite: false });
  });

  it("une course d'un scooter hors limite (au-delà de 7 km) passe d'abord à une voiture", async () => {
    db.orderDelivery.findUnique.mockResolvedValue(course({ deliveryLat: 48.9 + 0.025 })); // ~8,3 km
    db.systemConfig.findFirst.mockResolvedValue({
      driverBaseFee: 2.5, driverPerKmFee: 0.8, driverOfferSeconds: 30, driverMaxRadiusKm: 10,
      driverBikeMaxKm: 4, driverScooterMaxKm: 7, driverExceptionSeconds: 180,
      driverMaxCourses: 3, driverGroupClientKm: 2, driverGroupDetourKm: 2,
    });
    livreursEnLigne([livreur("scooter", "scooter", 0.0005), livreur("voiture", "car", 0.003)]);

    await DispatchService.proposerAuSuivant("course-1");

    expect(proposeA()).toMatchObject({ driverId: "voiture", horsLimite: false });
  });

  it("la voiture suit le réglage du site : plus de limite propre", async () => {
    db.orderDelivery.findUnique.mockResolvedValue(course());
    livreursEnLigne([livreur("voiture", "car")]);

    await DispatchService.proposerAuSuivant("course-1");

    expect(proposeA()).toMatchObject({ driverId: "voiture", horsLimite: false });
  });

  it("le commerçant ne peut pas désigner un vélo pour 5,6 km tant qu'un véhicule adapté existe", async () => {
    db.orderDelivery.findUnique.mockResolvedValue(course());
    livreursEnLigne([livreur("velo", "bike"), livreur("scooter", "scooter", 0.003)]);

    await expect(DispatchService.proposerAuSuivant("course-1", "velo")).rejects.toMatchObject({
      statusCode: 409,
      code: "VEHICLE_TOO_LIMITED",
    });
    expect(db.deliveryOffer.upsert).not.toHaveBeenCalled();
  });

  it("une adresse sans coordonnées n'écarte aucun véhicule", async () => {
    db.orderDelivery.findUnique.mockResolvedValue(course({ deliveryLat: null, deliveryLng: null }));
    livreursEnLigne([livreur("velo", "bike")]);

    await DispatchService.proposerAuSuivant("course-1");

    expect(proposeA()).toMatchObject({ driverId: "velo", horsLimite: false });
  });
});
