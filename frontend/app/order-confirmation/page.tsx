import { Suspense } from "react";
import OrderConfirmationContent from "./order-confirmation-content";

export default function OrderConfirmationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Chargement...</div>}>
      <OrderConfirmationContent />
    </Suspense>
  );
}