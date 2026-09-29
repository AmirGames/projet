-- La part d'une facture déjà réglée par retenue sur les reversements.
ALTER TABLE "PlatformInvoice" ADD COLUMN "prepaidAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;
