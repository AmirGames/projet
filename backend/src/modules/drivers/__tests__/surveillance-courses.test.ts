import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const tx: any = {
  orderDelivery: { updateMany: jest.fn() },
  order: { updateMany: jest.fn(async () => ({ count: 1 })) },
  deliveryOffer: { updateMany: jest.fn() },
  deliveryIncident: { createMany: jest.fn(), updateMany: jest.fn() },
};
const db: any = {
  orderDelivery: { findMany: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
  deliveryIncident: { createMany: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  order: { findUnique: jest.fn() },
  courier: { findUnique: jest.fn() },
  membership: { findMany: jest.fn(async () => []) },
  notification: { create: jest.fn(async () => ({})) },
  $transaction: jest.fn(async (fn: any) => fn(tx)),
};

jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../../realtime/socket", () => ({
  emitDeliveryUpdate: jest.fn(),
  emitDriverEvent: jest.fn(),
  emitMerchantEvent: jest.fn(async () => undefined),
  emitNotification: jest.fn(),
  emitSupportEvent: jest.fn(),
  emitOrderUpdate: jest.fn(),
}));
jest.mock("../../notifications/notifier.service", () => ({
  Notifier: {
    pushLivreur: jest.fn(async () => true),
    pushClient: jest.fn(async () => 0),
    pushEquipeBoutique: jest.fn(async () => 0),
    email: jest.fn(async () => true),
  },
  enArrierePlan: (envoi: Promise<unknown>) => envoi,
}));
jest.mock("../../orders/suivi-commande.service", () => ({ lienDeSuivi: jest.fn(async () => "https://suivi") }));
jest.mock("../../monitoring/vigie.service", () => ({ prevenirPlateforme: jest.fn(async () => undefined) }));
jest.mock("../dispatch.service", () => ({
  STATUTS_EN_COURSE: ["ACCEPTED", "PICKED_UP"],
  MAX_SOLLICITATIONS: 3,
  DispatchService: {
    reglages: jest.fn(async () => ({ maxRadiusKm: 8 })),
    liberer: jest.fn(async () => 0),
    proposerAuSuivant: jest.fn(async () => null),
  },
}));
jest.mock("../driver-availability.service", () => ({ GPS_PERDU_APRES_MS: 2 * 60000 }));
jest.mock("../delivery-proof.service", () => ({ ATTENTE_CLIENT_MS: 6 * 60000 }));
jest.mock("../driver-approval.service", () => ({ DriverApprovalService: { ecarter: jest.fn(async () => ({})) } }));
jest.mock("../../webhooks/webhook.service", () => ({ emitWebhook: jest.fn() }));
jest.mock("../../orders/order-acceptance.service", () => ({ MOTIF_LIVRAISON_ECHOUEE: "DELIVERY_FAILED" }));
jest.mock("../../payments/payment.service", () => ({
  paymentService: { rembourserCommande: jest.fn(async () => ({ id: "re_1" })) },
}));

import {
  SEUILS_COURSE,
  SurveillanceCoursesService,
  delaiLivraisonMin,
  evaluerCourse,
  type CourseSurveillee,
} from "../surveillance-courses.service";
import { DispatchService } from "../dispatch.service";
import { DriverApprovalService } from "../driver-approval.service";
import { paymentService } from "../../payments/payment.service";
import { Notifier } from "../../notifications/notifier.service";
import { emitDriverEvent } from "../../realtime/socket";
import { prevenirPlateforme } from "../../monitoring/vigie.service";

const MIN = 60000;
const maintenant = new Date("2026-10-01T12:00:00Z");
const ilYa = (minutes: number) => new Date(maintenant.getTime() - minutes * MIN);

// Un commerce à Paris, un client à ~2,2 km au nord.
const commerce = { latitude: 48.8566, longitude: 2.3522 };
const client = { latitude: 48.8766, longitude: 2.3522 };

function course(extra: Partial<CourseSurveillee> = {}): CourseSurveillee {
  return {
    status: "ACCEPTED",
    assignedAt: ilYa(5),
    pickupTime: null,
    pickupLat: commerce.latitude,
    pickupLng: commerce.longitude,
    deliveryLat: client.latitude,
    deliveryLng: client.longitude,
    driftStartedAt: null,
    customerWaitStartedAt: null,
    commandePrete: true,
    autresRemises: 0,
    ...extra,
  };
}

