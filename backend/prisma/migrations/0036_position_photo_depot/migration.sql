-- AlterTable
ALTER TABLE "OrderDelivery" ADD COLUMN     "proofAccuracy" DOUBLE PRECISION,
ADD COLUMN     "proofLat" DOUBLE PRECISION,
ADD COLUMN     "proofLng" DOUBLE PRECISION,
ADD COLUMN     "proofPositionAt" TIMESTAMP(3);
