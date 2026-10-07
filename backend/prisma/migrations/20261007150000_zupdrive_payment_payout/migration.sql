-- CreateTable PaymentIntentDrive
CREATE TABLE "PaymentIntentDrive" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "passagerId" TEXT,
    "stripeId" TEXT NOT NULL,
    "amountCentimes" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" TEXT NOT NULL DEFAULT 'REQUIRES_PAYMENT_METHOD',
    "cancellationReason" TEXT,
    "platformCommissionCentimes" INTEGER NOT NULL,
    "driverEarningsCentimes" INTEGER NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentIntentDrive_pkey" PRIMARY KEY ("id")
);

-- CreateTable DriverPayoutDrive
CREATE TABLE "DriverPayoutDrive" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "chauffeurId" TEXT NOT NULL,
    "batchId" TEXT,
    "amountCentimes" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "ibanSnapshot" TEXT,
    "stripePayoutId" TEXT,
    "processedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverPayoutDrive_pkey" PRIMARY KEY ("id")
);

-- CreateTable DriverPayoutBatchDrive
CREATE TABLE "DriverPayoutBatchDrive" (
    "id" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "totalAmountCentimes" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payoutCount" INTEGER NOT NULL DEFAULT 0,
    "stripeTransferId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "failureReason" TEXT,

    CONSTRAINT "DriverPayoutBatchDrive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex PaymentIntentDrive on courseId
CREATE UNIQUE INDEX "PaymentIntentDrive_courseId_key" ON "PaymentIntentDrive"("courseId");

-- CreateIndex PaymentIntentDrive on stripeId
CREATE UNIQUE INDEX "PaymentIntentDrive_stripeId_key" ON "PaymentIntentDrive"("stripeId");

-- CreateIndex PaymentIntentDrive on passagerId
CREATE INDEX "PaymentIntentDrive_passagerId_idx" ON "PaymentIntentDrive"("passagerId");

-- CreateIndex PaymentIntentDrive on status
CREATE INDEX "PaymentIntentDrive_status_idx" ON "PaymentIntentDrive"("status");

-- CreateIndex PaymentIntentDrive on confirmedAt
CREATE INDEX "PaymentIntentDrive_confirmedAt_idx" ON "PaymentIntentDrive"("confirmedAt");

-- CreateIndex DriverPayoutDrive on paymentId
CREATE UNIQUE INDEX "DriverPayoutDrive_paymentId_key" ON "DriverPayoutDrive"("paymentId");

-- CreateIndex DriverPayoutDrive on chauffeurId + status
CREATE INDEX "DriverPayoutDrive_chauffeurId_status_idx" ON "DriverPayoutDrive"("chauffeurId", "status");

-- CreateIndex DriverPayoutDrive on batchId
CREATE INDEX "DriverPayoutDrive_batchId_idx" ON "DriverPayoutDrive"("batchId");

-- CreateIndex DriverPayoutDrive on period
CREATE INDEX "DriverPayoutDrive_periodStart_periodEnd_idx" ON "DriverPayoutDrive"("periodStart", "periodEnd");

-- CreateIndex DriverPayoutDrive on status
CREATE INDEX "DriverPayoutDrive_status_idx" ON "DriverPayoutDrive"("status");

-- CreateIndex DriverPayoutBatchDrive on status
CREATE INDEX "DriverPayoutBatchDrive_status_idx" ON "DriverPayoutBatchDrive"("status");

-- CreateIndex DriverPayoutBatchDrive on period
CREATE INDEX "DriverPayoutBatchDrive_periodStart_periodEnd_idx" ON "DriverPayoutBatchDrive"("periodStart", "periodEnd");

-- AddForeignKey
ALTER TABLE "PaymentIntentDrive" ADD CONSTRAINT "PaymentIntentDrive_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "CourseDrive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntentDrive" ADD CONSTRAINT "PaymentIntentDrive_passagerId_fkey" FOREIGN KEY ("passagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverPayoutDrive" ADD CONSTRAINT "DriverPayoutDrive_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "PaymentIntentDrive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverPayoutDrive" ADD CONSTRAINT "DriverPayoutDrive_chauffeurId_fkey" FOREIGN KEY ("chauffeurId") REFERENCES "ChauffeurDrive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverPayoutDrive" ADD CONSTRAINT "DriverPayoutDrive_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "DriverPayoutBatchDrive"("id") ON DELETE SET NULL ON UPDATE CASCADE;
