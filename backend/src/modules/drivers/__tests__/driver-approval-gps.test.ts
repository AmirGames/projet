import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const db: any = {
  courier: { findUnique: jest.fn(), update: jest.fn() },
  notification: { create: jest.fn() },
};

jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../realtime/socket", () => ({ emitNotification: jest.fn() }));
jest.mock("../../files/file-upload.service", () => ({ FileUploadService: { uploadDocument: jest.fn() } }));
jest.mock("../../notifications/notification.service", () => ({ notifierPlateforme: jest.fn() }));
jest.mock("../../files/fichiers-prives.service", () => ({ cheminRelatif: jest.fn() }));

import { DriverApprovalService } from "../driver-approval.service";

describe("effacement de la position de disponibilité à la restriction", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.courier.update.mockResolvedValue({ id: "driver-1", status: "SUSPENDED" });
    db.courier.findUnique.mockResolvedValueOnce({ currentOrderId: null }).mockResolvedValueOnce({ email: "d@example.test" });
    db.notification.create.mockResolvedValue({ id: "notification-1" });
  });

  it("efface le dernier point s'il n'y a pas de livraison acceptée", async () => {
    await DriverApprovalService.ecarter("driver-1", "SUSPENDED", "Dossier à vérifier", "admin-1");

    expect(db.courier.update).toHaveBeenCalledWith({ where: { id: "driver-1" }, data: expect.objectContaining({
      isOnline: false,
      latitude: null,
      longitude: null,
      lastLocationUpdate: null,
      gpsLostAt: null,
    }) });
  });

  it("garde le suivi nécessaire à une livraison déjà acceptée", async () => {
    db.courier.findUnique.mockReset();
    db.courier.findUnique.mockResolvedValueOnce({ currentOrderId: "delivery-1" }).mockResolvedValueOnce({ email: "d@example.test" });

    await DriverApprovalService.ecarter("driver-1", "SUSPENDED", "Dossier à vérifier", "admin-1");

    const [args] = db.courier.update.mock.calls[0];
    expect(args.data).toMatchObject({ isOnline: false, isAvailable: false });
    expect(args.data).not.toHaveProperty("latitude");
    expect(args.data).not.toHaveProperty("longitude");
  });
});