/** Un point à `km` kilomètres au sud du commerce (1° de latitude ≈ 111 km). */
const auSud = (km: number) => ({ latitude: commerce.latitude - km / 111.2, longitude: commerce.longitude });

describe("delaiLivraisonMin", () => {
  it("accorde au moins une demi-heure", () => {
    expect(delaiLivraisonMin(2)).toBe(30);
    expect(delaiLivraisonMin(null)).toBe(30);
  });

  it("allonge le délai pour un long trajet, et pour chaque autre remise de la tournée", () => {
    expect(delaiLivraisonMin(10)).toBe(50);
    expect(delaiLivraisonMin(2, 2)).toBe(30 + 2 * SEUILS_COURSE.minutesParAutreRemise);
  });
});

describe("evaluerCourse : commande encore au commerce", () => {
  it("ne dit rien à un livreur dans les temps", () => {
    expect(evaluerCourse(course(), auSud(3), maintenant, 8).constats).toEqual([]);
  });

  it("avertit le livreur à 20 minutes, sans lui retirer la course", () => {
    const { constats } = evaluerCourse(course({ assignedAt: ilYa(21) }), auSud(3), maintenant, 8);
    expect(constats).toEqual([expect.objectContaining({ type: "RETARD_RETRAIT", action: "AVERTIR" })]);
  });

  it("retire la course à 30 minutes s'il n'est toujours pas au commerce", () => {
    const { constats } = evaluerCourse(course({ assignedAt: ilYa(31) }), auSud(3), maintenant, 8);
    expect(constats).toEqual([expect.objectContaining({ type: "RETARD_RETRAIT", action: "RETIRER" })]);
  });

  it("retire aussi quand on ne sait pas où il est (signal perdu)", () => {
    const { constats } = evaluerCourse(course({ assignedAt: ilYa(31) }), null, maintenant, 8);
    expect(constats[0]).toMatchObject({ action: "RETIRER", distanceKm: null });
  });

  it("ne touche pas à un livreur au commerce, même tard : il attend la commande", () => {
    const { constats } = evaluerCourse(course({ assignedAt: ilYa(60) }), auSud(0.1), maintenant, 8);
    expect(constats).toEqual([]);
  });

  it("laisse patienter un livreur tout proche tant que la commande n'est pas prête", () => {
    const { constats } = evaluerCourse(
      course({ assignedAt: ilYa(45), commandePrete: false }),
      auSud(1.5),
      maintenant,
      8
    );
    expect(constats).toEqual([]);
  });

  it("signale un écart au-delà du rayon d'attribution + 3 km, sans rien faire la première minute", () => {
    const resultat = evaluerCourse(course(), auSud(12), maintenant, 8);
    expect(resultat.ecart).toBe(true);
    expect(resultat.constats).toEqual([]);
  });

  it("avertit après 5 minutes d'écart, retire après 10", () => {
    const avertir = evaluerCourse(course({ driftStartedAt: ilYa(6) }), auSud(12), maintenant, 8);
    expect(avertir.constats).toEqual([expect.objectContaining({ type: "ECART_RETRAIT", action: "AVERTIR" })]);

    const retirer = evaluerCourse(course({ driftStartedAt: ilYa(11) }), auSud(12), maintenant, 8);
    expect(retirer.constats).toEqual([expect.objectContaining({ type: "ECART_RETRAIT", action: "RETIRER" })]);
  });

  it("efface l'écart quand le livreur revient vers le commerce", () => {
    expect(evaluerCourse(course({ driftStartedAt: ilYa(6) }), auSud(4), maintenant, 8).ecart).toBe(false);
  });
});

