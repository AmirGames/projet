"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft } from "lucide-react";

interface CartItem {
  id: string;
  name: string;
  price: number;
}

export default function CheckoutPage() {
  const router = useRouter();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryType, setDeliveryType] = useState("PICKUP");
  const [pickupTime, setPickupTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const storeId = "19c84158-7858-453f-9955-e95c01c4e895";

  useEffect(() => {
    // Get cart from localStorage
    const cart = localStorage.getItem("cart");
    if (cart) {
      setCartItems(JSON.parse(cart));
    }
  }, []);

  const totalAmount = cartItems.reduce((sum, item) => sum + item.price, 0);

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Create order
      const orderResult = await api.createOrder(
        storeId,
        customerName,
        customerEmail,
        customerPhone,
        deliveryType,
        totalAmount
      );

      if (orderResult.error) {
        setError(orderResult.error || orderResult.message || "Erreur lors de la création de la commande");
        return;
      }

      const orderId = orderResult.order.id;

      // Create payment intent
      const paymentResult = await fetch(
        "http://localhost:3001/api/payments/intent",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId,
            storeId,
            amount: totalAmount,
            customerEmail,
            customerName,
            description: `Commande #${orderId.slice(0, 8)}`,
          }),
        }
      ).then((res) => res.json());

      if (paymentResult.error) {
        setError("Erreur lors de la création du paiement");
        return;
      }

      // Store order info and redirect to payment
      localStorage.setItem(
        "currentOrder",
        JSON.stringify({
          orderId,
          clientSecret: paymentResult.clientSecret,
          amount: totalAmount,
        })
      );

      // Clear cart
      localStorage.removeItem("cart");

      // Redirect to payment
      router.push("/payment");
    } catch (err) {
      setError("Erreur lors du traitement");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          {/* Sans retour, un client qui veut corriger son panier n'a que le
              bouton du navigateur — et il ne le trouve pas sur téléphone. */}
          <button
            type="button"
            onClick={() => router.back()}
            title="Retour"
            aria-label="Retour"
            className="p-2 hover:bg-gray-700 rounded-lg transition"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold">Passer la commande</h1>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Order Summary */}
          <div className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-bold mb-4">Résumé de la commande</h2>

            {cartItems.length === 0 ? (
              <p className="text-gray-400">Panier vide</p>
            ) : (
              <>
                <div className="space-y-3 mb-6 pb-6 border-b border-gray-700">
                  {cartItems.map((item, idx) => (
                    <div key={idx} className="flex justify-between">
                      <span>{item.name}</span>
                      <span className="text-green-400">€{item.price}</span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between text-lg font-bold">
                  <span>Total:</span>
                  <span className="text-green-400">
                    €{totalAmount.toFixed(2)}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Checkout Form */}
          <div className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-bold mb-4">Vos informations</h2>

            {error && (
              <div className="bg-red-600 text-white p-4 rounded-lg mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleCheckout} className="space-y-4">
              <div>
                <label className="block text-gray-300 mb-2">Nom</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-300 mb-2">Email</label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-300 mb-2">Téléphone</label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-300 mb-2">Type de livraison</label>
                <select
                  value={deliveryType}
                  onChange={(e) => setDeliveryType(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg"
                >
                  <option value="PICKUP">À emporter</option>
                  <option value="DELIVERY">Livraison</option>
                </select>
              </div>

              {deliveryType === "PICKUP" && (
                <div>
                  <label className="block text-gray-300 mb-2">Heure de retrait</label>
                  <input
                    type="datetime-local"
                    value={pickupTime}
                    onChange={(e) => setPickupTime(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg"
                    required
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading || cartItems.length === 0}
                className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-lg"
              >
                {loading ? "Traitement..." : "Procéder au paiement"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}