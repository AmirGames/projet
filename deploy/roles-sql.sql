-- Séparer le rôle SQL des migrations de celui de l'exécution.
--
-- Aujourd'hui l'API se connecte avec le rôle propriétaire du schéma : une faille
-- d'injection ou un défaut applicatif pourrait donc modifier ou supprimer des
-- tables. Ce script crée un rôle d'exécution qui lit et écrit les données mais
-- ne touche pas au schéma. Les migrations (service « migrate ») gardent le rôle
-- propriétaire, via DATABASE_URL_MIGRATION.
--
-- À lancer une fois, par le propriétaire (rôle POSTGRES_USER), après avoir
-- choisi un mot de passe fort :
--
--   ./deploy/zup.sh psql   puis coller ce fichier en remplaçant le mot de passe,
--   ou : docker compose --env-file .env.production -f docker-compose.prod.yml \
--          exec -T postgres psql -U zupone -d zupone \
--          -v mdp="'LE_MOT_DE_PASSE'" -v proprietaire=zupone -f - < deploy/roles-sql.sql
--
-- Puis dans .env.production :
--   DATABASE_URL_APP=postgresql://zupone_app:LE_MOT_DE_PASSE@postgres:5432/zupone?schema=public
--   DATABASE_URL_MIGRATION=postgresql://zupone:MOT_DE_PASSE_PROPRIETAIRE@postgres:5432/zupone?schema=public
-- et ./deploy/zup.sh up. Vérification : voir la fin de ce fichier.
--
-- À relire avant usage : ce rôle peut SUPPRIMER des lignes (les tâches de
-- rétention RGPD en ont besoin). Les journaux « en ajout seul » sont protégés
-- par des déclencheurs ; resserrer encore (REVOKE UPDATE, DELETE sur ces tables)
-- demande de vérifier d'abord que rien dans l'application ne les purge.

CREATE ROLE zupone_app LOGIN PASSWORD :mdp;

GRANT CONNECT ON DATABASE :"DBNAME" TO zupone_app;
GRANT USAGE ON SCHEMA public TO zupone_app;

-- Les tables et séquences existantes…
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO zupone_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO zupone_app;

-- … et celles que créeront les migrations futures (lancées par le propriétaire).
ALTER DEFAULT PRIVILEGES FOR ROLE :proprietaire IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO zupone_app;
ALTER DEFAULT PRIVILEGES FOR ROLE :proprietaire IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO zupone_app;

-- Le rôle d'exécution ne crée rien dans le schéma.
REVOKE CREATE ON SCHEMA public FROM zupone_app;

-- Vérification (doit échouer pour le rôle d'exécution, réussir pour le propriétaire) :
--   psql "postgresql://zupone_app:…@…/zupone" -c 'CREATE TABLE essai (id int)'
--   psql "postgresql://zupone_app:…@…/zupone" -c 'DROP TABLE "User"'
--   psql "postgresql://zupone_app:…@…/zupone" -c 'SELECT count(*) FROM "User"'   -- doit réussir