describe("evaluerCourse : commande dans le sac", () => {
  const enRoute = (extra: Partial<CourseSurveillee> = {}) =>
    course({ status: "PICKED_UP", assignedAt: ilYa(40), pickupTime: ilYa(10), ...extra });

  it("ne dit rien à un livreur sur son trajet et dans les temps", () => {
    const milieu = { latitude: 48.8666, longitude: 2.3522 };
    expect(evaluerCourse(enRoute(), milieu, maintenant, 8)).toEqual({ ecart: false, ecartKm: null, constats: [] });
  });

  it("alerte une demi-heure après la récupération, sans retirer la course", () => {
    const { constats } = evaluerCourse(enRoute({ pickupTime: ilYa(31) }), client, maintenant, 8);
    expect(constats).toEqual([expect.objectContaining({ type: "RETARD_LIVRAISON", action: "ALERTER" })]);
  });

  it("compte depuis la récupération, pas depuis l'acceptation", () => {
    const { constats } = evaluerCourse(enRoute({ assignedAt: ilYa(90), pickupTime: ilYa(5) }), client, maintenant, 8);
    expect(constats).toEqual([]);
  });

  it("alerte un livreur hors de son trajet depuis 5 minutes", () => {
    const loin = auSud(6);
    expect(evaluerCourse(enRoute(), loin, maintenant, 8).constats).toEqual([]);

    const { constats, ecartKm } = evaluerCourse(enRoute({ driftStartedAt: ilYa(6) }), loin, maintenant, 8);
    expect(ecartKm).toBeGreaterThan(SEUILS_COURSE.ecartLivraisonKm);
    expect(constats).toEqual([expect.objectContaining({ type: "ECART_LIVRAISON", action: "ALERTER" })]);
  });

  it("laisse tranquille le livreur qui attend le client à sa porte", () => {
    const { constats } = evaluerCourse(
      enRoute({ pickupTime: ilYa(50), customerWaitStartedAt: ilYa(2) }),
      client,
      maintenant,
      8
    );
    expect(constats).toEqual([]);
  });

  it("ne couvre plus par l'attente un livreur reparti loin de chez le client", () => {
    const attente = enRoute({ customerWaitStartedAt: ilYa(8) });
    const loin = auSud(1); // ~3 km du client, sur le trajet du commerce

    const premier = evaluerCourse(attente, loin, maintenant, 8);
    expect(premier.ecart).toBe(true);
    expect(premier.constats).toEqual([]);

    const { constats } = evaluerCourse({ ...attente, driftStartedAt: ilYa(6) }, loin, maintenant, 8);
    expect(constats).toEqual([
      expect.objectContaining({ type: "ECART_LIVRAISON", action: "ALERTER", detail: expect.stringContaining("pendant l'attente") }),
    ]);
  });

  it("laisse au livreur sans position le temps de l'attente, puis applique le délai", () => {
    const sansPosition = enRoute({ pickupTime: ilYa(40), customerWaitStartedAt: ilYa(10) });
    expect(evaluerCourse(sansPosition, null, maintenant, 8).constats).toEqual([]);

    const tropLongtemps = enRoute({ pickupTime: ilYa(40), customerWaitStartedAt: ilYa(20) });
    expect(evaluerCourse(tropLongtemps, null, maintenant, 8).constats).toEqual([
      expect.objectContaining({ type: "RETARD_LIVRAISON" }),
    ]);
  });
});

