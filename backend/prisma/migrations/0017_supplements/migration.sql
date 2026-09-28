-- Les suppléments payants : ProductOption devient un groupe de suppléments
-- (« Suppléments », « Sauces »), avec un plafond de choix et un ordre.
ALTER TABLE "ProductOption" ADD COLUMN "maxChoices" INTEGER;
ALTER TABLE "ProductOption" ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ProductOption" ALTER COLUMN "pricingType" SET DEFAULT 'fixed';
