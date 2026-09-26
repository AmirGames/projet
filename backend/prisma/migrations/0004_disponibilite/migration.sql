-- Disponibilité : un relevé par cible et par minute, conservé 90 jours.
--
-- L'historique survit aux redémarrages ; un trou dans les relevés de l'API
-- compte comme une indisponibilité, puisqu'un serveur arrêté ne relève rien.
-- CreateTable
CREATE TABLE "UptimeCheck" (
    "id" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "statusCode" INTEGER,
    "durationMs" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UptimeCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UptimeCheck_target_createdAt_idx" ON "UptimeCheck"("target", "createdAt");

-- CreateIndex
CREATE INDEX "UptimeCheck_createdAt_idx" ON "UptimeCheck"("createdAt");

