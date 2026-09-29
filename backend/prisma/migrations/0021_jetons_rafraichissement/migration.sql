-- Rotation des jetons de renouvellement, rattachés à leur session.
CREATE TABLE "JetonRafraichissement" (
    "id" TEXT NOT NULL,
    "jtiHash" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JetonRafraichissement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JetonRafraichissement_jtiHash_key" ON "JetonRafraichissement"("jtiHash");
CREATE INDEX "JetonRafraichissement_sessionId_idx" ON "JetonRafraichissement"("sessionId");
CREATE INDEX "JetonRafraichissement_expiresAt_idx" ON "JetonRafraichissement"("expiresAt");

ALTER TABLE "JetonRafraichissement" ADD CONSTRAINT "JetonRafraichissement_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "SessionConnexion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
