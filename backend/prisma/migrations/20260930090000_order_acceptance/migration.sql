-- Acceptation et refus des commandes par le commerçant
ALTER TABLE "Order" ADD COLUMN "acceptedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "preparationMinutes" INTEGER;
ALTER TABLE "Order" ADD COLUMN "estimatedReadyAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "rejectedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "rejectionReason" TEXT;
ALTER TABLE "Order" ADD COLUMN "rejectionNote" TEXT;
