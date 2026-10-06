-- Livreur « bientôt libre » : réglages
ALTER TABLE "SystemConfig" ADD COLUMN "driverSoonFreeKm" DOUBLE PRECISION NOT NULL DEFAULT 1;
ALTER TABLE "SystemConfig" ADD COLUMN "driverSoonFreeSeconds" INTEGER NOT NULL DEFAULT 180;

-- Proposition à enchaîner après la livraison en cours
ALTER TABLE "DeliveryOffer" ADD COLUMN "bientotLibre" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DeliveryOffer" ADD COLUMN "libreDansSecondes" INTEGER;

-- Course réservée par un livreur qui termine sa livraison
ALTER TABLE "OrderDelivery" ADD COLUMN "reservedDriverId" TEXT;
ALTER TABLE "OrderDelivery" ADD COLUMN "reservedAt" TIMESTAMP(3);
CREATE INDEX "OrderDelivery_reservedDriverId_idx" ON "OrderDelivery"("reservedDriverId");
