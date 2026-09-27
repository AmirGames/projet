-- Rôles de l'équipe de la plateforme (SuperAdmin, Administrateur, Support) et
-- leurs permissions, cochées par le superowner.
ALTER TABLE "User" ADD COLUMN "platformRole" TEXT;

CREATE TABLE "PlatformRole" (
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "permissions" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlatformRole_pkey" PRIMARY KEY ("code")
);

-- Les administrateurs déjà nommés gardent leur accès : ils deviennent
-- Administrateurs. Les permissions par défaut sont posées par l'application.
UPDATE "User" SET "platformRole" = 'ADMIN'
WHERE "isSystemAdmin" = true AND "isSuperOwner" = false;
