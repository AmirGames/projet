-- L'export du dossier d'un incident de livraison a sa propre section de
-- droits (données personnelles). Les permissions par défaut ne s'appliquent
-- qu'aux rôles créés après coup : on l'ouvre ici aux rôles SuperAdmin et
-- Administrateur déjà enregistrés de ZupEat, et à eux seuls.
UPDATE "PlatformRole"
SET "permissions" = "permissions"::jsonb || '{"incidents-export": "write"}'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "plateforme" = 'EAT' AND "code" IN ('SUPER_ADMIN', 'ADMIN');
