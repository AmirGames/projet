-- Nouveaux types de notification
ALTER TYPE "NotificationType" ADD VALUE 'DRIVER_GPS_LOST';
ALTER TYPE "NotificationType" ADD VALUE 'SUPPORT_MESSAGE';

-- Livreur : pause temporaire, perte du signal GPS, abonnement Web Push
ALTER TABLE "Driver" ADD COLUMN "pausedUntil" TIMESTAMP(3);
ALTER TABLE "Driver" ADD COLUMN "pauseReason" TEXT;
ALTER TABLE "Driver" ADD COLUMN "gpsLostAt" TIMESTAMP(3);
ALTER TABLE "Driver" ADD COLUMN "pushSubscription" JSONB;

-- Chat support livreur
CREATE TABLE "DriverSupportMessage" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "deliveryId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverSupportMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DriverSupportMessage_driverId_createdAt_idx" ON "DriverSupportMessage"("driverId", "createdAt");
CREATE INDEX "DriverSupportMessage_sender_readAt_idx" ON "DriverSupportMessage"("sender", "readAt");

ALTER TABLE "DriverSupportMessage" ADD CONSTRAINT "DriverSupportMessage_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;
