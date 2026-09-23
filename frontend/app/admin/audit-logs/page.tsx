"use client";

import { useState, useEffect } from "react";
import { History } from "lucide-react";
import { useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface AuditLog {
  id: string;
  action: string;
  target: string;
  changes: Record<string, any>;
  admin: { email: string; name: string };
  createdAt: string;
}

interface AuditLogsResponse {
  logs: AuditLog[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

export default function AuditLogsPage() {
  const t = useTranslations('common');
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const limit = 50;

  useEffect(() => {
    fetchLogs();
  }, [limit, offset]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      });

      const res = await fetch(`${API_URL}/api/admin/audit-logs?${query}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
      });

      if (!res.ok) throw new Error("Erreur lors du chargement des logs");
      const data: AuditLogsResponse = await res.json();
      setLogs(data.logs);
      setTotal(data.pagination.total);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur s'est produite");
    } finally {
      setLoading(false);
    }
  };

  const getActionColor = (action: string) => {
    const colors: { [key: string]: string } = {
      CREATE: "bg-green-500/10 text-green-400",
      READ: "bg-blue-500/10 text-blue-400",
      UPDATE: "bg-yellow-500/10 text-yellow-400",
      DELETE: "bg-red-500/10 text-red-400",
      UPDATE_SYSTEM_CONFIG: "bg-purple-500/10 text-purple-400",
      UPDATE_MERCHANT: "bg-indigo-500/10 text-indigo-400",
      UPDATE_TICKET: "bg-cyan-500/10 text-cyan-400",
    };
    return colors[action] || "bg-gray-500/10 text-gray-400";
  };

  const getActionLabel = (action: string) => {
    const labels: { [key: string]: string } = {
      CREATE: "✨ Créé",
      READ: "👁️ Consulté",
      UPDATE: "✏️ Modifié",
      DELETE: "🗑️ Supprimé",
      UPDATE_SYSTEM_CONFIG: "⚙️ Config système",
      UPDATE_MERCHANT: "🏪 Commerçant",
      UPDATE_TICKET: "🎫 Ticket",
    };
    return labels[action] || action;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white flex items-center gap-2">
          <History className="w-8 h-8" />
          Logs d'Audit
        </h1>
        <p className="text-gray-400 mt-2">
          Historique de toutes les actions administrateur
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-900/20 text-red-400 rounded-lg border border-red-500/20">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 bg-gray-800/50 rounded-lg border border-gray-700/50">
          <History className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <p className="text-gray-400">Aucun log trouvé</p>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => (
            <div
              key={log.id}
              className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-4 hover:bg-gray-800/80 transition"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${getActionColor(log.action)}`}
                    >
                      {getActionLabel(log.action)}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(log.createdAt).toLocaleString("fr-FR")}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <p className="text-sm text-gray-300">
                      <span className="font-semibold text-white">
                        {log.admin.name || log.admin.email}
                      </span>{" "}
                      ({log.admin.email})
                    </p>
                    <p className="text-sm text-gray-400">
                      Cible: <span className="font-mono text-gray-500">{log.target}</span>
                    </p>
                  </div>

                  {Object.keys(log.changes).length > 0 && (
                    <div className="mt-3 p-3 bg-gray-900/50 rounded text-xs font-mono text-gray-400">
                      <p className="font-semibold text-gray-300 mb-2">
                        Modifications:
                      </p>
                      <div className="space-y-1">
                        {Object.entries(log.changes).map(([key, value]) => (
                          <div key={key} className="flex gap-2">
                            <span className="text-gray-500">{key}:</span>
                            <span className="text-green-400">
                              {typeof value === "object"
                                ? JSON.stringify(value)
                                : String(value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="text-xs text-gray-500 ml-4 flex-shrink-0">
                  ID: {log.id.slice(0, 8)}
                </div>
              </div>
            </div>
          ))}
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
