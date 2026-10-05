-- CreateTable
CREATE TABLE "AssistantConversation" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "guestHash" TEXT,
    "host" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "category" TEXT,
    "agentId" TEXT,
    "orgId" TEXT,
    "storeId" TEXT,
    "segment" INTEGER NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "state" TEXT NOT NULL DEFAULT 'OPEN',
    "busyUntil" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "agentId" TEXT,
    "segment" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'COMPLETE',
    "mode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantAction" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "target" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "segment" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "result" JSONB,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantToolExecution" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "actorId" TEXT,
    "tool" TEXT NOT NULL,
    "target" TEXT,
    "status" TEXT NOT NULL,
    "code" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantToolExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantHandoff" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "segment" INTEGER NOT NULL,
    "service" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "summary" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL,
    "ticketId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'OPEN',
    "reply" TEXT,
    "repliedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantHandoff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantConversation_ownerId_host_updatedAt_idx" ON "AssistantConversation"("ownerId", "host", "updatedAt");

-- CreateIndex
CREATE INDEX "AssistantConversation_guestHash_host_idx" ON "AssistantConversation"("guestHash", "host");

-- CreateIndex
CREATE INDEX "AssistantConversation_expiresAt_idx" ON "AssistantConversation"("expiresAt");

-- CreateIndex
CREATE INDEX "AssistantMessage_conversationId_segment_createdAt_idx" ON "AssistantMessage"("conversationId", "segment", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantMessage_conversationId_clientKey_author_key" ON "AssistantMessage"("conversationId", "clientKey", "author");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantAction_idempotencyKey_key" ON "AssistantAction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AssistantAction_conversationId_state_idx" ON "AssistantAction"("conversationId", "state");

-- CreateIndex
CREATE INDEX "AssistantToolExecution_conversationId_startedAt_idx" ON "AssistantToolExecution"("conversationId", "startedAt");

-- CreateIndex
CREATE INDEX "AssistantHandoff_service_state_createdAt_idx" ON "AssistantHandoff"("service", "state", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantHandoff_conversationId_segment_key" ON "AssistantHandoff"("conversationId", "segment");

-- AddForeignKey
ALTER TABLE "AssistantConversation" ADD CONSTRAINT "AssistantConversation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AssistantConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantAction" ADD CONSTRAINT "AssistantAction_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AssistantConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantToolExecution" ADD CONSTRAINT "AssistantToolExecution_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AssistantConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantHandoff" ADD CONSTRAINT "AssistantHandoff_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AssistantConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
