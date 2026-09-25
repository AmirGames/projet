-- Le panier d'un client chez un commerce, gardé sur le serveur pour suivre
-- le compte d'un appareil à l'autre (site, application).
CREATE TABLE "CustomerCart" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "storeName" TEXT NOT NULL DEFAULT '',
    "storeSlug" TEXT,
    "storeLogo" TEXT,
    "lines" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerCart_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerCart_customerId_storeId_key" ON "CustomerCart"("customerId", "storeId");
CREATE INDEX "CustomerCart_customerId_idx" ON "CustomerCart"("customerId");

ALTER TABLE "CustomerCart" ADD CONSTRAINT "CustomerCart_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerCart" ADD CONSTRAINT "CustomerCart_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
