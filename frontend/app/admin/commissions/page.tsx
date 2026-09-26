"use client";

import { useState, useCallback } from "react";
import { DollarSign } from "lucide-react";
import { useEffectChargement } from "@/lib/use-effect-chargement";

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface Commission {
  id: string;
  period: string;
  amount: number;
  org: { id: string; name: string };
  createdAt: string;
}

interface CommissionsResponse {
  commissions: Commission[];
  summary: {
    totalAmount: number;
    count: number;
  };
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

export default function CommissionsPage() {
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [summary, setSummary] = useState({ totalAmount: 0, count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const fetchCommissions = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      });

      const res = await fetch(`${API_URL}/admin/commissions?${query}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
      });

      if (!res.ok) throw new Error("Erreur lors du chargement des commissions");
      const data: CommissionsResponse = await res.json();
      setCommissions(data.commissions);
      setSummary(data.summary);
      setTotal(data.pagination.total);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur s'est produite");
    } finally {
      setLoading(false);
    }
  }, [offset]);

  useEffectChargement(() => {
    fetchCommissions();
  }, [limit, offset, fetchCommissions]);

  const getPeriodLabel = (period: string) => {
    const [year, month] = period.split("-");
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white flex items-center gap-2">
          <DollarSign className="w-8 h-8" />
          Commissions & Facturation
        </h1>
        <p className="text-gray-400 mt-2">
          Suivi des commissions de la plateforme
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-900/20 text-red-400 rounded-lg border border-red-500/20">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-6">
          <p className="text-sm text-green-400 mb-2">Montant Total</p>
          <p className="text-3xl font-bold text-green-400">
            €{summary.totalAmount.toFixed(2)}
          </p>
          <p className="text-xs text-green-400/60 mt-2">
            {summary.count} entrée(s)
          </p>
        </div>

        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-6">
          <p className="text-sm text-blue-400 mb-2">Moyenne par Commerçant</p>
          <p className="text-3xl font-bold text-blue-400">
            €
            {summary.count > 0
              ? (summary.totalAmount / summary.count).toFixed(2)
              : "0.00"}
          </p>
          <p className="text-xs text-blue-400/60 mt-2">
            Sur {summary.count} commerçant(s)
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : commissions.length === 0 ? (
        <div className="text-center py-12 bg-gray-800/50 rounded-lg border border-gray-700/50">
          <DollarSign className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <p className="text-gray-400">Aucune commission trouvée</p>
        </div>
      ) : (
        <div className="bg-gray-800/50 rounded-lg border border-gray-700/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-900/50 border-b border-gray-700/50">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">
                    Période
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">
                    Commerçant
                  </th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-300">
                    Montant
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {commissions.map((commission) => (
                  <tr
                    key={commission.id}
                    className="hover:bg-gray-700/20 transition"
                  >
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-semibold text-white">
                          {getPeriodLabel(commission.period)}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {commission.period}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm text-white font-medium">
                          {commission.org.name}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {commission.org.id.slice(0, 8)}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className="font-bold text-green-400">
                        €{commission.amount.toFixed(2)}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(commission.createdAt).toLocaleDateString(
                        "fr-FR"
                      )}
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
