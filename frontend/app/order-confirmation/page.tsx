import { Suspense } from "react";
import OrderConfirmationContent from "./order-confirmation-content";
import { useTranslations } from 'next-intl';

export default function OrderConfirmationPage() {
  const t = useTranslations('orderConfirmation');
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Chargement...</div>}>
      <OrderConfirmationContent />
    </Suspense>
  );
}