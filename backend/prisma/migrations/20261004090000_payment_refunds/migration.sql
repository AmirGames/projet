-- Remboursement des paiements en ligne
ALTER TYPE "PaymentStatus" ADD VALUE 'REFUNDED';

ALTER TABLE "Payment" ADD COLUMN "refundedAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN "refundedAmount" DECIMAL(10,2);
ALTER TABLE "Payment" ADD COLUMN "stripeRefundId" TEXT;
