"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function OrderConfirmationPage() {
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
          <div className="text-6xl mb-6">✅</div>

          <h1 className="text-4xl font-bold mb-4">Commande confirmée!</h1>

          <p className="text-gray-400 mb-6 text-lg">
            Merci pour votre commande. Vous recevrez un email de confirmation
            dans quelques instants.
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
              <li>✓ Confirmation d'email envoyée</li>
              <li>✓ Préparation de votre commande</li>
              <li>✓ Notification à la préparation</li>
              <li>✓ Retrait / Livraison</li>
            </ul>
          </div>

          <div className="flex gap-4 justify-center">
            <Link
              href="/store"
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