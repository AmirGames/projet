-- Le pourboire laissé au livreur, à part du total de la commande.
ALTER TABLE "Order" ADD COLUMN "tipAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;
