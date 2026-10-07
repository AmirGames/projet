-- CreateTable ScheduledReport
CREATE TABLE "ScheduledReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "reportType" TEXT NOT NULL CHECK ("reportType" IN ('DRIVER_PERFORMANCE', 'FINANCIAL', 'COMPLIANCE', 'CUSTOM')),
    "frequency" TEXT NOT NULL CHECK ("frequency" IN ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY')),
    "recipients" TEXT NOT NULL DEFAULT '[]',
    "format" TEXT NOT NULL CHECK ("format" IN ('PDF', 'EXCEL', 'JSON')) DEFAULT 'PDF',
    "lastGeneratedAt" TIMESTAMP(3),
    "nextGenerationAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex on ScheduledReport
CREATE INDEX "ScheduledReport_reportType_idx" ON "ScheduledReport"("reportType");
CREATE INDEX "ScheduledReport_frequency_idx" ON "ScheduledReport"("frequency");
CREATE INDEX "ScheduledReport_active_idx" ON "ScheduledReport"("active");
CREATE INDEX "ScheduledReport_nextGenerationAt_idx" ON "ScheduledReport"("nextGenerationAt");
