"use client";

import { useState } from "react";
import { Settings, AlertTriangle } from "lucide-react";
import { useTranslations } from 'next-intl';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface SystemConfig {
  id: string;
  platformFeePercent: number;
  minOrderAmount: number;
  maxOrderAmount: number;
  maintenanceMode: boolean;
  maintenanceMessage?: string;
}

export default function AdminSettingsPage() {
  const t = useTranslations('common');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [formData, setFormData] = useState({
    platformFeePercent: 5,
    minOrderAmount: 10,
    maxOrderAmount: 1000,
    maintenanceMode: false,
    maintenanceMessage: "",
  });

  const fetchConfig = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/config`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
      });

      if (!res.ok) throw new Error("Erreur lors du chargement de la config");
      const data: SystemConfig = await res.json();
      setFormData({
        platformFeePercent: data.platformFeePercent || 5,
        minOrderAmount: data.minOrderAmount || 10,
        maxOrderAmount: data.maxOrderAmount || 1000,
        maintenanceMode: data.maintenanceMode || false,
        maintenanceMessage: data.maintenanceMessage || "",
      });
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur s'est produite");
    } finally {
      setLoading(false);
    }
  };

  useEffectChargement(() => {
    fetchConfig();
  }, []);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target as any;
    setFormData((prev) => ({
      ...prev,
      [name]:
        type === "checkbox"
          ? (e.target as HTMLInputElement).checked
          : type === "number"
            ? parseFloat(value)
            : value,
    }));
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/config`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
        body: JSON.stringify({
          ...formData,
          platformFeePercent: Number(formData.platformFeePercent),
          minOrderAmount: Number(formData.minOrderAmount),
          maxOrderAmount: Number(formData.maxOrderAmount),
        }),
      });

      if (!res.ok) throw new Error("Erreur lors de la sauvegarde");
      setSuccess("Configuration mise à jour avec succès");
      setError("");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur s'est produite");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white flex items-center gap-2">
          <Settings className="w-8 h-8" />
          Configuration Système
        </h1>
        <p className="text-gray-400 mt-2">
          Gérez les paramètres globaux de la plateforme
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-900/20 text-red-400 rounded-lg border border-red-500/20">
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-900/20 text-green-400 rounded-lg border border-green-500/20">
          {success}
        </div>
      )}

      {formData.maintenanceMode && (
        <div className="p-4 bg-yellow-500/10 text-yellow-400 rounded-lg border border-yellow-500/20 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Mode Maintenance Activé</p>
            <p className="text-sm mt-1">
              La plateforme est actuellement en mode maintenance
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700/50 space-y-4">
          <h2 className="text-lg font-semibold text-white">
            Paramètres Financiers
          </h2>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Commission Plateforme (%)
            </label>
            <input
              type="number"
              name="platformFeePercent"
              value={formData.platformFeePercent}
              onChange={handleInputChange}
              min="0"
              max="100"
              step="0.1"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">
              Pourcentage prélevé sur chaque commande
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Montant Minimum Commande (€)
            </label>
            <input
              type="number"
              name="minOrderAmount"
              value={formData.minOrderAmount}
              onChange={handleInputChange}
              min="0"
              step="0.01"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Montant Maximum Commande (€)
            </label>
            <input
              type="number"
              name="maxOrderAmount"
              value={formData.maxOrderAmount}
              onChange={handleInputChange}
              min="0"
              step="0.01"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700/50 space-y-4">
          <h2 className="text-lg font-semibold text-white">
            Mode Maintenance
          </h2>

          <div className="flex items-center gap-4">
            <input
              type="checkbox"
              name="maintenanceMode"
              checked={formData.maintenanceMode}
              onChange={handleInputChange}
              className="w-5 h-5 bg-gray-700 border border-gray-600 rounded cursor-pointer"
            />
            <label className="text-sm text-gray-300">
              Activer le mode maintenance
            </label>
          </div>

          {formData.maintenanceMode && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Message de Maintenance
              </label>
              <textarea
                name="maintenanceMessage"
                value={formData.maintenanceMessage}
                onChange={handleInputChange}
                placeholder="Message affiché aux utilisateurs"
                rows={3}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={saveConfig}
          disabled={saving}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition font-medium"
        >
          {saving ? "Enregistrement..." : t('save')}
        </button>
        <button
          onClick={fetchConfig}
          disabled={loading}
          className="px-6 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition font-medium"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
