-- Le pays de chaque boutique, qui décide des régions du site (/fr-fr/,
-- /be-fr/…) où elle est listée.
ALTER TABLE "Store" ADD COLUMN "countryCode" TEXT;

CREATE INDEX "Store_countryCode_idx" ON "Store"("countryCode");

-- Les boutiques existantes : cinq chiffres de code postal, c'est la France.
-- Quatre chiffres peuvent être belges, suisses ou luxembourgeois : on laisse
-- vide — la boutique reste listée partout — jusqu'à ce que sa prochaine
-- modification d'adresse ou sa prochaine commande la situe.
UPDATE "Store" SET "countryCode" = 'fr' WHERE "postalCode" ~ '^\s*[0-9]{5}\s*$';
