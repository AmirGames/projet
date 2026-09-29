-- Facturation électronique Peppol : la facture mensuelle de la plateforme aux commerçants.
ALTER TABLE "Organization" ADD COLUMN "peppolId" TEXT;

CREATE TABLE "PlatformInvoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "sellerJson" JSONB NOT NULL,
    "buyerJson" JSONB NOT NULL,
    "linesJson" JSONB NOT NULL,
    "vatRate" DECIMAL(5,2) NOT NULL,
    "totalExcl" DECIMAL(10,2) NOT NULL,
    "vatAmount" DECIMAL(10,2) NOT NULL,
    "totalIncl" DECIMAL(10,2) NOT NULL,
    "ublXml" TEXT NOT NULL,
    "peppolStatus" TEXT NOT NULL DEFAULT 'GENERATED',
    "peppolMessageId" TEXT,
    "peppolError" TEXT,
    "peppolSentAt" TIMESTAMP(3),
    "peppolAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformInvoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformInvoice_number_key" ON "PlatformInvoice"("number");
CREATE UNIQUE INDEX "PlatformInvoice_orgId_period_key" ON "PlatformInvoice"("orgId", "period");
CREATE INDEX "PlatformInvoice_peppolStatus_idx" ON "PlatformInvoice"("peppolStatus");
CREATE INDEX "PlatformInvoice_issuedAt_idx" ON "PlatformInvoice"("issuedAt");

ALTER TABLE "PlatformInvoice" ADD CONSTRAINT "PlatformInvoice_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PlatformInvoiceSeq" (
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PlatformInvoiceSeq_pkey" PRIMARY KEY ("year")
);
