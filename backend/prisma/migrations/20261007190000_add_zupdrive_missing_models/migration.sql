-- AddTable: ComplianceReportDrive
-- Store automated compliance check results with 8-point verification scores
CREATE TABLE "ComplianceReportDrive" (
  "id" TEXT NOT NULL,
  "chauffeurId" TEXT NOT NULL,
  "riskLevel" TEXT NOT NULL DEFAULT 'LOW',
  "complianceScore" INTEGER NOT NULL DEFAULT 0,
  "documentIntegrity" INTEGER NOT NULL DEFAULT 0,
  "completionRate" INTEGER NOT NULL DEFAULT 0,
  "stabilityRate" INTEGER NOT NULL DEFAULT 0,
  "fraudIndicators" TEXT NOT NULL DEFAULT '[]',
  "verificationPoints" TEXT NOT NULL DEFAULT '[]',
  "autoRecommendations" TEXT NOT NULL DEFAULT '[]',
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ComplianceReportDrive_pkey" PRIMARY KEY ("id")
);

-- AddTable: RatingCourseDrive
-- Detailed driver ratings with category breakdowns
CREATE TABLE "RatingCourseDrive" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "chauffeurId" TEXT NOT NULL,
  "passengerId" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "comment" TEXT,
  "cleanliness" INTEGER,
  "driving" INTEGER,
  "communication" INTEGER,
  "comfort" INTEGER,
  "tags" TEXT NOT NULL DEFAULT '[]',
  "anonymous" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RatingCourseDrive_pkey" PRIMARY KEY ("id")
);

-- AddTable: PlatformSettingsDrive
-- Global platform configuration
CREATE TABLE "PlatformSettingsDrive" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "commissionPercentage" INTEGER NOT NULL DEFAULT 20,
  "minPayoutAmount" INTEGER NOT NULL DEFAULT 1000,
  "payoutDay" INTEGER NOT NULL DEFAULT 1,
  "payoutCycle" TEXT NOT NULL DEFAULT 'WEEKLY',
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "platformName" TEXT NOT NULL DEFAULT 'ZupDrive',
  "supportEmail" TEXT,
  "supportPhone" TEXT,
  "timezone" TEXT NOT NULL DEFAULT 'Europe/Brussels',
  "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PlatformSettingsDrive_pkey" PRIMARY KEY ("id")
);

-- AddTable: NotificationDrive
-- In-app notification storage
CREATE TABLE "NotificationDrive" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "chauffeurId" TEXT,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "priority" TEXT NOT NULL DEFAULT 'low',
  "data" JSONB,
  "actionUrl" TEXT,
  "read" BOOLEAN NOT NULL DEFAULT false,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),

  CONSTRAINT "NotificationDrive_pkey" PRIMARY KEY ("id")
);

-- AddIndex
CREATE INDEX "ComplianceReportDrive_chauffeurId_idx" ON "ComplianceReportDrive"("chauffeurId");
CREATE INDEX "ComplianceReportDrive_riskLevel_idx" ON "ComplianceReportDrive"("riskLevel");
CREATE INDEX "ComplianceReportDrive_checkedAt_idx" ON "ComplianceReportDrive"("checkedAt");

-- AddIndex for RatingCourseDrive
CREATE INDEX "RatingCourseDrive_courseId_idx" ON "RatingCourseDrive"("courseId");
CREATE INDEX "RatingCourseDrive_chauffeurId_idx" ON "RatingCourseDrive"("chauffeurId");
CREATE INDEX "RatingCourseDrive_passengerId_idx" ON "RatingCourseDrive"("passengerId");
CREATE INDEX "RatingCourseDrive_createdAt_idx" ON "RatingCourseDrive"("createdAt");

-- AddIndex for NotificationDrive
CREATE INDEX "NotificationDrive_userId_idx" ON "NotificationDrive"("userId");
CREATE INDEX "NotificationDrive_read_idx" ON "NotificationDrive"("read");
CREATE INDEX "NotificationDrive_createdAt_idx" ON "NotificationDrive"("createdAt");
CREATE INDEX "NotificationDrive_userId_read_idx" ON "NotificationDrive"("userId", "read");

-- AddForeignKey
ALTER TABLE "ComplianceReportDrive" ADD CONSTRAINT "ComplianceReportDrive_chauffeurId_fkey" FOREIGN KEY ("chauffeurId") REFERENCES "ChauffeurDrive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingCourseDrive" ADD CONSTRAINT "RatingCourseDrive_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "CourseDrive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingCourseDrive" ADD CONSTRAINT "RatingCourseDrive_chauffeurId_fkey" FOREIGN KEY ("chauffeurId") REFERENCES "ChauffeurDrive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingCourseDrive" ADD CONSTRAINT "RatingCourseDrive_passengerId_fkey" FOREIGN KEY ("passengerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDrive" ADD CONSTRAINT "NotificationDrive_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
