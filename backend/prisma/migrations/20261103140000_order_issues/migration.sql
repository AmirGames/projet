CREATE TYPE "OrderIssueCategory" AS ENUM ('MISSING_ITEM', 'WRONG_ORDER', 'LATE_ORDER', 'OTHER');
CREATE TYPE "OrderIssueStatus" AS ENUM ('OPEN', 'RESOLVED', 'REJECTED');

CREATE TABLE "OrderIssue" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "category" "OrderIssueCategory" NOT NULL,
  "message" TEXT NOT NULL,
  "items" JSONB NOT NULL DEFAULT '[]',
  "requestRefund" BOOLEAN NOT NULL DEFAULT false,
  "status" "OrderIssueStatus" NOT NULL DEFAULT 'OPEN',
  "response" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrderIssue_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderIssue_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OrderIssue_orderId_category_key" ON "OrderIssue"("orderId", "category");
CREATE INDEX "OrderIssue_status_createdAt_idx" ON "OrderIssue"("status", "createdAt");
