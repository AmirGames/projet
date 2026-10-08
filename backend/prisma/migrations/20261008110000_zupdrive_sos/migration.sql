-- Alerte SOS des passagers ZupDrive et contact de confiance. Tables nouvelles : aucune donnée existante n'est touchée.
-- CreateTable
CREATE TABLE "ContactConfianceDrive" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "consentementLe" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactConfianceDrive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlerteSosDrive" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "passagerId" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "ticketNumber" TEXT,
    "equipePrevenueLe" TIMESTAMP(3),
    "contactPrevenuLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlerteSosDrive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContactConfianceDrive_userId_key" ON "ContactConfianceDrive"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AlerteSosDrive_courseId_key" ON "AlerteSosDrive"("courseId");

-- CreateIndex
CREATE INDEX "AlerteSosDrive_passagerId_idx" ON "AlerteSosDrive"("passagerId");

-- AddForeignKey
ALTER TABLE "ContactConfianceDrive" ADD CONSTRAINT "ContactConfianceDrive_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlerteSosDrive" ADD CONSTRAINT "AlerteSosDrive_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "CourseDrive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlerteSosDrive" ADD CONSTRAINT "AlerteSosDrive_passagerId_fkey" FOREIGN KEY ("passagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

