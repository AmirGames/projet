-- CreateTable WebhookEndpoint
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "events" TEXT NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "secret" TEXT NOT NULL UNIQUE,
    "retryPolicy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable WebhookEvent
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventType" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL CHECK ("resourceType" IN ('DRIVER', 'DOCUMENT', 'INFRACTION', 'PAYMENT', 'ALERT')),
    "resourceId" TEXT NOT NULL,
    "data" TEXT NOT NULL DEFAULT '{}',
    "timestamp" TIMESTAMP(3) NOT NULL,
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "deliveredAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable ProviderIntegration
CREATE TABLE "ProviderIntegration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL CHECK ("provider" IN ('SENDGRID', 'TWILIO', 'MAILGUN', 'AWS_SES', 'STRIPE', 'CUSTOM')),
    "type" TEXT NOT NULL CHECK ("type" IN ('EMAIL', 'SMS', 'PAYMENT', 'CUSTOM')),
    "apiKey" TEXT NOT NULL,
    "webhookSigningKey" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "config" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex on WebhookEndpoint
CREATE INDEX "WebhookEndpoint_active_idx" ON "WebhookEndpoint"("active");
CREATE INDEX "WebhookEndpoint_url_idx" ON "WebhookEndpoint"("url");

-- CreateIndex on WebhookEvent
CREATE INDEX "WebhookEvent_eventType_idx" ON "WebhookEvent"("eventType");
CREATE INDEX "WebhookEvent_resourceId_idx" ON "WebhookEvent"("resourceId");
CREATE INDEX "WebhookEvent_delivered_idx" ON "WebhookEvent"("delivered");
CREATE INDEX "WebhookEvent_timestamp_idx" ON "WebhookEvent"("timestamp");

-- CreateIndex on ProviderIntegration
CREATE INDEX "ProviderIntegration_provider_idx" ON "ProviderIntegration"("provider");
CREATE INDEX "ProviderIntegration_type_idx" ON "ProviderIntegration"("type");
CREATE INDEX "ProviderIntegration_active_idx" ON "ProviderIntegration"("active");
