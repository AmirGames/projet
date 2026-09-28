-- Au plus un superowner.
--
-- Le premier compte inscrit devenait superowner : deux inscriptions
-- simultanées sur une base vide en créaient deux, et le premier robot venu
-- prenait la plateforme. L'inscription ne donne plus aucun droit ; le
-- superowner se crée avec `npm run create-superowner`, et la base refuse
-- désormais d'en porter un second.
--
-- Une base qui en compte déjà plusieurs garde le plus ancien. Les autres
-- restent dans l'équipe, en SuperAdmin sur chaque plateforme : ils gardent
-- l'accès à tout, sans les réglages réservés au superowner.

WITH surnumeraires AS (
    SELECT id FROM "User"
    WHERE "isSuperOwner" = true
      AND id <> (
          SELECT id FROM "User" WHERE "isSuperOwner" = true
          ORDER BY "createdAt" ASC, id ASC LIMIT 1
      )
)
INSERT INTO "AccesEquipe" ("userId", "plateforme", "role", "createdAt", "updatedAt")
SELECT s.id, p.plateforme, 'SUPER_ADMIN', now(), now()
FROM surnumeraires s
CROSS JOIN unnest(enum_range(NULL::"Plateforme")) AS p(plateforme)
ON CONFLICT ("userId", "plateforme") DO UPDATE SET "role" = 'SUPER_ADMIN', "updatedAt" = now();

UPDATE "User"
SET "isSuperOwner" = false, "isSystemAdmin" = true
WHERE "isSuperOwner" = true
  AND id <> (
      SELECT id FROM "User" WHERE "isSuperOwner" = true
      ORDER BY "createdAt" ASC, id ASC LIMIT 1
  );

CREATE UNIQUE INDEX "User_un_seul_superowner" ON "User" ((true)) WHERE "isSuperOwner" = true;
