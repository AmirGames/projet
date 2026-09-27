-- Livraison offerte dès un montant de panier, réglable par zone. Vide : la
-- zone garde ses frais quel que soit le panier.
ALTER TABLE "DeliveryZone" ADD COLUMN "freeAbove" DECIMAL(10,2);
