-- CreateTable NotificationTemplate
CREATE TABLE "NotificationTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL UNIQUE,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL CHECK ("type" IN ('EMAIL', 'SMS', 'PUSH')),
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "variables" TEXT NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable NotificationLog
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recipientId" TEXT NOT NULL,
    "recipientType" TEXT NOT NULL CHECK ("recipientType" IN ('CHAUFFEUR', 'PASSAGER', 'ADMIN')),
    "type" TEXT NOT NULL CHECK ("type" IN ('EMAIL', 'SMS', 'PUSH')),
    "templateKey" TEXT NOT NULL,
    "status" TEXT NOT NULL CHECK ("status" IN ('PENDING', 'SENT', 'FAILED', 'BOUNCED')) DEFAULT 'PENDING',
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "variables" TEXT NOT NULL DEFAULT '{}',
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable NotificationAlert
CREATE TABLE "NotificationAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "driverId" TEXT NOT NULL,
    "type" TEXT NOT NULL CHECK ("type" IN ('DOCUMENT_EXPIRY', 'INFRACTION_REPORTED', 'SUSPENSION', 'PAYMENT_ISSUE', 'RATING_LOW', 'CUSTOM')),
    "severity" TEXT NOT NULL CHECK ("severity" IN ('INFO', 'WARNING', 'CRITICAL')) DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "triggerAction" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationAlert_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "ChauffeurDrive" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex on NotificationTemplate
CREATE INDEX "NotificationTemplate_active_idx" ON "NotificationTemplate"("active");
CREATE INDEX "NotificationTemplate_type_idx" ON "NotificationTemplate"("type");

-- CreateIndex on NotificationLog
CREATE INDEX "NotificationLog_recipientId_idx" ON "NotificationLog"("recipientId");
CREATE INDEX "NotificationLog_type_idx" ON "NotificationLog"("type");
CREATE INDEX "NotificationLog_status_idx" ON "NotificationLog"("status");
CREATE INDEX "NotificationLog_createdAt_idx" ON "NotificationLog"("createdAt");
CREATE INDEX "NotificationLog_templateKey_idx" ON "NotificationLog"("templateKey");

-- CreateIndex on NotificationAlert
CREATE INDEX "NotificationAlert_driverId_idx" ON "NotificationAlert"("driverId");
CREATE INDEX "NotificationAlert_type_idx" ON "NotificationAlert"("type");
CREATE INDEX "NotificationAlert_severity_idx" ON "NotificationAlert"("severity");
CREATE INDEX "NotificationAlert_read_idx" ON "NotificationAlert"("read");
CREATE INDEX "NotificationAlert_createdAt_idx" ON "NotificationAlert"("createdAt");
