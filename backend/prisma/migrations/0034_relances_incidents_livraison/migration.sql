-- AlterTable
ALTER TABLE "DeliveryIncident" ADD COLUMN     "alertCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastAlertAt" TIMESTAMP(3);
