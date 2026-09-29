-- Le commerce de démonstration (voir demo.service.ts).
ALTER TABLE "Organization" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;
