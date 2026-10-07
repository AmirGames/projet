-- Alignement du schéma Prisma sur les migrations ZupDrive écrites à la main.
-- ZupDrive nomme son chauffeur `chauffeurId` (le `driverId` historique désigne
-- le livreur ZupEat). Renommages sans perte : aucune colonne n'est supprimée.

-- ChauffeurDocument
ALTER TABLE "ChauffeurDocument" RENAME COLUMN "driverId" TO "chauffeurId";
ALTER TABLE "ChauffeurDocument" RENAME CONSTRAINT "ChauffeurDocument_driverId_fkey" TO "ChauffeurDocument_chauffeurId_fkey";
ALTER INDEX "ChauffeurDocument_driverId_idx" RENAME TO "ChauffeurDocument_chauffeurId_idx";
ALTER INDEX "ChauffeurDocument_driverId_type_key" RENAME TO "ChauffeurDocument_chauffeurId_type_key";
CREATE INDEX "ChauffeurDocument_type_idx" ON "ChauffeurDocument"("type");

-- ChauffeurInfraction
ALTER TABLE "ChauffeurInfraction" RENAME COLUMN "driverId" TO "chauffeurId";
ALTER TABLE "ChauffeurInfraction" RENAME CONSTRAINT "ChauffeurInfraction_driverId_fkey" TO "ChauffeurInfraction_chauffeurId_fkey";
ALTER INDEX "ChauffeurInfraction_driverId_idx" RENAME TO "ChauffeurInfraction_chauffeurId_idx";
CREATE INDEX "ChauffeurInfraction_type_idx" ON "ChauffeurInfraction"("type");

-- NotificationAlert
ALTER TABLE "NotificationAlert" RENAME COLUMN "driverId" TO "chauffeurId";
ALTER TABLE "NotificationAlert" RENAME CONSTRAINT "NotificationAlert_driverId_fkey" TO "NotificationAlert_chauffeurId_fkey";
ALTER INDEX "NotificationAlert_driverId_idx" RENAME TO "NotificationAlert_chauffeurId_idx";

-- Livraisons des webhooks ZupDrive (distinctes de WebhookDelivery, module webhooks ZupEat)
CREATE TABLE "WebhookDeliveryDrive" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "statusCode" INTEGER,
    "responseBody" TEXT,
    "errorMessage" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDeliveryDrive_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebhookDeliveryDrive_webhookId_idx" ON "WebhookDeliveryDrive"("webhookId");
CREATE INDEX "WebhookDeliveryDrive_status_idx" ON "WebhookDeliveryDrive"("status");
CREATE INDEX "WebhookDeliveryDrive_createdAt_idx" ON "WebhookDeliveryDrive"("createdAt");

ALTER TABLE "WebhookDeliveryDrive" ADD CONSTRAINT "WebhookDeliveryDrive_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
