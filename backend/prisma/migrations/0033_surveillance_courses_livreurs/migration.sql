-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'DELIVERY_LATE';
ALTER TYPE "NotificationType" ADD VALUE 'DRIVER_REPLACED';

-- AlterTable
ALTER TABLE "OrderDelivery" ADD COLUMN     "driftStartedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DeliveryIncident" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "minutes" INTEGER,
    "distanceKm" DOUBLE PRECISION,
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryIncident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryIncident_closedAt_createdAt_idx" ON "DeliveryIncident"("closedAt", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryIncident_driverId_createdAt_idx" ON "DeliveryIncident"("driverId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryIncident_deliveryId_driverId_assignedAt_type_key" ON "DeliveryIncident"("deliveryId", "driverId", "assignedAt", "type");

-- AddForeignKey
ALTER TABLE "DeliveryIncident" ADD CONSTRAINT "DeliveryIncident_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "OrderDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryIncident" ADD CONSTRAINT "DeliveryIncident_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;
