-- Versions publiées des pages légales, éditables depuis l'espace superowner
CREATE TABLE "PageLegaleVersion" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "contenu" TEXT NOT NULL,
    "publieLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publiePar" TEXT,

    CONSTRAINT "PageLegaleVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PageLegaleVersion_slug_version_key" ON "PageLegaleVersion"("slug", "version");
CREATE INDEX "PageLegaleVersion_slug_publieLe_idx" ON "PageLegaleVersion"("slug", "publieLe");
