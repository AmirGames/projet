-- Reversements hebdomadaires aux commerçants, et comptes des livreurs pour
-- les virements SEPA groupés.
CREATE TABLE "MerchantPayout" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "lines" JSONB NOT NULL DEFAULT '[]',
    "amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "carriedToId" TEXT,
    "method" TEXT,
    "reference" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidBy" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MerchantPayout_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MerchantPayout_orgId_idx" ON "MerchantPayout"("orgId");
CREATE INDEX "MerchantPayout_status_idx" ON "MerchantPayout"("status");
CREATE INDEX "MerchantPayout_periodStart_idx" ON "MerchantPayout"("periodStart");
ALTER TABLE "MerchantPayout" ADD CONSTRAINT "MerchantPayout_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Order" ADD COLUMN "merchantPayoutId" TEXT;
CREATE INDEX "Order_merchantPayoutId_idx" ON "Order"("merchantPayoutId");
ALTER TABLE "Order" ADD CONSTRAINT "Order_merchantPayoutId_fkey" FOREIGN KEY ("merchantPayoutId") REFERENCES "MerchantPayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Driver" ADD COLUMN "iban" TEXT;
ALTER TABLE "Driver" ADD COLUMN "bic" TEXT;
ALTER TABLE "Driver" ADD COLUMN "accountHolder" TEXT;
