-- Données nécessaires aux statistiques ZupDrive (plus aucune valeur inventée) :
-- coefficient de majoration de la course et code d'échec du paiement.
-- Colonnes nulles : les lignes existantes restent « inconnues ».
ALTER TABLE "CourseDrive" ADD COLUMN "surgeFactor" DOUBLE PRECISION;
ALTER TABLE "PaymentIntentDrive" ADD COLUMN "failureReason" TEXT;
