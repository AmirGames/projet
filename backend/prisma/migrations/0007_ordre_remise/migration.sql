-- Tournée : l'ordre des remises, figé une fois toutes les commandes
-- récupérées. Seule la première se montre et se remet.
ALTER TABLE "OrderDelivery" ADD COLUMN "ordreRemise" INTEGER;
