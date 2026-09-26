-- Fin des mots de passe en clair.
--
-- Des comptes ont été créés avec le mot de passe enregistré en clair dans
-- "passwordHash". La connexion les convertissait jusqu'ici à la volée, ce qui
-- l'obligeait à accepter encore une comparaison en clair. Cette migration
-- convertit d'un coup ceux qui restent, puis interdit à la base d'en accueillir
-- de nouveaux : la connexion ne compare plus que des empreintes bcrypt.

-- 1. Les derniers comptes en clair reçoivent une empreinte bcrypt ($2a$, coût
--    10, comme AuthService.hashPassword) : leur mot de passe reste valable.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE "User"
SET "passwordHash" = crypt("passwordHash", gen_salt('bf', 10))
WHERE "passwordHash" NOT LIKE '$2%';

-- 2. Plus aucune valeur autre qu'une empreinte bcrypt n'est acceptée.
ALTER TABLE "User"
  ADD CONSTRAINT "User_passwordHash_bcrypt"
  CHECK ("passwordHash" LIKE '$2%');
