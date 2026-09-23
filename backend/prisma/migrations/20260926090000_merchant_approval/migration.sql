-- La validation d'un commerce par la plateforme
ALTER TABLE "Organization" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN "approvedBy" TEXT;

-- Les commerces déjà inscrits vendaient avant que la validation n'existe : ils
-- sont considérés validés, sans quoi tous fermeraient le jour de la mise à jour.
UPDATE "Organization" SET "approvedAt" = NOW() WHERE "approvedAt" IS NULL;

-- Le rappel d'expiration d'une pièce, envoyé une seule fois
ALTER TABLE "OrganizationDocument" ADD COLUMN "expiryReminderAt" TIMESTAMP(3);
