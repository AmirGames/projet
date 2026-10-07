-- CreateTable ChauffeurDocument
CREATE TABLE "ChauffeurDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "driverId" TEXT NOT NULL,
    "type" TEXT NOT NULL CHECK ("type" IN ('PERMIS', 'ASSURANCE', 'INSPECTION', 'IDENTITE')),
    "status" TEXT NOT NULL CHECK ("status" IN ('VALIDE', 'EXPIREE', 'EN_ATTENTE')) DEFAULT 'EN_ATTENTE',
    "url" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "verifiedAt" DATETIME,
    "verifiedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChauffeurDocument_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "ChauffeurDrive" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE("driverId", "type")
);

-- CreateTable ChauffeurInfraction
CREATE TABLE "ChauffeurInfraction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "driverId" TEXT NOT NULL,
    "type" TEXT NOT NULL CHECK ("type" IN ('PLAINTE_PASSAGER', 'ACCIDENT', 'INFRACTION_CODE_ROUTE', 'AUTRE')),
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL CHECK ("severity" IN ('BASSE', 'MOYENNE', 'HAUTE')),
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "resolution" TEXT,
    CONSTRAINT "ChauffeurInfraction_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "ChauffeurDrive" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AddColumn suspendedAt and suspensionReason to ChauffeurDrive
ALTER TABLE "ChauffeurDrive" ADD COLUMN "suspendedAt" DATETIME;
ALTER TABLE "ChauffeurDrive" ADD COLUMN "suspensionReason" TEXT;

-- CreateIndex on ChauffeurDocument
CREATE INDEX "ChauffeurDocument_driverId_idx" ON "ChauffeurDocument"("driverId");
CREATE INDEX "ChauffeurDocument_status_idx" ON "ChauffeurDocument"("status");
CREATE INDEX "ChauffeurDocument_expiresAt_idx" ON "ChauffeurDocument"("expiresAt");

-- CreateIndex on ChauffeurInfraction
CREATE INDEX "ChauffeurInfraction_driverId_idx" ON "ChauffeurInfraction"("driverId");
CREATE INDEX "ChauffeurInfraction_severity_idx" ON "ChauffeurInfraction"("severity");
CREATE INDEX "ChauffeurInfraction_resolvedAt_idx" ON "ChauffeurInfraction"("resolvedAt");
