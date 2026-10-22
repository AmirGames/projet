import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const db: any = {
  courier: { findUnique: jest.fn(), update: jest.fn() },
  deliveryOffer: { findMany: jest.fn(), updateMany: jest.fn() },
};

jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../realtime/socket", () => ({ emitDeliveryUpdate: jest.fn(), emitDriverEvent: jest.fn(), emitNotification: jest.fn() }));
jest.mock("../../notifications/notifier.service", () => ({
  Notifier: { pushLivreur: jest.fn(async () => true) },
  enArrierePlan: (envoi: Promise<unknown>) => envoi,
}));

import { DriverAvailabilityService } from "../driver-availability.service";
import { DispatchService } from "../dispatch.service";

describe("pause du livreur", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.courier.findUnique.mockResolvedValue({ id: "driver-1", isOnline: true, currentOrderId: null });
    db.courier.update.mockImplementation(async ({ data }: any) => ({ ...data }));
    db.deliveryOffer.findMany.mockResolvedValue([]);
  });

  it("ne collecte pas de motif personnel et garde un statut de disponibilité distinct", async () => {
    await DriverAvailabilityService.mettreEnPause("driver-1", 15);

    expect(db.courier.update).toHaveBeenCalledWith({
      where: { id: "driver-1" },
      data: expect.objectContaining({
        pausedUntil: expect.any(Date),
        pauseReason: null,
        isAvailable: false,
        latitude: null,
        longitude: null,
        lastLocationUpdate: null,
        gpsLostAt: null,
      }),
    });
  });

  it("reclasse une offre ouverte comme indisponibilité et la redistribue", async () => {
    db.deliveryOffer.findMany.mockResolvedValue([{ id: "offer-1", deliveryId: "delivery-1" }]);
    const redistribution = jest.spyOn(DispatchService, "proposerAuSuivant").mockResolvedValue(null as any);

    await DriverAvailabilityService.mettreEnPause("driver-1", 15);

    expect(db.deliveryOffer.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["offer-1"] } },
      data: { status: "UNAVAILABLE_DURING_PAUSE", respondedAt: expect.any(Date) },
    });
    expect(redistribution).toHaveBeenCalledWith("delivery-1");
    redistribution.mockRestore();
  });
});
