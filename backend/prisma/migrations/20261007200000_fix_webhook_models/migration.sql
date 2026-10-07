-- Alter WebhookDelivery table to match code expectations
-- Drop old columns and indexes
ALTER TABLE "WebhookDelivery" DROP COLUMN IF EXISTS "abandonedAt";
ALTER TABLE "WebhookDelivery" DROP COLUMN IF EXISTS "error";
ALTER TABLE "WebhookDelivery" DROP COLUMN IF EXISTS "event";
ALTER TABLE "WebhookDelivery" DROP COLUMN IF EXISTS "nextAttemptAt";
ALTER TABLE "WebhookDelivery" DROP COLUMN IF EXISTS "payload";
ALTER TABLE "WebhookDelivery" DROP COLUMN IF EXISTS "success";

-- Drop old index
DROP INDEX IF EXISTS "WebhookDelivery_nextAttemptAt_idx";

-- Add new columns if they don't already exist
ALTER TABLE "WebhookDelivery" ADD COLUMN IF NOT EXISTS "errorMessage" TEXT;
ALTER TABLE "WebhookDelivery" ADD COLUMN IF NOT EXISTS "eventId" TEXT;
-- Update existing rows with generated eventId values
UPDATE "WebhookDelivery" SET "eventId" = 'webhook-event-' || id WHERE "eventId" IS NULL;
-- Alter eventId to NOT NULL
ALTER TABLE "WebhookDelivery" ALTER COLUMN "eventId" SET NOT NULL;
ALTER TABLE "WebhookDelivery" ADD COLUMN IF NOT EXISTS "failedAt" TIMESTAMP(3);
ALTER TABLE "WebhookDelivery" ADD COLUMN IF NOT EXISTS "responseBody" TEXT;
ALTER TABLE "WebhookDelivery" ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP(3);
ALTER TABLE "WebhookDelivery" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PENDING';

-- Add new index
CREATE INDEX IF NOT EXISTS "WebhookDelivery_status_idx" ON "WebhookDelivery"("status");

-- Alter ProviderIntegration table
ALTER TABLE "ProviderIntegration" ADD COLUMN IF NOT EXISTS "type" TEXT;
ALTER TABLE "ProviderIntegration" ADD COLUMN IF NOT EXISTS "webhookSigningKey" TEXT;
