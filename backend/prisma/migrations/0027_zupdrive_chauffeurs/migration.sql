-- CreateTable
CREATE TABLE "ChauffeurDrive" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nomComplet" TEXT NOT NULL,
    "telephone" TEXT,
    "region" TEXT,
    "numeroEntreprise" TEXT,
    "raisonSociale" TEXT,
    "numeroLicence" TEXT,
    "vehiculeMarque" TEXT,
    "vehiculeModele" TEXT,
    "vehiculePlaque" TEXT,
    "statut" TEXT NOT NULL DEFAULT 'BROUILLON',
    "motifStatut" TEXT,
    "soumisLe" TIMESTAMP(3),
    "valideLe" TIMESTAMP(3),
    "validePar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChauffeurDrive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentChauffeurDrive" (
    "id" TEXT NOT NULL,
    "chauffeurId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "dateExpiration" TIMESTAMP(3),
    "statut" TEXT NOT NULL DEFAULT 'PENDING',
    "noteExamen" TEXT,
    "examineLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentChauffeurDrive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChauffeurDrive_userId_key" ON "ChauffeurDrive"("userId");

-- CreateIndex
CREATE INDEX "ChauffeurDrive_statut_idx" ON "ChauffeurDrive"("statut");

-- CreateIndex
CREATE INDEX "DocumentChauffeurDrive_statut_idx" ON "DocumentChauffeurDrive"("statut");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentChauffeurDrive_chauffeurId_type_key" ON "DocumentChauffeurDrive"("chauffeurId", "type");

-- AddForeignKey
ALTER TABLE "ChauffeurDrive" ADD CONSTRAINT "ChauffeurDrive_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentChauffeurDrive" ADD CONSTRAINT "DocumentChauffeurDrive_chauffeurId_fkey" FOREIGN KEY ("chauffeurId") REFERENCES "ChauffeurDrive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

