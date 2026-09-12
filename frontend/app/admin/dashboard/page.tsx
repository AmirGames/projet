"use client";

import { useState, useEffect } from "react";
import {
  BarChart3,
  Store,
  ShoppingCart,
  DollarSign,
  AlertCircle,
  TrendingUp,
} from "lucide-react";

interface Stats {
  merchants: {
    total: number;
    active: number;
    suspended: number;
  };
  stores: number;
  orders: number;
  revenue: number;
  tickets: {
    open: number;
  };
  config: {
    platformFeePercent: number;
    maintenanceMode: boolean;
  };
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/admin/stats", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (!res.ok) throw new Error("Erreur lors du chargement des stats");
      const data = await res.json();
      setStats(data);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur s'est produite");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="p-4 bg-red-900/20 text-red-400 rounded-lg">
        {error || "Erreur lors du chargement"}
      </div>
    );
  }

  const statCards = [
    {
      title: "Commerçants Actifs",
      value: stats.merchants.active,
      total: stats.merchants.total,
      icon: Store,
      color: "blue",
    },
    {
      title: "Magasins",
      value: stats.stores,
      icon: ShoppingCart,
      color: "green",
    },
    {
      title: "Commandes",
      value: stats.orders,
      icon: ShoppingCart,
      color: "purple",
    },
    {
      title: "Revenu Plateforme",
      value: `€${(stats.revenue * (stats.config.platformFeePercent / 100)).toFixed(2)}`,
      icon: DollarSign,
      color: "emerald",
    },
  ];

  const getColorClasses = (color: string) => {
    const colors: { [key: string]: string } = {
      blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      green: "bg-green-500/10 text-green-400 border-green-500/20",
      purple: "bg-purple-500/10 text-purple-400 border-purple-500/20",
      emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      red: "bg-red-500/10 text-red-400 border-red-500/20",
    };
    return colors[color] || colors.blue;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white flex items-center gap-2">
          <BarChart3 className="w-8 h-8" />
          Dashboard Administrateur
        </h1>
        <p className="text-gray-400 mt-2">Vue d'ensemble de la plateforme</p>
      </div>

      {stats.config.maintenanceMode && (
        <div className="p-4 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          Mode maintenance activé
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.title}
              className={`p-6 rounded-lg border ${getColorClasses(card.color)} backdrop-blur`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-400 mb-1">
                    {card.title}
                  </p>
                  <p className="text-2xl font-bold">
                    {typeof card.value === "number"
                      ? card.value.toLocaleString()
                      : card.value}
                  </p>
                  {card.total !== undefined && (
                    <p className="text-xs text-gray-500 mt-1">
                      Total: {card.total}
                    </p>
                  )}
                </div>
                <Icon className="w-8 h-8 opacity-50" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700/50 backdrop-blur">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Status Commerçants
          </h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Actifs</span>
              <div className="flex items-center gap-2">
                <div className="w-32 bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full"
                    style={{
                      width: `${(stats.merchants.active / stats.merchants.total) * 100}%`,
                    }}
                  ></div>
                </div>
                <span className="text-green-400 font-bold">
                  {stats.merchants.active}
                </span>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Suspendus</span>
              <div className="flex items-center gap-2">
                <div className="w-32 bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-red-500 h-2 rounded-full"
                    style={{
                      width: `${(stats.merchants.suspended / stats.merchants.total) * 100}%`,
                    }}
                  ></div>
                </div>
                <span className="text-red-400 font-bold">
                  {stats.merchants.suspended}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700/50 backdrop-blur">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Alertes
          </h2>
          <div className="space-y-2">
            <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded">
              <p className="text-sm text-orange-400">
                {stats.tickets.open} ticket(s) ouvert(s)
              </p>
            </div>
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded">
              <p className="text-sm text-blue-400">
                Commission: {stats.config.platformFeePercent}%
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700/50 backdrop-blur">
        <h2 className="text-lg font-semibold text-white mb-4">Résumé Financier</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-400 mb-1">Revenu Total</p>
            <p className="text-2xl font-bold text-green-400">
              €{stats.revenue.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-400 mb-1">Commission Plateforme</p>
            <p className="text-2xl font-bold text-blue-400">
              €{(stats.revenue * (stats.config.platformFeePercent / 100)).toFixed(2)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
