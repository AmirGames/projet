-- Additif : aucune écriture sur les montants ou les états financiers historiques.
CREATE TYPE "RefundOperationStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'WAITING_STRIPE', 'RETRY', 'SUCCEEDED', 'ABANDONED');

CREATE TABLE "RefundOperation" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "paymentIntentId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" "RefundOperationStatus" NOT NULL DEFAULT 'REQUESTED',
  "stripeRefundId" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 0,
  "firstCallAt" TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedUntil" TIMESTAMP(3),
  "lastError" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RefundOperation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RefundOperation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RefundOperation_amount_positive" CHECK ("amountCents" > 0)
);
CREATE UNIQUE INDEX "RefundOperation_paymentId_key" ON "RefundOperation"("paymentId");
CREATE UNIQUE INDEX "RefundOperation_idempotencyKey_key" ON "RefundOperation"("idempotencyKey");
CREATE UNIQUE INDEX "RefundOperation_stripeRefundId_key" ON "RefundOperation"("stripeRefundId");
CREATE INDEX "RefundOperation_status_nextAttemptAt_idx" ON "RefundOperation"("status", "nextAttemptAt");

CREATE TABLE "RefundOperationEvent" (
  "id" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "status" "RefundOperationStatus" NOT NULL,
  "code" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefundOperationEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RefundOperationEvent_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "RefundOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RefundOperationEvent_operationId_createdAt_idx" ON "RefundOperationEvent"("operationId", "createdAt");

-- Les anciens appels ont pu aboutir sans réponse. Aucune nouvelle création
-- automatique sur ces lignes : firstCallAt périmé impose la réconciliation.
INSERT INTO "RefundOperation" ("id", "paymentId", "paymentIntentId", "amountCents", "currency", "reason", "idempotencyKey", "status", "stripeRefundId", "firstCallAt", "lastError", "updatedAt")
SELECT 'historique-' || p."id", p."id", p."stripePaymentIntentId", (p."amount" * 100)::INTEGER, lower(p."currency"),
       'Cas historique à examiner avant reprise', 'a03-remboursement-' || p."id", 'ABANDONED', p."stripeRefundId",
       TIMESTAMP '1970-01-01', 'HISTORICAL_MANUAL_REVIEW', CURRENT_TIMESTAMP
FROM "Payment" p JOIN "Order" o ON o."id" = p."orderId"
WHERE p."status" = 'SUCCEEDED' AND p."amount" > 0 AND p."stripePaymentIntentId" IS NOT NULL
  AND (o."status" = 'REJECTED' OR o."deletedAt" IS NOT NULL OR p."stripeRefundId" IS NOT NULL);

INSERT INTO "RefundOperationEvent" ("id", "operationId", "status", "code")
SELECT 'historique-event-' || "id", "id", 'ABANDONED', 'HISTORICAL_MANUAL_REVIEW' FROM "RefundOperation";
