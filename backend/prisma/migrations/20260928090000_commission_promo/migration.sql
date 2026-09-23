-- La promo « zéro commission » accordée à un commerçant
ALTER TABLE "Organization" ADD COLUMN "commissionFreeActive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organization" ADD COLUMN "commissionFreeUntil" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN "commissionFreeNote" TEXT;

-- Les commandes passées pendant la promo : commission nulle, et qui le reste
ALTER TABLE "Order" ADD COLUMN "commissionWaived" BOOLEAN NOT NULL DEFAULT false;
