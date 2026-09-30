-- AlterTable
ALTER TABLE "ChauffeurDrive" ADD COLUMN     "enLigne" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "positionLe" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TarifDrive" (
    "region" TEXT NOT NULL,
    "priseEnChargeCentimes" INTEGER NOT NULL,
    "parKmCentimes" INTEGER NOT NULL,
    "parMinuteCentimes" INTEGER NOT NULL,
    "minimumCentimes" INTEGER NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TarifDrive_pkey" PRIMARY KEY ("region")
);

-- CreateTable
CREATE TABLE "CourseDrive" (
    "id" TEXT NOT NULL,
    "passagerId" TEXT,
    "cleIdempotence" TEXT NOT NULL,
    "chauffeurId" TEXT,
    "statut" TEXT NOT NULL DEFAULT 'RECHERCHE',
    "region" TEXT NOT NULL,
    "departAdresse" TEXT NOT NULL,
    "departLatitude" DOUBLE PRECISION NOT NULL,
    "departLongitude" DOUBLE PRECISION NOT NULL,
    "arriveeAdresse" TEXT NOT NULL,
    "arriveeLatitude" DOUBLE PRECISION NOT NULL,
    "arriveeLongitude" DOUBLE PRECISION NOT NULL,
    "distanceMetres" INTEGER NOT NULL,
    "dureeSecondes" INTEGER NOT NULL,
    "prixCentimes" INTEGER NOT NULL,
    "devise" TEXT NOT NULL DEFAULT 'EUR',
    "tarifApplique" JSONB NOT NULL,
    "accepteeLe" TIMESTAMP(3),
    "arriveeLe" TIMESTAMP(3),
    "debutLe" TIMESTAMP(3),
    "termineeLe" TIMESTAMP(3),
    "annuleeLe" TIMESTAMP(3),
    "annuleePar" TEXT,
    "motifAnnulation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseDrive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropositionCourseDrive" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "chauffeurId" TEXT NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'EN_ATTENTE',
    "distanceMetres" INTEGER NOT NULL,
    "expireA" TIMESTAMP(3) NOT NULL,
    "reponduLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropositionCourseDrive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseDrive_statut_idx" ON "CourseDrive"("statut");

-- CreateIndex
CREATE INDEX "CourseDrive_chauffeurId_statut_idx" ON "CourseDrive"("chauffeurId", "statut");

-- CreateIndex
CREATE INDEX "CourseDrive_passagerId_createdAt_idx" ON "CourseDrive"("passagerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CourseDrive_passagerId_cleIdempotence_key" ON "CourseDrive"("passagerId", "cleIdempotence");

-- CreateIndex
CREATE INDEX "PropositionCourseDrive_statut_expireA_idx" ON "PropositionCourseDrive"("statut", "expireA");

-- CreateIndex
CREATE INDEX "PropositionCourseDrive_chauffeurId_statut_idx" ON "PropositionCourseDrive"("chauffeurId", "statut");

-- CreateIndex
CREATE UNIQUE INDEX "PropositionCourseDrive_courseId_chauffeurId_key" ON "PropositionCourseDrive"("courseId", "chauffeurId");

-- AddForeignKey
ALTER TABLE "CourseDrive" ADD CONSTRAINT "CourseDrive_passagerId_fkey" FOREIGN KEY ("passagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseDrive" ADD CONSTRAINT "CourseDrive_chauffeurId_fkey" FOREIGN KEY ("chauffeurId") REFERENCES "ChauffeurDrive"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropositionCourseDrive" ADD CONSTRAINT "PropositionCourseDrive_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "CourseDrive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropositionCourseDrive" ADD CONSTRAINT "PropositionCourseDrive_chauffeurId_fkey" FOREIGN KEY ("chauffeurId") REFERENCES "ChauffeurDrive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

