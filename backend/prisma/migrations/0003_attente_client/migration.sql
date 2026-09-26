-- Attente du client injoignable.
--
-- Le livreur est à la porte et le client ne répond pas : six minutes
-- commencent, visibles des deux côtés. La photo du dépôt n'est permise qu'à
-- leur terme.
ALTER TABLE "OrderDelivery" ADD COLUMN "customerWaitStartedAt" TIMESTAMP(3);
