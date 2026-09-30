-- AlterTable
ALTER TABLE "DocumentChauffeurDrive" ADD COLUMN     "rappel10JoursLe" TIMESTAMP(3),
ADD COLUMN     "rappel30JoursLe" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "DocumentChauffeurDrive_dateExpiration_idx" ON "DocumentChauffeurDrive"("dateExpiration");

