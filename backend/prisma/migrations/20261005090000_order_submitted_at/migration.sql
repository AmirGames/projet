-- Une commande payée par carte n'arrive au commerçant qu'une fois encaissée
ALTER TABLE "Order" ADD COLUMN "submittedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

-- Les commandes déjà passées lui sont toutes parvenues, à leur création.
UPDATE "Order" SET "submittedAt" = "createdAt";

CREATE INDEX "Order_submittedAt_idx" ON "Order"("submittedAt");
