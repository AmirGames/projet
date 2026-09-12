"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Store {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

interface Order {
  id: string;
  customerName: string;
  totalAmount: number;
  status: string;
  createdAt: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function Dashboard() {
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const token = localStorage.getItem("accessToken");
        if (!token) {
          router.push("/login");
          return;
        }

        // Get user data
        const meRes = await fetch(`${API_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!meRes.ok) {
          localStorage.removeItem("accessToken");
          router.push("/login");
          return;
        }

        const meData = await meRes.json();
        if (!meData.organizations || meData.organizations.length === 0) {
          router.push("/login");
          return;
        }

        const org = meData.organizations[0];

        // Get stores
        const storesRes = await fetch(`${API_URL}/api/stores/org/${org.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (storesRes.ok) {
          const storesData = await storesRes.json();
          setStores(Array.isArray(storesData) ? storesData : storesData.stores || []);
        }

        // Get recent orders
        if (stores.length > 0) {
          const ordersRes = await fetch(
            `${API_URL}/api/orders/store/${stores[0].id}`,
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );

          if (ordersRes.ok) {
            const ordersData = await ordersRes.json();
            setOrders(ordersData.orders || ordersData || []);
          }
        }
      } catch (err) {
        console.error("Failed to load dashboard", err);
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, [router, stores.length]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <p className="text-white text-lg">Chargement du tableau de bord...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 p-6">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <h1 className="text-3xl font-bold">Tableau de Bord</h1>
          <button
            onClick={() => {
              localStorage.removeItem("accessToken");
              localStorage.removeItem("refreshToken");
              router.push("/");
            }}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-semibold"
          >
            Déconnexion
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto p-6">
        {/* Stores Section */}
        <section className="mb-12">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">Mes Boutiques</h2>
            <Link
              href="/store/new"
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-semibold"
            >
              + Créer une boutique
            </Link>
          </div>

          {stores.length === 0 ? (
            <div className="bg-gray-800 p-8 rounded-lg text-center border border-gray-700">
              <p className="text-gray-400 mb-4 text-lg">Aucune boutique créée</p>
              <Link
                href="/store/new"
                className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold"
              >
                Créer votre première boutique
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {stores.map((store) => (
                <div
                  key={store.id}
                  className="bg-gray-800 p-6 rounded-lg border border-gray-700 hover:border-blue-500 transition"
                >
                  <h3 className="text-xl font-bold mb-2">{store.name}</h3>
                  <p className="text-gray-400 mb-4">
                    {store.description || "Pas de description"}
                  </p>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">/{store.slug}</span>
                    <Link
                      href={`/store/${store.id}`}
                      className="text-blue-400 hover:text-blue-300 font-semibold"
                    >
                      Gérer →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent Orders */}
        {stores.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold mb-6">Commandes Récentes</h2>

            {orders.length === 0 ? (
              <div className="bg-gray-800 p-8 rounded-lg text-center border border-gray-700">
                <p className="text-gray-400">Aucune commande pour le moment</p>
              </div>
            ) : (
              <div className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
                <table className="w-full">
                  <thead className="bg-gray-700">
                    <tr>
                      <th className="px-6 py-4 text-left text-sm font-semibold">
                        Client
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold">
                        Montant
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold">
                        Statut
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr
                        key={order.id}
                        className="border-t border-gray-700 hover:bg-gray-700"
                      >
                        <td className="px-6 py-4 font-medium">
                          {order.customerName}
                        </td>
                        <td className="px-6 py-4 font-semibold">
                          €{order.totalAmount.toFixed(2)}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-3 py-1 rounded-full text-sm font-semibold ${
                              order.status === "COMPLETED"
                                ? "bg-green-600 text-white"
                                : order.status === "PENDING"
                                ? "bg-yellow-600 text-white"
                                : "bg-red-600 text-white"
                            }`}
                          >
                            {order.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-400 text-sm">
                          {new Date(order.createdAt).toLocaleDateString(
                            "fr-FR"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}