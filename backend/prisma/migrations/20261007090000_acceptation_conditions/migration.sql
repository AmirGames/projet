-- Preuve d'acceptation des CGU / CGV / conditions commerçants et livreurs
CREATE TABLE "AcceptationConditions" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "orderId" TEXT,
    "email" TEXT NOT NULL,
    "documents" TEXT[],
    "version" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcceptationConditions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AcceptationConditions_userId_idx" ON "AcceptationConditions"("userId");
CREATE INDEX "AcceptationConditions_orderId_idx" ON "AcceptationConditions"("orderId");
CREATE INDEX "AcceptationConditions_email_idx" ON "AcceptationConditions"("email");
