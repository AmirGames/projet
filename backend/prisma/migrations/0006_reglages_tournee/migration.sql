-- Plusieurs courses à la fois : les règles de la tournée deviennent
-- réglables depuis l'espace plateforme.
ALTER TABLE "SystemConfig" ADD COLUMN "driverMaxCourses" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "SystemConfig" ADD COLUMN "driverGroupClientKm" DOUBLE PRECISION NOT NULL DEFAULT 2;
ALTER TABLE "SystemConfig" ADD COLUMN "driverGroupDetourKm" DOUBLE PRECISION NOT NULL DEFAULT 2;
