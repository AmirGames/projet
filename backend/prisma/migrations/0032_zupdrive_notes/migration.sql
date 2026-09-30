-- CreateTable
CREATE TABLE "NoteCourseDrive" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "auteur" TEXT NOT NULL,
    "chauffeurId" TEXT NOT NULL,
    "passagerId" TEXT,
    "note" INTEGER NOT NULL,
    "commentaire" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteCourseDrive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NoteCourseDrive_chauffeurId_auteur_idx" ON "NoteCourseDrive"("chauffeurId", "auteur");

-- CreateIndex
CREATE INDEX "NoteCourseDrive_passagerId_auteur_idx" ON "NoteCourseDrive"("passagerId", "auteur");

-- CreateIndex
CREATE UNIQUE INDEX "NoteCourseDrive_courseId_auteur_key" ON "NoteCourseDrive"("courseId", "auteur");

-- AddForeignKey
ALTER TABLE "NoteCourseDrive" ADD CONSTRAINT "NoteCourseDrive_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "CourseDrive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteCourseDrive" ADD CONSTRAINT "NoteCourseDrive_chauffeurId_fkey" FOREIGN KEY ("chauffeurId") REFERENCES "ChauffeurDrive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteCourseDrive" ADD CONSTRAINT "NoteCourseDrive_passagerId_fkey" FOREIGN KEY ("passagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

