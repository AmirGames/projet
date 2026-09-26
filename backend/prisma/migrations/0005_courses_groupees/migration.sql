-- Plusieurs courses pour un même livreur : un lot proposé d'un coup, ou une
-- course ajoutée à une tournée déjà commencée.
ALTER TABLE "DeliveryOffer" ADD COLUMN "batchId" TEXT;
ALTER TABLE "DeliveryOffer" ADD COLUMN "ajout" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "DeliveryOffer_batchId_idx" ON "DeliveryOffer"("batchId");
