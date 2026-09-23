-- Nouveaux tours de proposition : une course peut revenir à un livreur
ALTER TABLE "DeliveryOffer" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 1;
