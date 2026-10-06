-- CreateTable
CREATE TABLE "StoreCustomer" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "hiddenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreCustomer_storeId_customerId_key" ON "StoreCustomer"("storeId", "customerId");

-- CreateIndex
CREATE INDEX "StoreCustomer_customerId_idx" ON "StoreCustomer"("customerId");

-- AddForeignKey
ALTER TABLE "StoreCustomer" ADD CONSTRAINT "StoreCustomer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreCustomer" ADD CONSTRAINT "StoreCustomer_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reprise : notes et blocage posés jusqu'ici sur la fiche globale sont copiés
-- vers le carnet de chaque boutique où le client a commandé. Les anciennes
-- colonnes de Customer sont conservées (dépréciées), rien n'est supprimé.
INSERT INTO "StoreCustomer" ("id", "storeId", "customerId", "notes", "status", "updatedAt")
SELECT 'sc_' || md5(o."storeId" || ':' || c."id"), o."storeId", c."id", c."notes", c."status", CURRENT_TIMESTAMP
FROM "Customer" c
JOIN (SELECT DISTINCT "storeId", "customerId" FROM "Order" WHERE "deletedAt" IS NULL) o ON o."customerId" = c."id"
WHERE c."deletedAt" IS NULL AND (c."notes" IS NOT NULL OR c."status" <> 'ACTIVE');
