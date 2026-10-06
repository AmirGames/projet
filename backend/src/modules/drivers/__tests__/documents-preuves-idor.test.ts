import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const db: any = {
  courierDocument: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  orderDelivery: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
};
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/env", () => ({ getEnv: () => ({ JWT_SECRET: "a".repeat(40), API_URL: "https://api.test" }) }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../realtime/socket", () => ({ emitNotification: jest.fn() }));
jest.mock("../../notifications/notification.service", () => ({ notifierPlateforme: jest.fn() }));
jest.mock("../../files/file-upload.service", () => ({ FileUploadService: {} }));

import { DriverApprovalService } from "../driver-approval.service";
import { DeliveryProofService } from "../delivery-proof.service";
import { adresseDepot, verifierDepot } from "../../files/fichiers-prives.service";

const photo = "https://api.test/uploads/deliveries/photo-alice.jpg";
const document = "https://api.test/uploads/drivers/identite-alice.pdf";

beforeEach(() => {
  db.courierDocument.findFirst.mockReset();
  db.courierDocument.create.mockReset();
  db.courierDocument.update.mockReset();
  db.orderDelivery.findFirst.mockResolvedValue(null);
  db.orderDelivery.findUnique.mockResolvedValue({ id: "course-alice", deliveryCode: null, codeAttempts: 0, customerWaitStartedAt: new Date(Date.now() - 10 * 60000), customerWaitLeftAt: null });
  db.orderDelivery.update.mockResolvedValue({});
  jest.spyOn(DriverApprovalService as any, "signalerDepot").mockResolvedValue(undefined as never);
});

describe("dépôt de documents : ne pas acquérir la pièce privée du voisin", () => {
  it.each([
    document,
    "https://api.test/api/files/drivers/identite-alice.pdf?exp=123&sig=aaa",
    "https://api.test/api/drivers/documents/file/drivers/identite-alice.pdf",
    "https://api.test/uploads/merchants/kbis-alice.pdf",
    "https://api.test/uploads/deliveries/photo-alice.jpg",
  ])("Bob ne rattache pas %s", async url => {
    db.courierDocument.findFirst.mockResolvedValue(null);
    await expect(DriverApprovalService.deposerPiece("bob", { type: "identity", documentUrl: url })).rejects.toMatchObject({ statusCode: 403, code: "DOCUMENT_FORBIDDEN" });
    expect(db.courierDocument.create).not.toHaveBeenCalled();
    expect(db.courierDocument.update).not.toHaveBeenCalled();
  });

  it("Alice réutilise sa propre pièce, vérifiée avant écriture et conservée sous son URL de stockage", async () => {
    db.courierDocument.findFirst.mockResolvedValueOnce({ documentUrl: document }).mockResolvedValueOnce({ id: "piece-alice" });
    db.courierDocument.update.mockImplementation(async ({ data }: any) => data);
    const result = await DriverApprovalService.deposerPiece("alice", { type: "identity", documentUrl: "https://api.test/api/files/drivers/identite-alice.pdf?exp=123&sig=aaa" });
    expect(db.courierDocument.findFirst).toHaveBeenNthCalledWith(1, { where: { driverId: "alice", documentUrl: { endsWith: "/uploads/drivers/identite-alice.pdf" } }, select: { documentUrl: true } });
    expect(result.documentUrl).toBe(document);
  });

  it("conserve le dépôt d'un lien externe légitime", async () => {
    db.courierDocument.findFirst.mockResolvedValue(null);
    db.courierDocument.create.mockImplementation(async ({ data }: any) => data);
    const result = await DriverApprovalService.deposerPiece("alice", { type: "identity", documentUrl: "https://documents.example/identite.pdf" });
    expect(result.driverId).toBe("alice");
  });
});

describe("photos de dépôt : un reçu ne vaut que pour sa course", () => {
  it("conserve le fonctionnement des liens externes déjà admis", async () => {
    await expect(DeliveryProofService.verifier("course-alice", { photoUrl: "https://exemple.fr/depot.jpg" })).resolves.toBe("PHOTO");
  });
  it("vérifie et retire aussi le reçu d'un upload hébergé ailleurs", async () => {
    const url = "https://stockage.example/photo.jpg";
    await expect(DeliveryProofService.verifier("course-alice", { photoUrl: adresseDepot(url, "course-alice") })).resolves.toBe("PHOTO");
    expect(db.orderDelivery.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ proofPhoto: url }) }));
  });
  it("une photo envoyée par Alice ne valide pas la course de Bob", async () => {
    await expect(DeliveryProofService.verifier("course-bob", { photoUrl: adresseDepot(photo, "course-alice") })).rejects.toMatchObject({ code: "INVALID_PHOTO" });
    expect(db.orderDelivery.update).not.toHaveBeenCalled();
  });
  it("Alice valide sa propre photo et stocke une URL sans reçu", async () => {
    await expect(DeliveryProofService.verifier("course-alice", { photoUrl: adresseDepot(photo, "course-alice") })).resolves.toBe("PHOTO");
    expect(db.orderDelivery.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ proofPhoto: photo, proofType: "PHOTO" }) }));
  });
  it.each([photo, document, "https://api.test/api/files/deliveries/photo-alice.jpg"]) ("refuse l'URL privée sans reçu : %s", async url => {
    await expect(DeliveryProofService.verifier("course-alice", { photoUrl: url })).rejects.toMatchObject({ code: "INVALID_PHOTO" });
    expect(db.orderDelivery.update).not.toHaveBeenCalled();
  });
  it("refuse de rattacher une photo déjà utilisée ailleurs", async () => {
    db.orderDelivery.findFirst.mockResolvedValue({ id: "course-autre" });
    await expect(DeliveryProofService.verifier("course-alice", { photoUrl: adresseDepot(photo, "course-alice") })).rejects.toMatchObject({ code: "INVALID_PHOTO" });
    expect(db.orderDelivery.update).not.toHaveBeenCalled();
  });
  it("refuse une signature modifiée, un fichier substitué et des paramètres répétés", () => {
    const signed = adresseDepot(photo, "course-alice");
    const tampered = new URL(signed);
    tampered.searchParams.set("depotSig", "0".repeat(64));
    expect(verifierDepot(tampered.href, "course-alice")).toBeNull();
    expect(verifierDepot(signed.replace("photo-alice", "photo-bob"), "course-alice")).toBeNull();
    expect(verifierDepot(signed + "&depotExp=123", "course-alice")).toBeNull();
  });
  it("refuse un reçu expiré sans dépendre de l'horloge du téléphone", () => {
    const now = Date.now();
    const signed = adresseDepot(photo, "course-alice", now);
    expect(verifierDepot(signed, "course-alice", now + 24 * 3600000 + 1000)).toBeNull();
    expect(verifierDepot(signed, "course-alice", now)).toBe(photo);
  });
});
