-- Fermer un commerce (archivage puis suppression des données à 60 jours) et
-- le rouvrir deviennent un droit à part, distinct de la suspension.
-- Les rôles qui modifiaient les organisations le gardent, sauf le Support :
-- il peut toujours suspendre et réactiver, plus fermer.
UPDATE "PlatformRole"
SET "permissions" = "permissions" || '{"organizations-close": "write"}'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "permissions"->>'organizations' = 'write'
  AND "code" <> 'SUPPORT';
