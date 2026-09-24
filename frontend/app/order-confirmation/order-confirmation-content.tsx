"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function OrderConfirmationContent() {
  const searchParams = useSearchParams();
  const [orderId, setOrderId] = useState("");

  useEffect(() => {
    const id = searchParams.get("orderId");
    if (id) {
      setOrderId(id);
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-gray-800 p-8 rounded-lg text-center">
          {/* Success Icon */}
          <div className="text-6xl mb-6">🕒</div>

          <h1 className="text-4xl font-bold mb-4">Commande envoyée</h1>

          <p className="text-gray-400 mb-6 text-lg">
            Merci pour votre commande. Le restaurant doit maintenant la
            confirmer : vous recevrez un e-mail dès qu&apos;il l&apos;aura
            acceptée, avec l&apos;heure prévue.
          </p>

          {orderId && (
            <div className="bg-gray-700 p-4 rounded-lg mb-6 border border-gray-600">
              <p className="text-sm text-gray-400">Numéro de commande</p>
              <p className="text-xl font-bold text-green-400 font-mono">
                {orderId.slice(0, 12).toUpperCase()}
              </p>
            </div>
          )}

          <div className="bg-blue-900 p-4 rounded-lg mb-8 border border-blue-700 text-left">
            <h3 className="font-bold mb-2">Prochaines étapes:</h3>
            <ul className="text-sm space-y-2 text-gray-300">
              <li>1. Le restaurant accepte votre commande et annonce l&apos;heure prévue</li>
              <li>2. Préparation de votre commande</li>
              <li>3. Retrait / Livraison</li>
            </ul>
          </div>

          <div className="flex gap-4 justify-center flex-wrap">
            {orderId && (
              <Link
                href={`/track?commande=${orderId}`}
                className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg"
              >
                Suivre ma commande
              </Link>
            )}
            <Link
              href="/restaurants"
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg"
            >
              Continuer les achats
            </Link>
            <Link
              href="/dashboard"
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-lg"
            >
              Voir mes commandes
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
