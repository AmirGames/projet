-- Distance maximale de livraison selon le véhicule du livreur
ALTER TABLE "SystemConfig" ADD COLUMN "driverBikeMaxKm" DOUBLE PRECISION NOT NULL DEFAULT 4;
ALTER TABLE "SystemConfig" ADD COLUMN "driverScooterMaxKm" DOUBLE PRECISION NOT NULL DEFAULT 7;
ALTER TABLE "SystemConfig" ADD COLUMN "driverExceptionSeconds" INTEGER NOT NULL DEFAULT 180;

-- Course proposée au-delà de la limite habituelle du véhicule
ALTER TABLE "DeliveryOffer" ADD COLUMN "horsLimite" BOOLEAN NOT NULL DEFAULT false;
