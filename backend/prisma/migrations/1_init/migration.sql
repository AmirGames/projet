-- AlterTable
ALTER TABLE "User" ADD COLUMN "isSuperOwner" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "email" TEXT,
ADD COLUMN "plan" TEXT NOT NULL DEFAULT 'STARTER';

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "Organization_plan_idx" ON "Organization"("plan");
