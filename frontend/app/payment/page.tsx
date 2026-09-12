"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface OrderInfo {
  orderId: string;
  clientSecret: string;
  amount: number;
}

export default function PaymentPage() {
  const router = useRouter();
  const [orderInfo, setOrderInfo] = useState<OrderInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const order = localStorage.getItem("currentOrder");
    if (order) {
      setOrderInfo(JSON.parse(order));
    } else {
      router.push("/store");
    }
  }, [router]);

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!orderInfo) return;

    try {
      // Extract payment intent ID from client secret
      const parts = orderInfo.clientSecret.split("_secret_");
      const paymentIntentId = parts[0];

      console.log("Payment Intent ID:", paymentIntentId);

      // Confirm payment with backend
      const response = await fetch(
        "http://localhost:3001/api/payments/confirm",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentIntentId }),
        }
      );

      const confirmResult = await response.json();
      console.log("Confirm response:", confirmResult);
      console.log("Response status:", response.status);

      if (confirmResult.success || confirmResult.status === "succeeded") {
        setSuccess(true);
        localStorage.removeItem("currentOrder");

        setTimeout(() => {
          router.push(`/order-confirmation?orderId=${orderInfo.orderId}`);
        }, 2000);
      } else {
        setError("Paiement non confirmé. Réponse: " + JSON.stringify(confirmResult));
      }
    } catch (err) {
      setError("Erreur lors du paiement: " + err);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!orderInfo) {
    return <div className="text-white">Chargement...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold">Paiement sécurisé</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-gray-800 p-6 rounded-lg mb-6">
          <h2 className="text-xl font-bold mb-4">Montant à payer</h2>
          <div className="text-4xl font-bold text-green-400">
            €{orderInfo.amount.toFixed(2)}
          </div>
        </div>

        {success && (
          <div className="bg-green-600 text-white p-6 rounded-lg mb-6">
            <h3 className="text-xl font-bold mb-2">✅ Paiement réussi!</h3>
            <p>Redirection en cours...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-600 text-white p-4 rounded-lg mb-6">
            {error}
          </div>
        )}

        {!success && (
          <div className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-bold mb-6">Informations de paiement</h2>

            <div className="bg-blue-900 p-4 rounded-lg mb-6 border border-blue-700">
              <p className="text-sm mb-3 font-bold">ℹ️ Mode de démonstration</p>
              <p className="text-sm mb-3">
                Cliquez sur le bouton pour confirmer le paiement.
              </p>
            </div>

            <form onSubmit={handlePayment} className="space-y-4">
              <div className="bg-gray-700 p-4 rounded-lg">
                <p className="text-sm text-gray-300 mb-2">Commande:</p>
                <p className="font-mono text-sm">
                  {orderInfo.orderId.slice(0, 12).toUpperCase()}
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-lg"
              >
                {loading ? "Paiement en cours..." : "Confirmer le paiement"}
              </button>

              <p className="text-xs text-gray-400 text-center">
                Paiement sécurisé par Stripe
              </p>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}