-- Connexion unique entre les domaines (SSO) : une session par connexion,
-- que les jetons portent et que la déconnexion ferme partout, et les codes à
-- usage unique qui la font passer d'un domaine à l'autre. Voir
-- src/services/sso.service.ts.

-- CreateTable
CREATE TABLE "SessionConnexion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jetonCentralHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "SessionConnexion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeConnexion" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodeConnexion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SessionConnexion_jetonCentralHash_key" ON "SessionConnexion"("jetonCentralHash");

-- CreateIndex
CREATE INDEX "SessionConnexion_userId_idx" ON "SessionConnexion"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CodeConnexion_codeHash_key" ON "CodeConnexion"("codeHash");

-- CreateIndex
CREATE INDEX "CodeConnexion_expiresAt_idx" ON "CodeConnexion"("expiresAt");

-- AddForeignKey
ALTER TABLE "SessionConnexion" ADD CONSTRAINT "SessionConnexion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeConnexion" ADD CONSTRAINT "CodeConnexion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SessionConnexion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
