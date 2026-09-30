-- DropIndex
DROP INDEX "DocumentChauffeurDrive_chauffeurId_type_key";

-- AlterTable
ALTER TABLE "DocumentChauffeurDrive" ADD COLUMN     "archiveeLe" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "DocumentChauffeurDrive_chauffeurId_type_idx" ON "DocumentChauffeurDrive"("chauffeurId", "type");

