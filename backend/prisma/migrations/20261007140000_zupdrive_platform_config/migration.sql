-- CreateTable CommissionConfig
CREATE TABLE "CommissionConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL UNIQUE,
    "type" TEXT NOT NULL CHECK ("type" IN ('PERCENTAGE', 'FIXED')),
    "value" REAL NOT NULL,
    "appliesTo" TEXT NOT NULL CHECK ("appliesTo" IN ('CHAUFFEUR', 'PLATEFORME')),
    "description" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable RegionalConfig
CREATE TABLE "RegionalConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "region" TEXT NOT NULL UNIQUE CHECK ("region" IN ('BRUXELLES', 'WALLONIE', 'FLANDRE')),
    "minPrice" INTEGER NOT NULL,
    "baseSurgeMultiplier" REAL NOT NULL DEFAULT 1.0,
    "maxSurgeMultiplier" REAL NOT NULL DEFAULT 2.5,
    "peakHours" TEXT NOT NULL,
    "peakSurgeMultiplier" REAL NOT NULL DEFAULT 1.5,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable PricingRule
CREATE TABLE "PricingRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL UNIQUE,
    "type" TEXT NOT NULL CHECK ("type" IN ('DISTANCE', 'TIME', 'AREA', 'CUSTOM')),
    "basePricePerKm" INTEGER NOT NULL,
    "basePricePerMin" INTEGER NOT NULL,
    "minPrice" INTEGER NOT NULL,
    "maxPrice" INTEGER,
    "description" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable PlatformSettings
CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL UNIQUE,
    "value" TEXT NOT NULL,
    "type" TEXT NOT NULL CHECK ("type" IN ('STRING', 'NUMBER', 'BOOLEAN', 'JSON')) DEFAULT 'STRING',
    "description" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex on CommissionConfig
CREATE INDEX "CommissionConfig_active_idx" ON "CommissionConfig"("active");
CREATE INDEX "CommissionConfig_appliesTo_idx" ON "CommissionConfig"("appliesTo");

-- CreateIndex on RegionalConfig
CREATE INDEX "RegionalConfig_active_idx" ON "RegionalConfig"("active");

-- CreateIndex on PricingRule
CREATE INDEX "PricingRule_active_idx" ON "PricingRule"("active");
CREATE INDEX "PricingRule_type_idx" ON "PricingRule"("type");

-- CreateIndex on PlatformSettings
CREATE INDEX "PlatformSettings_key_idx" ON "PlatformSettings"("key");
