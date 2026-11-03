CREATE TYPE "RefundOperationKind" AS ENUM ('FULL_ORDER', 'ISSUE_ITEMS', 'ISSUE_BALANCE');

DROP INDEX "RefundOperation_paymentId_key";
ALTER TABLE "RefundOperation"
  ADD COLUMN "kind" "RefundOperationKind" NOT NULL DEFAULT 'FULL_ORDER',
  ADD COLUMN "supportIssueId" TEXT,
  ADD COLUMN "items" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "refundedBeforeCents" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "RefundOperation_supportIssueId_key" ON "RefundOperation"("supportIssueId");
CREATE INDEX "RefundOperation_paymentId_createdAt_idx" ON "RefundOperation"("paymentId", "createdAt");
ALTER TABLE "RefundOperation" ADD CONSTRAINT "RefundOperation_supportIssueId_fkey"
  FOREIGN KEY ("supportIssueId") REFERENCES "OrderIssue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RefundOperation" ADD CONSTRAINT "RefundOperation_support_amounts_check"
  CHECK ("amountCents" > 0 AND "refundedBeforeCents" >= 0);
