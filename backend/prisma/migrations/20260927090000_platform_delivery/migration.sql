-- La commission quand la plateforme fournit le livreur
ALTER TABLE "PlanTier" ADD COLUMN "platformDeliveryCommissionPercent" DECIMAL(5,2) NOT NULL DEFAULT 15;

-- Une grille de départ : plus élevée que la commission de chaque formule
UPDATE "PlanTier" SET "platformDeliveryCommissionPercent" = 15 WHERE "code" = 'FREE';
UPDATE "PlanTier" SET "platformDeliveryCommissionPercent" = 12 WHERE "code" = 'PREMIUM';
UPDATE "PlanTier" SET "platformDeliveryCommissionPercent" = 10 WHERE "code" = 'PRO';
UPDATE "PlanTier" SET "platformDeliveryCommissionPercent" = "commissionPercent"
  WHERE "platformDeliveryCommissionPercent" < "commissionPercent";

-- Qui livre la commande : OWN ou PLATFORM
ALTER TABLE "Order" ADD COLUMN "deliveryMode" TEXT;
