import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const db: any = {
  courier: { findUnique: jest.fn(), updateMany: jest.fn() },
  courierVehicleChangeRequest: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  courierDocument: { findMany: jest.fn(), create: jest.fn() },
  notification: { create: jest.fn() },
};
db.$transaction = jest.fn(async (callback: any) => callback({
  courier: db.courier,
  courierVehicleChangeRequest: db.courierVehicleChangeRequest,
}));

jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../realtime/socket", () => ({ emitNotification: jest.fn() }));
jest.mock("../../notifications/notification.service", () => ({ notifierPlateforme: jest.fn(async () => undefined) }));
jest.mock("../../files/file-upload.service", () => ({ FileUploadService: { uploadDocument: jest.fn() } }));

import { DriverVehicleChangeService } from "../driver-vehicle-change.service";

describe("demandes de changement de véhicule", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.courier.findUnique.mockResolvedValue({ id: "driver-1", name: "Sam", email: "sam@test.invalid", status: "ACTIVE", vehicleType: "bike", vehiclePlate: null, currentOrderId: null });
    db.courierVehicleChangeRequest.create.mockResolvedValue({ id: "change-1", status: "PENDING" });
    db.courierVehicleChangeRequest.findFirst.mockResolvedValue(null);
    db.courierVehicleChangeRequest.updateMany.mockResolvedValue({ count: 1 });
    db.courier.updateMany.mockResolvedValue({ count: 1 });
    db.notification.create.mockResolvedValue({ id: "notification-1" });
  });

  it("crée une demande sans modifier le véhicule actif", async () => {
    await expect(DriverVehicleChangeService.demander("driver-1", { vehicleType: "scooter", vehiclePlate: "1-ABC-234" }))
      .resolves.toMatchObject({ id: "change-1", status: "PENDING" });
    expect(db.courierVehicleChangeRequest.create).toHaveBeenCalledWith({ data: {
      driverId: "driver-1",
      currentVehicleType: "bike",
      requestedVehicleType: "scooter",
      requestedVehiclePlate: "1-ABC-234",
    } });
    expect(db.courier.updateMany).not.toHaveBeenCalled();
  });

  it("refuse l'approbation tant que chaque pièce du véhicule demandé n'est pas validée", async () => {
    db.courierVehicleChangeRequest.findFirst.mockResolvedValue({
      id: "change-1", driverId: "driver-1", status: "PENDING", currentVehicleType: "bike", requestedVehicleType: "scooter", requestedVehiclePlate: "1-ABC-234",
      driver: { vehicleType: "bike", documents: [{ type: "identity", status: "APPROVED", expiryDate: null }] },
      documents: [],
    });
    await expect(DriverVehicleChangeService.examiner("driver-1", "change-1", "admin-1", { status: "APPROVED" }))
      .rejects.toMatchObject({ code: "VEHICLE_CHANGE_DOCUMENTS_INCOMPLETE" });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.courier.updateMany).not.toHaveBeenCalled();
  });

  it("ne change pas le véhicule au milieu d'une livraison", async () => {
    db.courierVehicleChangeRequest.findFirst.mockResolvedValue({
      id: "change-1", driverId: "driver-1", status: "PENDING", currentVehicleType: "bike", requestedVehicleType: "scooter", requestedVehiclePlate: "1-ABC-234",
      driver: { vehicleType: "bike", currentOrderId: "delivery-1", documents: [] },
      documents: [],
    });
    await expect(DriverVehicleChangeService.examiner("driver-1", "change-1", "admin-1", { status: "APPROVED" }))
      .rejects.toMatchObject({ code: "ACTIVE_DELIVERY" });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.courier.updateMany).not.toHaveBeenCalled();
  });

  it("approuve les pièces avant d'activer le nouveau véhicule sans suspendre le livreur", async () => {
    const required = ["identity", "license", "insurance", "vehicle_registration", "insulated_bag"];
    db.courierVehicleChangeRequest.findFirst.mockResolvedValue({
      id: "change-1", driverId: "driver-1", status: "PENDING", currentVehicleType: "bike", requestedVehicleType: "scooter", requestedVehiclePlate: "1-ABC-234",
      driver: { vehicleType: "bike", currentOrderId: null, documents: required.map((type) => ({ type, status: "APPROVED", expiryDate: null })) },
      documents: [],
    });
    await expect(DriverVehicleChangeService.examiner("driver-1", "change-1", "admin-1", { status: "APPROVED" }))
      .resolves.toMatchObject({ status: "APPROVED", vehicleType: "scooter" });
    expect(db.courierVehicleChangeRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "change-1", driverId: "driver-1", status: "PENDING", currentVehicleType: "bike" },
      data: expect.objectContaining({ status: "APPROVED", reviewedBy: "admin-1" }),
    }));
    expect(db.courier.updateMany).toHaveBeenCalledWith({
      where: { id: "driver-1", vehicleType: "bike", currentOrderId: null },
      data: { vehicleType: "scooter", vehiclePlate: "1-ABC-234", licensePlate: "1-ABC-234" },
    });
  });
});
