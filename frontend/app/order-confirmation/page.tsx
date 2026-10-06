import { Suspense } from "react";
import { useTranslations } from "next-intl";
import OrderConfirmationContent from "./order-confirmation-content";

export default function OrderConfirmationPage() {
  const t = useTranslations('common');

  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 text-gray-500 flex items-center justify-center">{t('loading')}</div>}>
      <OrderConfirmationContent />
    </Suspense>
  );
}