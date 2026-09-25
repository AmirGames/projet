"use client";

import { useState, useEffect, useCallback } from "react";
import { Store } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Merchant {
  id: string;
  name: string;
  email: string;
  status: "ACTIVE" | "SUSPENDED" | "CLOSED";
  tier: "FREE" | "PREMIUM" | "PRO";
  stores: Array<{ id: string; name: string }>;
  memberships: Array<{
    id: string;
    role: string;
    user: { email: string };
  }>;
  createdAt: string;
}

interface MerchantResponse {
  merchants: Merchant[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

export default function MerchantsPage() {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [filterStatus, setFilterStatus] = useState("");
  const limit = 20;

  const fetchMerchants = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
        ...(filterStatus && { status: filterStatus }),
      });

      const res = await fetch(`${API_URL}/api/admin/merchants?${query}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
      });

      if (!res.ok) throw new Error("Erreur lors du chargement des commerçants");
      const data: MerchantResponse = await res.json();
      setMerchants(data.merchants);
      setTotal(data.pagination.total);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur s'est produite");
    } finally {
      setLoading(false);
    }
  }, [filterStatus, offset]);

  useEffect(() => {
    fetchMerchants();
  }, [limit, offset, filterStatus, fetchMerchants]);

  const getStatusColor = (status: string) => {
    const colors: { [key: string]: string } = {
      ACTIVE: "bg-green-500/10 text-green-400 border-green-500/20",
      SUSPENDED: "bg-red-500/10 text-red-400 border-red-500/20",
      CLOSED: "bg-gray-500/10 text-gray-400 border-gray-500/20",
    };
    return colors[status] || "bg-gray-500/10 text-gray-400 border-gray-500/20";
  };

  const getTierColor = (tier: string) => {
    const colors: { [key: string]: string } = {
      FREE: "bg-gray-600",
      PREMIUM: "bg-blue-600",
      PRO: "bg-purple-600",
    };
    return colors[tier] || "bg-gray-600";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white flex items-center gap-2">
          <Store className="w-8 h-8" />
          Gestion des Commerçants
        </h1>
        <p className="text-gray-400 mt-2">
          Gérez les commerçants de la plateforme
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-900/20 text-red-400 rounded-lg border border-red-500/20">
          {error}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => {
            setFilterStatus("");
            setOffset(0);
          }}
          className={`px-4 py-2 rounded-lg transition ${
            filterStatus === ""
              ? "bg-blue-600 text-white"
              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
          }`}
        >
          Tous
        </button>
        {["ACTIVE", "SUSPENDED", "CLOSED"].map((status) => (
          <button
            key={status}
            onClick={() => {
              setFilterStatus(status);
              setOffset(0);
            }}
            className={`px-4 py-2 rounded-lg transition ${
              filterStatus === status
                ? "bg-blue-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            {status === "ACTIVE" && "✅ Actifs"}
            {status === "SUSPENDED" && "⛔ Suspendus"}
            {status === "CLOSED" && "❌ Fermés"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : merchants.length === 0 ? (
        <div className="text-center py-12 bg-gray-800/50 rounded-lg border border-gray-700/50">
          <Store className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <p className="text-gray-400">Aucun commerçant trouvé</p>
        </div>
      ) : (
        <div className="bg-gray-800/50 rounded-lg border border-gray-700/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-900/50 border-b border-gray-700/50">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">
                    Nom
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">
                    Plan
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">
                    Magasins
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {merchants.map((merchant) => (
                  <tr
                    key={merchant.id}
                    className="hover:bg-gray-700/20 transition"
                  >
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-semibold text-white">
                          {merchant.name}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {merchant.id.slice(0, 8)}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-400">
                      {merchant.email}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-3 py-1 rounded text-xs font-semibold ${getTierColor(merchant.tier)} text-white`}
                      >
                        {merchant.tier}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(merchant.status)}`}
                      >
                        {merchant.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-400">
                      {merchant.stores?.length || 0} magasin(s)
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(merchant.createdAt).toLocaleDateString("fr-FR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">
          Affichage {offset + 1} à {Math.min(offset + limit, total)} sur{" "}
          {total}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 disabled:opacity-50 transition"
          >
            Précédent
          </button>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={offset + limit >= total}
            className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 disabled:opacity-50 transition"
          >
            Suivant
          </button>
        </div>
      </div>
    </div>
  );
}
