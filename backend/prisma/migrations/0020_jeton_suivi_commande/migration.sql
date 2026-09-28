-- Le suivi public d'une commande exige un jeton : seule son empreinte
-- SHA-256 est gardée (voir Order.trackingTokenHash et OrderTrackingToken).

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "trackingTokenHash" TEXT;

-- CreateTable
CREATE TABLE "OrderTrackingToken" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderTrackingToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderTrackingToken_tokenHash_key" ON "OrderTrackingToken"("tokenHash");

-- CreateIndex
CREATE INDEX "OrderTrackingToken_orderId_idx" ON "OrderTrackingToken"("orderId");

-- AddForeignKey
ALTER TABLE "OrderTrackingToken" ADD CONSTRAINT "OrderTrackingToken_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
