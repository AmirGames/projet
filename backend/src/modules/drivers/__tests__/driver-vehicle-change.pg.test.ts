import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../realtime/socket", () => ({ emitNotification: jest.fn() }));
jest.mock("../../notifications/notification.service", () => ({ notifierPlateforme: jest.fn(async () => undefined) }));

import { db } from "../../../services/db";
import { DriverVehicleChangeService } from "../driver-vehicle-change.service";

const integration = process.env.PRIVACY_INTEGRATION === "true" ? describe : describe.skip;

integration("changement de véhicule — PostgreSQL local", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  it("garde le véhicule actif pendant l'examen, approuve les pièces puis conserve l'ancien véhicule en cas de refus", async () => {
    const email = `vehicle-change-${randomUUID()}@test.invalid`;
    const notification = jest.spyOn(db.notification, "create").mockResolvedValue({ id: "test-notification" } as never);
    const courier = await db.courier.create({
      data: {
        name: "Livreur test changement véhicule",
        email,
        phone: "0000000000",
        vehicleType: "bike",
        status: "ACTIVE",
        bceStatus: "VERIFIED",
        isOnline: true,
      },
      select: { id: true },
    });

    try {
      const request = await DriverVehicleChangeService.demander(courier.id, {
        vehicleType: "scooter",
        vehiclePlate: "1-ABC-234",
      });

      const whilePending = await db.courier.findUnique({
        where: { id: courier.id },
        select: { vehicleType: true, vehiclePlate: true, isOnline: true, status: true },
      });
      expect(whilePending).toMatchObject({ vehicleType: "bike", vehiclePlate: null, isOnline: true, status: "ACTIVE" });
      await expect(DriverVehicleChangeService.demander(courier.id, { vehicleType: "car", vehiclePlate: "2-XYZ-987" }))
        .rejects.toMatchObject({ code: "VEHICLE_CHANGE_ALREADY_PENDING" });

      await db.courierDocument.createMany({
        data: ["identity", "license", "insurance", "vehicle_registration", "insulated_bag"].map((type) => ({
          driverId: courier.id,
          type,
          documentUrl: `https://test.invalid/${randomUUID()}`,
          status: "APPROVED",
        })),
      });

      await expect(DriverVehicleChangeService.examiner(courier.id, request.id, "test-support", { status: "APPROVED" }))
        .resolves.toMatchObject({ status: "APPROVED", vehicleType: "scooter" });
      expect(await db.courier.findUnique({ where: { id: courier.id }, select: { vehicleType: true, vehiclePlate: true, isOnline: true } }))
        .toMatchObject({ vehicleType: "scooter", vehiclePlate: "1-ABC-234", isOnline: true });

      const rejected = await DriverVehicleChangeService.demander(courier.id, { vehicleType: "car", vehiclePlate: "2-XYZ-987" });
      await DriverVehicleChangeService.examiner(courier.id, rejected.id, "test-support", {
        status: "REJECTED",
        reason: "Le document du véhicule ne correspond pas.",
      });
      expect(await db.courier.findUnique({ where: { id: courier.id }, select: { vehicleType: true, vehiclePlate: true, isOnline: true } }))
        .toMatchObject({ vehicleType: "scooter", vehiclePlate: "1-ABC-234", isOnline: true });
    } finally {
      notification.mockRestore();
      await db.courier.delete({ where: { id: courier.id } });
    }
  });
});
