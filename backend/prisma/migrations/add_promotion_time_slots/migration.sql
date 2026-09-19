-- Plage horaire et jours de la semaine pour les promotions.
-- Les champs existent dans le code frontend depuis la dernière session
-- mais n'avaient pas encore de colonne en base, donc rien n'était sauvegardé.

ALTER TABLE "Promotion"
  ADD COLUMN IF NOT EXISTS "activeFromTime" TEXT,
  ADD COLUMN IF NOT EXISTS "activeToTime"   TEXT,
  ADD COLUMN IF NOT EXISTS "activeDays"     INTEGER[] NOT NULL DEFAULT '{}';
