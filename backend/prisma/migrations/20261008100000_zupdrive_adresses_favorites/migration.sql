-- Adresses « Domicile » et « Travail » des passagers ZupDrive.
-- Table nouvelle : aucune donnée existante n'est touchée.
CREATE TABLE "AdresseFavoriteDrive" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "adresse" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "codePostal" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdresseFavoriteDrive_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdresseFavoriteDrive_userId_type_key" ON "AdresseFavoriteDrive"("userId", "type");

ALTER TABLE "AdresseFavoriteDrive" ADD CONSTRAINT "AdresseFavoriteDrive_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
