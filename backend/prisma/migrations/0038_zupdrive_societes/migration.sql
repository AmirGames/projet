-- ZupDrive — sociétés de taxi / VTC, leurs véhicules et leurs chauffeurs.
-- Une société détient les licences et les véhicules ; ses chauffeurs roulent
-- pour elle (une société à la fois). Voir docs/zupdrive.md, « Sociétés ».
--
-- Purement additif : aucune donnée existante n'est modifiée. Les pièces
-- existantes gardent leur chauffeur (chauffeurId devient seulement facultatif).

-- AlterTable
ALTER TABLE "ChauffeurDrive" ADD COLUMN     "rattacheLe" TIMESTAMP(3),
ADD COLUMN     "societeId" TEXT,
ADD COLUMN     "vehiculeId" TEXT;

-- AlterTable
ALTER TABLE "CourseDrive" ADD COLUMN     "societeId" TEXT,
ADD COLUMN     "vehiculeId" TEXT;

-- AlterTable
ALTER TABLE "DocumentChauffeurDrive" ADD COLUMN     "societeId" TEXT,
ADD COLUMN     "vehiculeId" TEXT,
ALTER COLUMN "chauffeurId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "SocieteDrive" (
    "id" TEXT NOT NULL,
    "gerantId" TEXT NOT NULL,
    "raisonSociale" TEXT NOT NULL,
    "numeroEntreprise" TEXT,
    "region" TEXT,
    "telephone" TEXT,
    "statut" TEXT NOT NULL DEFAULT 'BROUILLON',
    "motifStatut" TEXT,
    "soumisLe" TIMESTAMP(3),
    "valideLe" TIMESTAMP(3),
    "validePar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocieteDrive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehiculeDrive" (
    "id" TEXT NOT NULL,
    "societeId" TEXT NOT NULL,
    "marque" TEXT NOT NULL,
    "modele" TEXT NOT NULL,
    "plaque" TEXT NOT NULL,
    "numeroLicence" TEXT,
    "conforme" BOOLEAN NOT NULL DEFAULT false,
    "retireLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehiculeDrive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvitationSocieteDrive" (
    "id" TEXT NOT NULL,
    "societeId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'EN_ATTENTE',
    "reponduLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvitationSocieteDrive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SocieteDrive_gerantId_key" ON "SocieteDrive"("gerantId");

-- CreateIndex
CREATE UNIQUE INDEX "SocieteDrive_numeroEntreprise_key" ON "SocieteDrive"("numeroEntreprise");

-- CreateIndex
CREATE INDEX "SocieteDrive_statut_idx" ON "SocieteDrive"("statut");

-- CreateIndex
CREATE INDEX "VehiculeDrive_societeId_idx" ON "VehiculeDrive"("societeId");

-- CreateIndex
CREATE INDEX "InvitationSocieteDrive_email_statut_idx" ON "InvitationSocieteDrive"("email", "statut");

-- CreateIndex
CREATE INDEX "InvitationSocieteDrive_societeId_statut_idx" ON "InvitationSocieteDrive"("societeId", "statut");

-- CreateIndex
CREATE UNIQUE INDEX "ChauffeurDrive_vehiculeId_key" ON "ChauffeurDrive"("vehiculeId");

-- CreateIndex
CREATE INDEX "ChauffeurDrive_societeId_idx" ON "ChauffeurDrive"("societeId");

-- CreateIndex
CREATE INDEX "CourseDrive_societeId_createdAt_idx" ON "CourseDrive"("societeId", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentChauffeurDrive_societeId_type_idx" ON "DocumentChauffeurDrive"("societeId", "type");

-- CreateIndex
CREATE INDEX "DocumentChauffeurDrive_vehiculeId_type_idx" ON "DocumentChauffeurDrive"("vehiculeId", "type");

-- AddForeignKey
ALTER TABLE "ChauffeurDrive" ADD CONSTRAINT "ChauffeurDrive_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "SocieteDrive"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChauffeurDrive" ADD CONSTRAINT "ChauffeurDrive_vehiculeId_fkey" FOREIGN KEY ("vehiculeId") REFERENCES "VehiculeDrive"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocieteDrive" ADD CONSTRAINT "SocieteDrive_gerantId_fkey" FOREIGN KEY ("gerantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehiculeDrive" ADD CONSTRAINT "VehiculeDrive_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "SocieteDrive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvitationSocieteDrive" ADD CONSTRAINT "InvitationSocieteDrive_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "SocieteDrive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentChauffeurDrive" ADD CONSTRAINT "DocumentChauffeurDrive_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "SocieteDrive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentChauffeurDrive" ADD CONSTRAINT "DocumentChauffeurDrive_vehiculeId_fkey" FOREIGN KEY ("vehiculeId") REFERENCES "VehiculeDrive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseDrive" ADD CONSTRAINT "CourseDrive_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "SocieteDrive"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseDrive" ADD CONSTRAINT "CourseDrive_vehiculeId_fkey" FOREIGN KEY ("vehiculeId") REFERENCES "VehiculeDrive"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Une pièce appartient à exactement un dossier : un chauffeur, une société ou
-- un véhicule. Toutes les pièces existantes ont un chauffeur : la contrainte
-- est satisfaite dès sa création.
ALTER TABLE "DocumentChauffeurDrive" ADD CONSTRAINT "DocumentChauffeurDrive_un_seul_dossier"
    CHECK (num_nonnulls("chauffeurId", "societeId", "vehiculeId") = 1);

-- Une plaque ne roule que pour une société à la fois. Un véhicule retiré garde
-- sa plaque dans l'historique sans empêcher son inscription ailleurs.
CREATE UNIQUE INDEX "VehiculeDrive_plaque_active_key" ON "VehiculeDrive"("plaque") WHERE "retireLe" IS NULL;

-- Au plus une invitation en attente par société et par adresse : inviter deux
-- fois (double clic, retry) rend la même invitation.
CREATE UNIQUE INDEX "InvitationSocieteDrive_en_attente_key" ON "InvitationSocieteDrive"("societeId", "email") WHERE "statut" = 'EN_ATTENTE';
