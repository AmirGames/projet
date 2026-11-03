ALTER TABLE "Store"
  ADD COLUMN "kitchenDefaultMinutes" INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN "kitchenParallelOrders" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "kitchenRushExtraMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "kitchenRushUntil" TIMESTAMP(3);

ALTER TABLE "Order"
  ADD COLUMN "readyAt" TIMESTAMP(3),
  ADD COLUMN "preparationCalmSample" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Store" ADD CONSTRAINT "Store_kitchen_bounds" CHECK (
  "kitchenDefaultMinutes" BETWEEN 5 AND 120 AND
  "kitchenParallelOrders" BETWEEN 1 AND 30 AND
  "kitchenRushExtraMinutes" BETWEEN 0 AND 120
);

CREATE INDEX "Order_kitchen_samples_idx" ON "Order" ("storeId", "preparationCalmSample", "readyAt");
