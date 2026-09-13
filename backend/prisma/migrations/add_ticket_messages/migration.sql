-- Archivage des tickets fermés
ALTER TABLE "MerchantTicket" ADD COLUMN "archivedAt" TIMESTAMP(3);
CREATE INDEX "MerchantTicket_archivedAt_idx" ON "MerchantTicket"("archivedAt");

-- Fil de discussion des tickets
CREATE TABLE "TicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorRole" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TicketMessage_ticketId_idx" ON "TicketMessage"("ticketId");
CREATE INDEX "TicketMessage_createdAt_idx" ON "TicketMessage"("createdAt");

ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "MerchantTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Notifications non liées à une boutique (support) et lien profond
ALTER TABLE "Notification" ALTER COLUMN "storeId" DROP NOT NULL;
ALTER TABLE "Notification" ADD COLUMN "link" TEXT;
ALTER TYPE "NotificationType" ADD VALUE 'TICKET_MESSAGE';
