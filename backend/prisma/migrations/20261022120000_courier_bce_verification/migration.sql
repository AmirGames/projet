ALTER TABLE "Driver"
  ADD COLUMN "bceNumber" TEXT,
  ADD COLUMN "bceStatus" TEXT NOT NULL DEFAULT 'NOT_SUBMITTED',
  ADD COLUMN "bceReviewedAt" TIMESTAMP(3),
  ADD COLUMN "bceReviewedBy" TEXT,
  ADD COLUMN "bceReviewReason" TEXT;

CREATE INDEX "Driver_bceStatus_idx" ON "Driver"("bceStatus");

-- Les dossiers déjà présents doivent également être revus avant une nouvelle
-- disponibilité. Une course déjà attribuée reste liée à son livreur et peut
-- être terminée; aucun paiement ni historique n'est modifié.
UPDATE "Driver"
SET "isOnline" = false, "isAvailable" = false
WHERE "bceStatus" = 'NOT_SUBMITTED';

UPDATE "Driver"
SET "latitude" = NULL, "longitude" = NULL, "lastLocationUpdate" = NULL, "gpsLostAt" = NULL
WHERE "bceStatus" = 'NOT_SUBMITTED' AND "currentOrderId" IS NULL;
