-- Dernier visiteur du commerce de démonstration (voir demo.service.ts).
ALTER TABLE "Organization" ADD COLUMN "demoVisiteurHash" TEXT;
ALTER TABLE "Organization" ADD COLUMN "demoActiviteAt" TIMESTAMP(3);
