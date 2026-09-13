-- Add closure and suspension fields to Organization
ALTER TABLE "Organization" ADD COLUMN "suspensionReason" TEXT,
ADD COLUMN "suspensionDate" TIMESTAMP(3),
ADD COLUMN "closureReason" TEXT,
ADD COLUMN "closureDate" TIMESTAMP(3),
ADD COLUMN "closedUntil" TIMESTAMP(3),
ADD COLUMN "archiveBackupId" TEXT,
ADD COLUMN "isArchivedPermanently" BOOLEAN NOT NULL DEFAULT false;

-- Add index for closedUntil
CREATE INDEX "Organization_closedUntil_idx" ON "Organization"("closedUntil");

-- Create MerchantArchive table
CREATE TABLE "MerchantArchive" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "organizationData" JSONB NOT NULL,
    "storesData" JSONB,
    "productsData" JSONB,
    "ordersData" JSONB,
    "customersData" JSONB,
    "reason" TEXT NOT NULL,
    "closureDate" TIMESTAMP(3) NOT NULL,
    "restorationDeadline" TIMESTAMP(3) NOT NULL,
    "isRestored" BOOLEAN NOT NULL DEFAULT false,
    "restoredAt" TIMESTAMP(3),
    "restoredByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantArchive_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MerchantArchive_organizationId_key" ON "MerchantArchive"("organizationId");
CREATE INDEX "MerchantArchive_closureDate_idx" ON "MerchantArchive"("closureDate");
CREATE INDEX "MerchantArchive_restorationDeadline_idx" ON "MerchantArchive"("restorationDeadline");

-- Add foreign key
ALTER TABLE "MerchantArchive" ADD CONSTRAINT "MerchantArchive_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE;

-- Add deletedAt to Product
ALTER TABLE "Product" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "Product_deletedAt_idx" ON "Product"("deletedAt");

-- Add deletedAt to Order
ALTER TABLE "Order" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "Order_deletedAt_idx" ON "Order"("deletedAt");

-- Add deletedAt to Customer
ALTER TABLE "Customer" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "Customer_deletedAt_idx" ON "Customer"("deletedAt");

-- Add deletedAt to Store
ALTER TABLE "Store" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "Store_deletedAt_idx" ON "Store"("deletedAt");
