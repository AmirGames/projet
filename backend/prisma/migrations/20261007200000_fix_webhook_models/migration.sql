-- Alter WebhookDelivery table - remove old columns
ALTER TABLE "WebhookDelivery" DROP COLUMN IF EXISTS "abandonedAt";
ALTER TABLE "WebhookDelivery" DROP COLUMN IF EXISTS "error";
ALTER TABLE "WebhookDelivery" DROP COLUMN IF EXISTS "event";
ALTER TABLE "WebhookDelivery" DROP COLUMN IF EXISTS "nextAttemptAt";
ALTER TABLE "WebhookDelivery" DROP COLUMN IF EXISTS "payload";
ALTER TABLE "WebhookDelivery" DROP COLUMN IF EXISTS "success";

-- Drop old index if exists
DROP INDEX IF EXISTS "WebhookDelivery_nextAttemptAt_idx";

-- Alter ProviderIntegration table - add missing columns
ALTER TABLE "ProviderIntegration" ADD COLUMN IF NOT EXISTS "type" TEXT;
ALTER TABLE "ProviderIntegration" ADD COLUMN IF NOT EXISTS "webhookSigningKey" TEXT;
