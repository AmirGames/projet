-- Add userId column to Customer table (nullable for progressive migration)
ALTER TABLE "Customer" ADD COLUMN "userId" TEXT;

-- Create unique constraint on userId
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_userId_key" UNIQUE ("userId");

-- Create index on userId for query performance
CREATE INDEX "Customer_userId_idx" ON "Customer"("userId");

-- Add foreign key constraint
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL;
