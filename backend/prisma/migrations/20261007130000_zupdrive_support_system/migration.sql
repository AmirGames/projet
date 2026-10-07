-- CreateTable SupportTicket
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketNumber" TEXT NOT NULL UNIQUE,
    "category" TEXT NOT NULL CHECK ("category" IN ('TECHNIQUE', 'PAIEMENT', 'INFRACTION', 'DOCUMENT', 'AUTRE')),
    "priority" TEXT NOT NULL CHECK ("priority" IN ('BASSE', 'MOYENNE', 'HAUTE', 'CRITIQUE')) DEFAULT 'MOYENNE',
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL CHECK ("status" IN ('OUVERT', 'EN_COURS', 'EN_ATTENTE_CLIENT', 'RESOLU', 'FERME')) DEFAULT 'OUVERT',
    "reporterId" TEXT NOT NULL,
    "reporterType" TEXT NOT NULL CHECK ("reporterType" IN ('CHAUFFEUR', 'PASSAGER', 'ADMIN')),
    "assignedTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT
);

-- CreateTable SupportMessage
CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorType" TEXT NOT NULL CHECK ("authorType" IN ('CHAUFFEUR', 'PASSAGER', 'AGENT', 'ADMIN')),
    "message" TEXT NOT NULL,
    "attachmentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex on SupportTicket
CREATE INDEX "SupportTicket_ticketNumber_idx" ON "SupportTicket"("ticketNumber");
CREATE INDEX "SupportTicket_status_idx" ON "SupportTicket"("status");
CREATE INDEX "SupportTicket_priority_idx" ON "SupportTicket"("priority");
CREATE INDEX "SupportTicket_category_idx" ON "SupportTicket"("category");
CREATE INDEX "SupportTicket_reporterId_idx" ON "SupportTicket"("reporterId");
CREATE INDEX "SupportTicket_assignedTo_idx" ON "SupportTicket"("assignedTo");
CREATE INDEX "SupportTicket_createdAt_idx" ON "SupportTicket"("createdAt");

-- CreateIndex on SupportMessage
CREATE INDEX "SupportMessage_ticketId_idx" ON "SupportMessage"("ticketId");
CREATE INDEX "SupportMessage_authorId_idx" ON "SupportMessage"("authorId");
CREATE INDEX "SupportMessage_createdAt_idx" ON "SupportMessage"("createdAt");
