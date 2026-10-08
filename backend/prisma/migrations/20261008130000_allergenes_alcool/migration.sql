-- Allergènes (règlement (UE) 1169/2011) et alcool sur les produits.
-- Colonnes avec valeur par défaut : les produits existants restent « non renseignés ».
CREATE TYPE "Allergen" AS ENUM ('GLUTEN', 'CRUSTACEANS', 'EGGS', 'FISH', 'PEANUTS', 'SOYBEANS', 'MILK', 'NUTS', 'CELERY', 'MUSTARD', 'SESAME', 'SULPHITES', 'LUPIN', 'MOLLUSCS');

ALTER TABLE "Product"
  ADD COLUMN "allergens" "Allergen"[] DEFAULT ARRAY[]::"Allergen"[],
  ADD COLUMN "allergensDeclared" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "containsAlcohol" BOOLEAN NOT NULL DEFAULT false;
