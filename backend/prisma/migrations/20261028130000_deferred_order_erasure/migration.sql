CREATE TABLE "PrivacyDeferredOrderErasure" (
  "orderId" TEXT NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrivacyDeferredOrderErasure_pkey" PRIMARY KEY ("orderId")
);
