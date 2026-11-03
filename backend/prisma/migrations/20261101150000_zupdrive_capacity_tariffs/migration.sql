ALTER TABLE "ChauffeurDrive"
ADD COLUMN "placesPassagers" INTEGER;

ALTER TABLE "VehiculeDrive"
ADD COLUMN "placesPassagers" INTEGER;

ALTER TABLE "CourseDrive"
ADD COLUMN "nombrePassagers" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "CourseDrive"
ADD CONSTRAINT "CourseDrive_nombrePassagers_check"
CHECK ("nombrePassagers" BETWEEN 1 AND 6);

ALTER TABLE "ChauffeurDrive"
ADD CONSTRAINT "ChauffeurDrive_placesPassagers_check"
CHECK ("placesPassagers" IS NULL OR "placesPassagers" BETWEEN 1 AND 6);

ALTER TABLE "VehiculeDrive"
ADD CONSTRAINT "VehiculeDrive_placesPassagers_check"
CHECK ("placesPassagers" IS NULL OR "placesPassagers" BETWEEN 1 AND 6);

CREATE TABLE "TarifVehiculeDrive" (
    "region" TEXT NOT NULL,
    "categorie" TEXT NOT NULL DEFAULT 'XL',
    "priseEnChargeCentimes" INTEGER NOT NULL,
    "parKmCentimes" INTEGER NOT NULL,
    "parMinuteCentimes" INTEGER NOT NULL,
    "minimumCentimes" INTEGER NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TarifVehiculeDrive_pkey" PRIMARY KEY ("region", "categorie"),
    CONSTRAINT "TarifVehiculeDrive_region_fkey" FOREIGN KEY ("region")
        REFERENCES "TarifDrive"("region") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TarifVehiculeDrive_categorie_check" CHECK ("categorie" = 'XL'),
    CONSTRAINT "TarifVehiculeDrive_montants_check" CHECK (
        "priseEnChargeCentimes" >= 0 AND "parKmCentimes" >= 0 AND
        "parMinuteCentimes" >= 0 AND "minimumCentimes" >= 0
    )
);
