-- AlterTable
ALTER TABLE "OrderDelivery" ADD COLUMN     "customerWaitLeftAt" TIMESTAMP(3),
ADD COLUMN     "payoutHold" TEXT,
ADD COLUMN     "payoutHoldReason" TEXT,
ADD COLUMN     "payoutHoldReleasedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "OrderDelivery_payoutHold_idx" ON "OrderDelivery"("payoutHold");
