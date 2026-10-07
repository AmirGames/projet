-- Remboursements clients répercutés sur les relevés de reversement commerçant
ALTER TABLE "Payment" ADD COLUMN "refundAccountedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;
