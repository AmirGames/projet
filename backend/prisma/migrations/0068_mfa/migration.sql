ALTER TABLE "SessionConnexion" ADD COLUMN "mfaVerifiedAt" TIMESTAMP(3), ADD COLUMN "mfaVersion" INTEGER, ADD COLUMN "mfaRecovery" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "MfaFactor" (
  "userId" TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "secretCipher" TEXT, "enabled" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 0, "lastStep" INTEGER NOT NULL DEFAULT -1,
  "recoveryHashes" TEXT[] NOT NULL, "pendingCipher" TEXT, "pendingSession" TEXT,
  "pendingExpiresAt" TIMESTAMP(3), "failures" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMP(3)
);
