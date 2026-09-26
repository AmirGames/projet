"use client";

import { useState, useCallback } from "react";
import { AlertCircle, CheckCircle } from "lucide-react";
import { useEffectChargement } from "@/lib/use-effect-chargement";

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Ticket {
  id: string;
  subject: string;
  description: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  org: { id: string; name: string };
  createdAt: string;
  resolvedAt?: string;
}

interface TicketsResponse {
  tickets: Ticket[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const limit = 20;

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
        ...(filterStatus && { status: filterStatus }),
        ...(filterPriority && { priority: filterPriority }),
      });

      const res = await fetch(`${API_URL}/api/admin/tickets?${query}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
      });

      if (!res.ok) throw new Error("Erreur lors du chargement des tickets");
      const data: TicketsResponse = await res.json();
      setTickets(data.tickets);
      setTotal(data.pagination.total);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur s'est produite");
    } finally {
      setLoading(false);
    }
  }, [filterPriority, filterStatus, offset]);

  useEffectChargement(() => {
    fetchTickets();
  }, [limit, offset, filterStatus, filterPriority, fetchTickets]);

  const updateTicket = async (
    ticketId: string,
    updates: { status?: string; priority?: string }
  ) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/tickets/${ticketId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
        body: JSON.stringify(updates),
      });

      if (!res.ok) throw new Error("Erreur lors de la mise à jour");
      fetchTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur s'est produite");
    }
  };

  const getStatusColor = (status: string) => {
    const colors: { [key: string]: string } = {
      OPEN: "bg-orange-500/10 text-orange-400 border-orange-500/20",
      IN_PROGRESS: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      RESOLVED: "bg-green-500/10 text-green-400 border-green-500/20",
      CLOSED: "bg-gray-500/10 text-gray-400 border-gray-500/20",
    };
    return colors[status] || "bg-gray-500/10 text-gray-400 border-gray-500/20";
  };

  const getPriorityColor = (priority: string) => {
    const colors: { [key: string]: string } = {
      LOW: "bg-green-600",
      MEDIUM: "bg-yellow-600",
      HIGH: "bg-orange-600",
      CRITICAL: "bg-red-600",
    };
    return colors[priority] || "bg-gray-600";
  };

  const getPriorityEmoji = (priority: string) => {
    const emojis: { [key: string]: string } = {
      LOW: "🟢",
      MEDIUM: "🟡",
      HIGH: "🟠",
      CRITICAL: "🔴",
    };
    return emojis[priority] || "⚪";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white flex items-center gap-2">
          <AlertCircle className="w-8 h-8" />
          Gestion des Tickets
        </h1>
        <p className="text-gray-400 mt-2">
          Gérez les demandes de support des commerçants
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-900/20 text-red-400 rounded-lg border border-red-500/20">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="text-sm text-gray-400 mb-2 block">Status</label>
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
            {["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((status) => (
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
                {status === "OPEN" && "🟠 Ouvert"}
                {status === "IN_PROGRESS" && "🔵 En cours"}
                {status === "RESOLVED" && "✅ Résolu"}
                {status === "CLOSED" && "⚪ Fermé"}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm text-gray-400 mb-2 block">Priorité</label>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => {
                setFilterPriority("");
                setOffset(0);
              }}
              className={`px-4 py-2 rounded-lg transition ${
                filterPriority === ""
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              Toutes
            </button>
            {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((priority) => (
              <button
                key={priority}
                onClick={() => {
                  setFilterPriority(priority);
                  setOffset(0);
                }}
                className={`px-4 py-2 rounded-lg transition ${
                  filterPriority === priority
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                {getPriorityEmoji(priority)} {priority}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-12 bg-gray-800/50 rounded-lg border border-gray-700/50">
          <CheckCircle className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <p className="text-gray-400">Aucun ticket trouvé</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <div
              key={ticket.id}
              className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-4 hover:bg-gray-800/80 transition"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`px-2 py-1 rounded text-xs font-bold ${getPriorityColor(ticket.priority)} text-white`}
                    >
                      {ticket.priority}
                    </span>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-semibold border ${getStatusColor(ticket.status)}`}
                    >
                      {ticket.status}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-white">
                    {ticket.subject}
                  </h3>
                  <p className="text-sm text-gray-400 mt-1">
                    {ticket.description}
                  </p>
                  <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                    <span>Commerçant: {ticket.org.name}</span>
                    <span>
                      {new Date(ticket.createdAt).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <select
                  value={ticket.status}
                  onChange={(e) =>
                    updateTicket(ticket.id, { status: e.target.value })
                  }
                  className="px-3 py-1 bg-gray-700 text-gray-300 rounded text-sm border border-gray-600 hover:border-gray-500 transition"
                >
                  <option value="OPEN">OPEN</option>
                  <option value="IN_PROGRESS">IN_PROGRESS</option>
                  <option value="RESOLVED">RESOLVED</option>
                  <option value="CLOSED">CLOSED</option>
                </select>
                <select
                  value={ticket.priority}
                  onChange={(e) =>
                    updateTicket(ticket.id, { priority: e.target.value })
                  }
                  className="px-3 py-1 bg-gray-700 text-gray-300 rounded text-sm border border-gray-600 hover:border-gray-500 transition"
                >
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
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
