"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useProtectedRoute } from "@/lib/use-protected-route";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface Order {
  id: string;
  customerName: string;
  customerEmail: string;
  totalAmount: number;
  status: string;
  paymentStatus: string;
  createdAt: string;
  deliveryType: string;
}

export default function AdminPage() {
  const router = useRouter();
  const { logout } = useAuth();
  const { isReady } = useProtectedRoute();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState("PENDING");

  const storeId = typeof window !== "undefined" ? localStorage.getItem("storeId") || "19c84158-7858-453f-9955-e95c01c4e895" : "19c84158-7858-453f-9955-e95c01c4e895";

  useEffect(() => {
    if (!isReady) return;
    loadOrders();
  }, [isReady, selectedStatus]);

  const loadOrders = async () => {
    try {
      const token = localStorage.getItem("accessToken");
      const response = await fetch(
        `${API_URL}/api/orders/store/${storeId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await response.json();
      const allOrders = Array.isArray(data) ? data : data.orders || [];
      const filtered = selectedStatus === "PENDING"
        ? allOrders
        : allOrders.filter((o: Order) => o.status === selectedStatus);
      setOrders(filtered);
    } catch (err) {
      console.error("Erreur:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    try {
      await fetch(`${API_URL}/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      loadOrders();
    } catch (err) {
      console.error("Erreur:", err);
    }
  };

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold">👨‍💼 Admin - Gestion des commandes</h1>
          <button
            onClick={handleLogout}
            className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg"
          >
            Déconnexion
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        {/* Status Filter */}
        <div className="mb-6">
          <h2 className="text-lg font-bold mb-4">Filtrer par statut</h2>
          <div className="flex gap-2 flex-wrap">
            {["PENDING", "ACCEPTED", "READY", "COMPLETED", "REJECTED"].map(
              (status) => (
                <button
                  key={status}
                  onClick={() => setSelectedStatus(status)}
                  className={`px-4 py-2 rounded-lg font-bold transition ${
                    selectedStatus === status
                      ? "bg-blue-600"
                      : "bg-gray-700 hover:bg-gray-600"
                  }`}
                >
                  {status === "PENDING" && "⏳ En attente"}
                  {status === "ACCEPTED" && "✅ Acceptée"}
                  {status === "READY" && "🎉 Prête"}
                  {status === "COMPLETED" && "✔️ Complétée"}
                  {status === "REJECTED" && "❌ Rejetée"}
                </button>
              )
            )}
          </div>
        </div>

        {/* Orders Table */}
        <div className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-xl font-bold mb-4">
            Commandes ({orders.length})
          </h2>

          {loading ? (
            <p className="text-gray-400">Chargement...</p>
          ) : orders.length === 0 ? (
            <p className="text-gray-400">Aucune commande</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="pb-3">Commande</th>
                    <th className="pb-3">Client</th>
                    <th className="pb-3">Montant</th>
                    <th className="pb-3">Type</th>
                    <th className="pb-3">Paiement</th>
                    <th className="pb-3">Date</th>
                    <th className="pb-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr
                      key={order.id}
                      className="border-b border-gray-700 hover:bg-gray-700"
                    >
                      <td className="py-4 font-mono text-sm">
                        {order.id.slice(0, 8).toUpperCase()}
                      </td>
                      <td className="py-4">
                        <div>
                          <p className="font-bold">{order.customerName}</p>
                          <p className="text-gray-400 text-xs">
                            {order.customerEmail}
                          </p>
                        </div>
                      </td>
                      <td className="py-4 font-bold text-green-400">
                        €{order.totalAmount.toFixed(2)}
                      </td>
                      <td className="py-4">
                        {order.deliveryType === "PICKUP"
                          ? "🛍️ À emporter"
                          : "🚚 Livraison"}
                      </td>
                      <td className="py-4">
                        <span
                          className={`px-2 py-1 rounded text-xs font-bold ${
                            order.paymentStatus === "PAID"
                              ? "bg-green-600"
                              : "bg-yellow-600"
                          }`}
                        >
                          {order.paymentStatus}
                        </span>
                      </td>
                      <td className="py-4 text-gray-400 text-xs">
                        {new Date(order.createdAt).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="py-4">
                        <select
                          value={order.status}
                          onChange={(e) =>
                            handleStatusChange(order.id, e.target.value)
                          }
                          className="px-2 py-1 bg-gray-700 text-white rounded text-xs"
                        >
                          <option value="PENDING">PENDING</option>
                          <option value="ACCEPTED">ACCEPTED</option>
                          <option value="READY">READY</option>
                          <option value="COMPLETED">COMPLETED</option>
                          <option value="REJECTED">REJECTED</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}