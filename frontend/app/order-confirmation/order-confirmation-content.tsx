"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { EnTeteClient } from "@/components/EnTeteClient";
import { useTranslations } from 'next-intl';

export default function OrderConfirmationContent() {
  const t = useTranslations('confirmationCommande');
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId") ?? "";

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <EnTeteClient />
        <div className="mx-auto max-w-2xl px-5 py-10 md:px-8 md:py-14">
        <div className="rounded-[2rem] border border-neutral-200 bg-white p-7 text-center shadow-sm md:p-10">
          {/* Success Icon */}
          <div className="text-6xl mb-6">🕒</div>

          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4">{t('envoyee')}</h1>

          <p className="text-gray-500 mb-6 text-lg">
            {t('merci')}
          </p>

          {orderId && (
            <div className="bg-gray-50 p-4 rounded-2xl mb-6">
              <p className="text-sm text-gray-500">{t('numero')}</p>
              <p className="text-xl font-bold text-gray-900 font-mono">
                {orderId.slice(0, 12).toUpperCase()}
              </p>
            </div>
          )}

          <div className="bg-orange-50 p-4 rounded-2xl mb-8 text-left">
            <h3 className="font-bold mb-2">{t('prochaines')}</h3>
            <ul className="text-sm space-y-2 text-gray-700">
              <li>{t('etape1')}</li>
              <li>{t('etape2')}</li>
              <li>{t('etape3')}</li>
            </ul>
          </div>

          <div className="flex gap-4 justify-center flex-wrap">
            {orderId && (
              <Link
                href={`/track?commande=${orderId}`}
                className="rounded-full bg-[#FF7A00] px-6 py-3 font-bold text-black transition hover:bg-[#E66E00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
              >
                {t('suivre')}
              </Link>
            )}
            <Link
              href="/client"
              className="px-6 py-3 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-full"
            >
              {t('continuer')}
            </Link>
            <Link
              href="/dashboard"
              className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 font-bold rounded-full"
            >
              {t('mesCommandes')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

