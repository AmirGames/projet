-- Conditions négociées par commerçant : elles remplacent celles de la formule.
ALTER TABLE "Organization" ADD COLUMN "customCommissionPercent" DECIMAL(5,2);
ALTER TABLE "Organization" ADD COLUMN "customPlatformDeliveryCommissionPercent" DECIMAL(5,2);
ALTER TABLE "Organization" ADD COLUMN "customMaxStores" INTEGER;
ALTER TABLE "Organization" ADD COLUMN "customMonthlyPrice" DECIMAL(10,2);
ALTER TABLE "Organization" ADD COLUMN "customTermsNote" TEXT;
