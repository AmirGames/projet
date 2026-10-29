CREATE TABLE "CourierVehicleChangeRequest" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "currentVehicleType" TEXT NOT NULL,
    "requestedVehicleType" TEXT NOT NULL,
    "requestedVehiclePlate" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CourierVehicleChangeRequest_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DriverDocument" ADD COLUMN "vehicleChangeRequestId" TEXT;

CREATE INDEX "CourierVehicleChangeRequest_driverId_status_createdAt_idx"
ON "CourierVehicleChangeRequest"("driverId", "status", "createdAt");

CREATE INDEX "DriverDocument_vehicleChangeRequestId_idx"
ON "DriverDocument"("vehicleChangeRequestId");

CREATE UNIQUE INDEX "CourierVehicleChangeRequest_one_pending_per_driver_idx"
ON "CourierVehicleChangeRequest"("driverId") WHERE "status" = 'PENDING';

ALTER TABLE "CourierVehicleChangeRequest"
ADD CONSTRAINT "CourierVehicleChangeRequest_driverId_fkey"
FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DriverDocument"
ADD CONSTRAINT "DriverDocument_vehicleChangeRequestId_fkey"
FOREIGN KEY ("vehicleChangeRequestId") REFERENCES "CourierVehicleChangeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
