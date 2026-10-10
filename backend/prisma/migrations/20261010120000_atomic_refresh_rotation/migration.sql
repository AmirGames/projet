ALTER TABLE "JetonRafraichissement"
  ADD COLUMN "repriseHash" TEXT,
  ADD COLUMN "successeurJti" TEXT,
  ADD COLUMN "repriseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "repriseUsedAt" TIMESTAMP(3);

CREATE INDEX "JetonRafraichissement_repriseExpiresAt_idx"
  ON "JetonRafraichissement"("repriseExpiresAt");