describe("SurveillanceCoursesService", () => {
  const livreur = {
    id: "livreur-1",
    name: "Karim B.",
    email: "karim@exemple.be",
    latitude: auSud(3).latitude,
    longitude: auSud(3).longitude,
    lastLocationUpdate: new Date(),
    gpsLostAt: null,
    user: { email: "karim@exemple.be" },
  };
  const ligne = (extra: Record<string, unknown> = {}) => ({
    id: "course-1",
    orderId: "commande-abcdef",
    status: "ACCEPTED",
    driverId: livreur.id,
    assignedAt: new Date(Date.now() - 31 * MIN),
    pickupTime: null,
    pickupLat: commerce.latitude,
    pickupLng: commerce.longitude,
    deliveryLat: client.latitude,
    deliveryLng: client.longitude,
    driftStartedAt: null,
    customerWaitStartedAt: null,
    order: {
      status: "READY",
      storeId: "boutique-1",
      customerEmail: "client@exemple.be",
      store: { name: "Chez Nour", orgId: "org-1" },
    },
    driver: livreur,
    ...extra,
  });

  beforeEach(() => {
    db.deliveryIncident.findMany.mockResolvedValue([]);
    tx.orderDelivery.updateMany.mockResolvedValue({ count: 1 });
    tx.deliveryOffer.updateMany.mockResolvedValue({ count: 1 });
    tx.deliveryIncident.createMany.mockResolvedValue({ count: 1 });
    tx.deliveryIncident.updateMany.mockResolvedValue({ count: 0 });
  });

  it("retire la course d'un livreur qui ne vient pas, et la rend à la recherche", async () => {
    const c = ligne();
    db.orderDelivery.findMany.mockResolvedValue([c]);
    db.orderDelivery.findUnique.mockResolvedValue(c);

    const bilan = await SurveillanceCoursesService.surveiller();

    expect(bilan.retirees).toBe(1);
    // Sous condition : même livreur, même attribution, toujours au commerce.
    expect(tx.orderDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "course-1", driverId: "livreur-1", assignedAt: c.assignedAt, status: "ACCEPTED" },
        data: expect.objectContaining({ status: "PENDING", driverId: null, cancelledBy: "SYSTEM" }),
      })
    );
    // Il ne la reçoit plus d'office.
    expect(tx.deliveryOffer.updateMany).toHaveBeenCalledWith({
      where: { deliveryId: "course-1", driverId: "livreur-1" },
      data: { attempts: 3 },
    });
    expect(DispatchService.liberer).toHaveBeenCalledWith("livreur-1");
    expect(DispatchService.proposerAuSuivant).toHaveBeenCalledWith("course-1");
    expect(emitDriverEvent).toHaveBeenCalledWith("karim@exemple.be", "course-retiree", expect.anything());
  });

  it("ne retire rien si la course a bougé entre-temps (récupérée, déjà retirée)", async () => {
    const c = ligne();
    db.orderDelivery.findMany.mockResolvedValue([c]);
    db.orderDelivery.findUnique.mockResolvedValue(c);
    tx.orderDelivery.updateMany.mockResolvedValue({ count: 0 });

    const bilan = await SurveillanceCoursesService.surveiller();

    expect(bilan.retirees).toBe(0);
    expect(tx.deliveryOffer.updateMany).not.toHaveBeenCalled();
    expect(DispatchService.liberer).not.toHaveBeenCalled();
    expect(DispatchService.proposerAuSuivant).not.toHaveBeenCalled();
  });

  it("n'avertit le livreur qu'une fois par attribution, passage après passage", async () => {
    db.orderDelivery.findMany.mockResolvedValue([ligne({ assignedAt: new Date(Date.now() - 22 * MIN) })]);
    db.deliveryIncident.createMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    await SurveillanceCoursesService.surveiller();
    await SurveillanceCoursesService.surveiller();

    expect(db.deliveryIncident.createMany).toHaveBeenCalledTimes(2);
    expect(Notifier.pushLivreur).toHaveBeenCalledTimes(1);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("alerte la plateforme d'une livraison en retard, sans retirer la course", async () => {
    db.orderDelivery.findMany.mockResolvedValue([
      ligne({
        status: "PICKED_UP",
        pickupTime: new Date(Date.now() - 35 * MIN),
        driver: { ...livreur, latitude: client.latitude, longitude: client.longitude },
      }),
    ]);
    db.deliveryIncident.createMany.mockResolvedValue({ count: 1 });

    const bilan = await SurveillanceCoursesService.surveiller();
    await new Promise((r) => setImmediate(r));

    expect(bilan).toMatchObject({ alertes: 1, retirees: 0 });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(prevenirPlateforme).toHaveBeenCalledWith(
      expect.objectContaining({ chemin: "/superowner/incidents-livraison" })
    );
    expect(Notifier.pushClient).toHaveBeenCalled();
  });

  it("referme les constats d'une course livrée ou passée à un autre livreur", async () => {
    db.orderDelivery.findMany.mockResolvedValue([]);
    const assignedAt = new Date("2026-10-01T11:00:00Z");
    db.deliveryIncident.findMany.mockResolvedValue([
      { id: "i1", driverId: "l1", assignedAt, delivery: { status: "DELIVERED", driverId: "l1", assignedAt } },
      { id: "i2", driverId: "l1", assignedAt, delivery: { status: "ACCEPTED", driverId: "l2", assignedAt: new Date() } },
      { id: "i3", driverId: "l1", assignedAt, delivery: { status: "PICKED_UP", driverId: "l1", assignedAt } },
    ]);
    db.deliveryIncident.updateMany.mockResolvedValue({ count: 1 });

    const bilan = await SurveillanceCoursesService.surveiller();

    expect(bilan.closes).toBe(2);
    const fermes = db.deliveryIncident.updateMany.mock.calls.map((appel: any) => appel[0].where.id);
    expect(fermes).toEqual(["i1", "i2"]);
  });

  it("refuse de retirer une course déjà récupérée : il faut la déclarer échouée", async () => {
    db.orderDelivery.findUnique.mockResolvedValue(ligne({ status: "PICKED_UP" }));
    await expect(
      SurveillanceCoursesService.retirerCourse("course-1", { par: { userId: "admin" }, motif: "injoignable" })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("refuse de déclarer échouée une course encore au commerce", async () => {
    db.orderDelivery.findUnique.mockResolvedValue(ligne());
    await expect(
      SurveillanceCoursesService.declarerEchec("course-1", { par: { userId: "admin" }, motif: "injoignable" })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("déclare échouée une course en route : le livreur est libéré, la course n'est pas rendue", async () => {
    db.orderDelivery.findUnique.mockResolvedValue(ligne({ status: "PICKED_UP", pickupTime: new Date() }));

    await SurveillanceCoursesService.declarerEchec("course-1", { par: { userId: "admin" }, motif: "injoignable" });

    expect(tx.orderDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "PICKED_UP", driverId: "livreur-1" }),
        data: expect.objectContaining({ status: "FAILED", cancelledBy: "PLATFORM" }),
      })
    );
    expect(DispatchService.liberer).toHaveBeenCalledWith("livreur-1");
    expect(DispatchService.proposerAuSuivant).not.toHaveBeenCalled();
    // La commande est annulée, motif « livraison échouée », sans le motif interne.
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: "commande-abcdef", status: { in: ["ACCEPTED", "PREPARING", "READY"] } },
      data: expect.objectContaining({ status: "REJECTED", rejectionReason: "DELIVERY_FAILED", rejectionNote: null }),
    });
  });

  describe("relances", () => {
    const ouvert = (extra: Record<string, unknown> = {}) => ({
      deliveryId: "course-1",
      driverId: "livreur-1",
      assignedAt: new Date("2026-10-01T11:00:00Z"),
      detail: "Pas encore livrée 35 min après la récupération.",
      alertCount: 1,
      createdAt: new Date(Date.now() - 20 * MIN),
      delivery: {
        orderId: "commande-abcdef",
        status: "PICKED_UP",
        driverId: "livreur-1",
        assignedAt: new Date("2026-10-01T11:00:00Z"),
        order: { store: { name: "Chez Nour" } },
      },
      driver: { id: "livreur-1", name: "Karim B.", email: "karim@exemple.be", user: null },
      ...extra,
    });

    it("relance la plateforme et le livreur tant que la commande reste dans le sac", async () => {
      db.deliveryIncident.findMany.mockResolvedValue([ouvert(), ouvert({ detail: "Hors trajet" })]);
      db.deliveryIncident.updateMany.mockResolvedValue({ count: 2 });

      const relances = await SurveillanceCoursesService.relancerAlertes();
      await new Promise((r) => setImmediate(r));

      expect(relances).toBe(1); // une relance par course, pas par constat
      expect(db.deliveryIncident.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deliveryId: "course-1", closedAt: null }),
          data: expect.objectContaining({ alertCount: { increment: 1 } }),
        })
      );
      expect(prevenirPlateforme).toHaveBeenCalledWith(
        expect.objectContaining({ sujet: expect.stringContaining("relance 2") })
      );
      expect(Notifier.pushLivreur).toHaveBeenCalledTimes(1);
    });

    it("ne relance pas deux fois quand une autre instance est passée avant", async () => {
      db.deliveryIncident.findMany.mockResolvedValue([ouvert()]);
      db.deliveryIncident.updateMany.mockResolvedValue({ count: 0 });

      expect(await SurveillanceCoursesService.relancerAlertes()).toBe(0);
      expect(prevenirPlateforme).not.toHaveBeenCalled();
    });

    it("ne relance plus une course livrée ou passée à un autre", async () => {
      db.deliveryIncident.findMany.mockResolvedValue([ouvert({ delivery: { ...ouvert().delivery, status: "DELIVERED" } })]);
      expect(await SurveillanceCoursesService.relancerAlertes()).toBe(0);
      expect(db.deliveryIncident.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("course échouée : remboursement et suspension", () => {
    beforeEach(() => {
      db.orderDelivery.findUnique.mockResolvedValue(ligne({ status: "PICKED_UP", pickupTime: new Date() }));
      db.courier.findUnique.mockResolvedValue({ status: "ACTIVE" });
      db.orderDelivery.findMany.mockResolvedValue([]);
    });

    it("rembourse le client payé en ligne et suspend le livreur, par défaut", async () => {
      db.order.findUnique.mockResolvedValue({ paymentStatus: "SUCCEEDED" });

      const resultat = await SurveillanceCoursesService.declarerEchec("course-1", {
        par: { userId: "admin" },
        motif: "Parti avec la commande",
      });

      expect(paymentService.rembourserCommande).toHaveBeenCalledWith("commande-abcdef", expect.stringContaining("Parti"));
      expect(DriverApprovalService.ecarter).toHaveBeenCalledWith("livreur-1", "SUSPENDED", expect.any(String), "admin");
      expect(resultat).toMatchObject({ remboursement: "REMBOURSEE", suspendu: true });
    });

    it("ne rembourse pas une commande sans paiement en ligne, ni deux fois", async () => {
      db.order.findUnique.mockResolvedValueOnce({ paymentStatus: "PENDING" });
      const sansPaiement = await SurveillanceCoursesService.declarerEchec("course-1", { par: { userId: "a" }, motif: "xxx" });
      expect(sansPaiement.remboursement).toBe("SANS_PAIEMENT_EN_LIGNE");

      db.order.findUnique.mockResolvedValueOnce({ paymentStatus: "REFUNDED" });
      const deja = await SurveillanceCoursesService.declarerEchec("course-1", { par: { userId: "a" }, motif: "xxx" });
      expect(deja.remboursement).toBe("DEJA_REMBOURSEE");
      expect(paymentService.rembourserCommande).not.toHaveBeenCalled();
    });

    it("clôt la course même si le remboursement échoue", async () => {
      db.order.findUnique.mockResolvedValue({ paymentStatus: "SUCCEEDED" });
      (paymentService.rembourserCommande as any).mockRejectedValueOnce(new Error("Stripe indisponible"));

      const resultat = await SurveillanceCoursesService.declarerEchec("course-1", { par: { userId: "a" }, motif: "xxx" });
      expect(resultat.remboursement).toBe("ECHEC");
      expect(tx.orderDelivery.updateMany).toHaveBeenCalled();
    });

    it("respecte les cases décochées, et retire au livreur suspendu ses courses encore au commerce", async () => {
      const decoche = await SurveillanceCoursesService.declarerEchec("course-1", {
        par: { userId: "a" },
        motif: "xxx",
        rembourser: false,
        suspendre: false,
      });
      expect(decoche).toMatchObject({ remboursement: "NON_DEMANDE", suspendu: false });
      expect(DriverApprovalService.ecarter).not.toHaveBeenCalled();

      db.order.findUnique.mockResolvedValue({ paymentStatus: "PENDING" });
      db.orderDelivery.findMany.mockResolvedValue([{ id: "course-2" }]);
      const retirer = jest.spyOn(SurveillanceCoursesService, "retirerCourse").mockResolvedValue(null);
      const resultat = await SurveillanceCoursesService.declarerEchec("course-1", { par: { userId: "a" }, motif: "xxx" });
      expect(retirer).toHaveBeenCalledWith("course-2", expect.objectContaining({ motif: "Livreur suspendu par la plateforme" }));
      expect(resultat.coursesRetirees).toBe(1);
      retirer.mockRestore();
    });
  });
});
