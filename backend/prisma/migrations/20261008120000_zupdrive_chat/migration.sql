-- Chat passager / chauffeur d'une course ZupDrive. Table nouvelle : aucune donnée existante n'est touchée.
-- CreateTable
CREATE TABLE "MessageCourseDrive" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "auteur" TEXT NOT NULL,
    "texte" TEXT NOT NULL,
    "cleIdempotence" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageCourseDrive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageCourseDrive_courseId_createdAt_idx" ON "MessageCourseDrive"("courseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessageCourseDrive_courseId_auteur_cleIdempotence_key" ON "MessageCourseDrive"("courseId", "auteur", "cleIdempotence");

-- AddForeignKey
ALTER TABLE "MessageCourseDrive" ADD CONSTRAINT "MessageCourseDrive_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "CourseDrive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

