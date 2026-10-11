-- Durable queue and atomic event-to-endpoint deduplication for ZupDrive webhooks.
ALTER TABLE "WebhookDeliveryDrive"
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lockedUntil" TIMESTAMP(3),
  ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 6;

-- Existing deliveries may predate the event foreign key. Keep their history.
CREATE UNIQUE INDEX "WebhookDeliveryDrive_webhookId_eventId_key"
  ON "WebhookDeliveryDrive"("webhookId", "eventId");
CREATE INDEX "WebhookDeliveryDrive_nextAttemptAt_idx"
  ON "WebhookDeliveryDrive"("nextAttemptAt");
CREATE INDEX "WebhookDeliveryDrive_lockedUntil_idx"
  ON "WebhookDeliveryDrive"("lockedUntil");
ALTER TABLE "WebhookDeliveryDrive"
  ADD CONSTRAINT "WebhookDeliveryDrive_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "WebhookEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
