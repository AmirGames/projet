-- AlterTable
ALTER TABLE "MerchantPayout" ADD COLUMN     "batchId" TEXT;

-- AlterTable
ALTER TABLE "DriverPayout" ADD COLUMN     "batchId" TEXT;

-- CreateTable
CREATE TABLE "PayoutBatch" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "itemsJson" JSONB NOT NULL DEFAULT '[]',
    "xmlSha256" TEXT,
    "bankReference" TEXT,
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "exportedBy" TEXT,
    "exportedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayoutBatch_reference_key" ON "PayoutBatch"("reference");

-- CreateIndex
CREATE INDEX "PayoutBatch_status_idx" ON "PayoutBatch"("status");

-- CreateIndex
CREATE INDEX "MerchantPayout_batchId_idx" ON "MerchantPayout"("batchId");

-- CreateIndex
CREATE INDEX "DriverPayout_batchId_idx" ON "DriverPayout"("batchId");

-- AddForeignKey
ALTER TABLE "MerchantPayout" ADD CONSTRAINT "MerchantPayout_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PayoutBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverPayout" ADD CONSTRAINT "DriverPayout_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PayoutBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

