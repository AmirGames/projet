-- Le pourboire laissé après la livraison, payé à part et versé au livreur
-- avec son prochain relevé (voir DriverTip dans le schéma).

-- CreateTable
CREATE TABLE "DriverTip" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "stripePaymentIntentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "payoutId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverTip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DriverTip_orderId_key" ON "DriverTip"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "DriverTip_stripePaymentIntentId_key" ON "DriverTip"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "DriverTip_driverId_status_payoutId_idx" ON "DriverTip"("driverId", "status", "payoutId");

-- CreateIndex
CREATE INDEX "DriverTip_payoutId_idx" ON "DriverTip"("payoutId");

-- AddForeignKey
ALTER TABLE "DriverTip" ADD CONSTRAINT "DriverTip_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverTip" ADD CONSTRAINT "DriverTip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverTip" ADD CONSTRAINT "DriverTip_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "DriverPayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

