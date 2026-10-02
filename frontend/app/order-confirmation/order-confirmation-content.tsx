"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { EnTeteClient } from "@/components/EnTeteClient";

export default function OrderConfirmationContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId") ?? "";

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <EnTeteClient />
      <div className="max-w-2xl mx-auto p-6 pt-12">
        <div className="bg-white p-8 rounded-3xl text-center shadow-sm ring-1 ring-gray-200">
          {/* Success Icon */}
          <div className="text-6xl mb-6">🕒</div>

          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4">Commande envoyée</h1>

          <p className="text-gray-500 mb-6 text-lg">
            Merci pour votre commande. Le restaurant doit maintenant la
            confirmer : vous recevrez un e-mail dès qu&apos;il l&apos;aura
            acceptée, avec l&apos;heure prévue.
          </p>

          {orderId && (
            <div className="bg-gray-50 p-4 rounded-2xl mb-6">
              <p className="text-sm text-gray-500">Numéro de commande</p>
              <p className="text-xl font-bold text-gray-900 font-mono">
                {orderId.slice(0, 12).toUpperCase()}
              </p>
            </div>
          )}

          <div className="bg-orange-50 p-4 rounded-2xl mb-8 text-left">
            <h3 className="font-bold mb-2">Prochaines étapes:</h3>
            <ul className="text-sm space-y-2 text-gray-700">
              <li>1. Le restaurant accepte votre commande et annonce l&apos;heure prévue</li>
              <li>2. Préparation de votre commande</li>
              <li>3. Retrait / Livraison</li>
            </ul>
          </div>

          <div className="flex gap-4 justify-center flex-wrap">
            {orderId && (
              <Link
                href={`/track?commande=${orderId}`}
                className="px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-full"
              >
                Suivre ma commande
              </Link>
            )}
            <Link
              href="/client"
              className="px-6 py-3 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-full"
            >
              Continuer les achats
            </Link>
            <Link
              href="/dashboard"
              className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 font-bold rounded-full"
            >
              Voir mes commandes
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
