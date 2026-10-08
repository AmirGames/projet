-- Idempotence des notifications ZupDrive (clé unique) et compte bancaire du chauffeur (table nouvelle).
-- Aucune donnée existante n'est modifiée : une colonne nullable et une table vide.

-- AlterTable
ALTER TABLE "NotificationLog" ADD COLUMN     "dedupeKey" TEXT;

-- CreateTable
CREATE TABLE "CompteBancaireChauffeurDrive" (
    "id" TEXT NOT NULL,
    "chauffeurId" TEXT NOT NULL,
    "iban" TEXT NOT NULL,
    "bic" TEXT,
    "accountHolder" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompteBancaireChauffeurDrive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompteBancaireChauffeurDrive_chauffeurId_key" ON "CompteBancaireChauffeurDrive"("chauffeurId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationLog_dedupeKey_key" ON "NotificationLog"("dedupeKey");

-- AddForeignKey
ALTER TABLE "CompteBancaireChauffeurDrive" ADD CONSTRAINT "CompteBancaireChauffeurDrive_chauffeurId_fkey" FOREIGN KEY ("chauffeurId") REFERENCES "ChauffeurDrive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

