-- Le commerçant ne modère plus les avis : il les signale, la plateforme tranche.

ALTER TABLE "Review" ADD COLUMN "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "Review" SET "editedAt" = "updatedAt";

CREATE TABLE "ReviewReport" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reportedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decision" TEXT,
    "decisionNote" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "ReviewReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReviewReport_reviewId_idx" ON "ReviewReport"("reviewId");
CREATE INDEX "ReviewReport_decision_idx" ON "ReviewReport"("decision");

ALTER TABLE "ReviewReport" ADD CONSTRAINT "ReviewReport_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Les avis qu'un commerçant avait rejetés restent masqués, mais c'est
-- désormais à la plateforme de confirmer ce retrait ou de les republier.
INSERT INTO "ReviewReport" ("id", "reviewId", "reason", "createdAt")
SELECT 'migr-' || "id", "id", 'Rejeté par le commerçant avant le passage au signalement', "updatedAt"
FROM "Review" WHERE "status" = 'REJECTED';

UPDATE "Review" SET "status" = 'REMOVED' WHERE "status" = 'REJECTED';
