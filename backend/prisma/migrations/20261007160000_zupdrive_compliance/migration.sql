-- CreateTable AuditLog
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL CHECK ("actorType" IN ('ADMIN', 'SYSTEM', 'DRIVER', 'PASSAGER')),
    "resourceId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL CHECK ("resourceType" IN ('DRIVER', 'DOCUMENT', 'INFRACTION', 'ALERT', 'SETTING', 'PAYMENT')),
    "oldValue" TEXT,
    "newValue" TEXT,
    "reason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable ComplianceCheck
CREATE TABLE "ComplianceCheck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "driverId" TEXT NOT NULL,
    "type" TEXT NOT NULL CHECK ("type" IN ('DOCUMENT_VALIDATION', 'BACKGROUND_CHECK', 'FINANCIAL_VERIFICATION', 'PERIODIC_REVIEW')),
    "status" TEXT NOT NULL CHECK ("status" IN ('PENDING', 'IN_PROGRESS', 'PASSED', 'FAILED', 'MANUAL_REVIEW_NEEDED')) DEFAULT 'PENDING',
    "findings" JSONB NOT NULL DEFAULT '[]',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ComplianceCheck_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "ChauffeurDrive" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable DocumentVerificationWorkflow
CREATE TABLE "DocumentVerificationWorkflow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "driverId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL CHECK ("documentType" IN ('PERMIS', 'ASSURANCE', 'INSPECTION', 'IDENTITE')),
    "status" TEXT NOT NULL CHECK ("status" IN ('PENDING_UPLOAD', 'UPLOADED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED')) DEFAULT 'PENDING_UPLOAD',
    "uploadedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "rejectionReason" TEXT,
    "nextReviewDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentVerificationWorkflow_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "ChauffeurDrive" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE("driverId", "documentType")
);

-- CreateTable ComplianceReport
CREATE TABLE "ComplianceReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportType" TEXT NOT NULL CHECK ("reportType" IN ('MONTHLY', 'QUARTERLY', 'ANNUAL', 'AD_HOC')),
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedBy" TEXT NOT NULL,
    "totalDrivers" INTEGER NOT NULL,
    "driversWithValidDocuments" INTEGER NOT NULL,
    "driversWithExpiringDocuments" INTEGER NOT NULL,
    "driversWithInfractions" INTEGER NOT NULL,
    "driversWithLowRating" INTEGER NOT NULL,
    "complianceRate" REAL NOT NULL,
    "riskScore" REAL NOT NULL,
    "recommendations" JSONB NOT NULL DEFAULT '[]'
);

-- CreateIndex on AuditLog
CREATE INDEX "AuditLog_resourceId_idx" ON "AuditLog"("resourceId");
CREATE INDEX "AuditLog_resourceType_idx" ON "AuditLog"("resourceType");
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex on ComplianceCheck
CREATE INDEX "ComplianceCheck_driverId_idx" ON "ComplianceCheck"("driverId");
CREATE INDEX "ComplianceCheck_type_idx" ON "ComplianceCheck"("type");
CREATE INDEX "ComplianceCheck_status_idx" ON "ComplianceCheck"("status");
CREATE INDEX "ComplianceCheck_expiresAt_idx" ON "ComplianceCheck"("expiresAt");

-- CreateIndex on DocumentVerificationWorkflow
CREATE INDEX "DocumentVerificationWorkflow_driverId_idx" ON "DocumentVerificationWorkflow"("driverId");
CREATE INDEX "DocumentVerificationWorkflow_status_idx" ON "DocumentVerificationWorkflow"("status");
CREATE INDEX "DocumentVerificationWorkflow_nextReviewDate_idx" ON "DocumentVerificationWorkflow"("nextReviewDate");

-- CreateIndex on ComplianceReport
CREATE INDEX "ComplianceReport_reportType_idx" ON "ComplianceReport"("reportType");
CREATE INDEX "ComplianceReport_generatedAt_idx" ON "ComplianceReport"("generatedAt");
