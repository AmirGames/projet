-- Les rôles de l'équipe deviennent propres à chaque plateforme du groupe
-- (ZupEat, ZupDrive) : une personne peut être SuperAdmin sur l'une et Support
-- sur l'autre.
CREATE TYPE "Plateforme" AS ENUM ('EAT', 'DRIVE');

-- Les permissions des groupes se règlent plateforme par plateforme. Celles
-- qui existent étaient celles de ZupEat, la seule plateforme jusqu'ici.
ALTER TABLE "PlatformRole" ADD COLUMN "plateforme" "Plateforme" NOT NULL DEFAULT 'EAT';
ALTER TABLE "PlatformRole" DROP CONSTRAINT "PlatformRole_pkey";
ALTER TABLE "PlatformRole" ADD CONSTRAINT "PlatformRole_pkey" PRIMARY KEY ("plateforme", "code");

CREATE TABLE "AccesEquipe" (
    "userId" TEXT NOT NULL,
    "plateforme" "Plateforme" NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AccesEquipe_pkey" PRIMARY KEY ("userId", "plateforme")
);
CREATE INDEX "AccesEquipe_plateforme_role_idx" ON "AccesEquipe"("plateforme", "role");
ALTER TABLE "AccesEquipe" ADD CONSTRAINT "AccesEquipe_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Les membres déjà nommés gardent leur rôle, sur ZupEat.
INSERT INTO "AccesEquipe" ("userId", "plateforme", "role", "updatedAt")
SELECT "id", 'EAT', "platformRole", CURRENT_TIMESTAMP
FROM "User"
WHERE "platformRole" IS NOT NULL AND "isSuperOwner" = false;

ALTER TABLE "User" DROP COLUMN "platformRole";
