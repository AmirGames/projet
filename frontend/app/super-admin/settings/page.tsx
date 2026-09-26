'use client';

import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { AVAILABLE_THEMES, applyTheme, getTheme, saveThemeToAPI, Theme } from '@/lib/theme-config';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const [formData, setFormData] = useState({
    platformFeePercent: 5,
    minOrderAmount: 0,
    maxOrderAmount: 9999.99,
    maintenanceMode: false,
    maintenanceMessage: '',
    selectedTheme: 'dark',
    driverBaseFee: 2.5,
    driverPerKmFee: 0.8,
    driverOfferSeconds: 30,
    driverMaxRadiusKm: 8,
  });

  const fetchConfig = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/admin/config`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch');

      const data = await response.json();
      setFormData({
        platformFeePercent: data.platformFeePercent,
        minOrderAmount: data.minOrderAmount,
        maxOrderAmount: data.maxOrderAmount,
        maintenanceMode: data.maintenanceMode,
        maintenanceMessage: data.maintenanceMessage || '',
        selectedTheme: data.selectedTheme || 'dark',
        driverBaseFee: Number(data.driverBaseFee ?? 2.5),
        driverPerKmFee: Number(data.driverPerKmFee ?? 0.8),
        driverOfferSeconds: Number(data.driverOfferSeconds ?? 30),
        driverMaxRadiusKm: Number(data.driverMaxRadiusKm ?? 8),
      });
      // Apply saved theme
      applyTheme(getTheme(data.selectedTheme || 'dark'));
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffectChargement(() => {
    fetchConfig();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : type === 'number' ? parseFloat(value) : value,
    }));

    // Apply theme immediately when changed
    if (name === 'selectedTheme') {
      applyTheme(getTheme(value));
    }
  };

  const handleSave = async () => {
    setSaving(true);

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/admin/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...formData,
          platformFeePercent: Number(formData.platformFeePercent),
          minOrderAmount: Number(formData.minOrderAmount),
          maxOrderAmount: Number(formData.maxOrderAmount),
          driverBaseFee: Number(formData.driverBaseFee),
          driverPerKmFee: Number(formData.driverPerKmFee),
          driverOfferSeconds: Math.round(Number(formData.driverOfferSeconds)),
          driverMaxRadiusKm: Number(formData.driverMaxRadiusKm),
        }),
      });

      if (!response.ok) throw new Error('Failed to save');

      setMessage('✅ Paramètres sauvegardés avec succès!');
      setTimeout(() => setMessage(''), 3000);
      fetchConfig();
    } catch (error) {
      console.error('Erreur:', error);
      setMessage('❌ Erreur lors de la sauvegarde');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleThemeChange = async (themeId: string) => {
    try {
      const token = localStorage.getItem('accessToken');
      await saveThemeToAPI(themeId, API_URL, token || '');

      setFormData(prev => ({
        ...prev,
        selectedTheme: themeId,
      }));

      applyTheme(getTheme(themeId));
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  if (loading) return <div className="text-center py-8">Chargement...</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Paramètres système</h1>
        <p className="text-gray-400 mt-1">Configuration globale du système</p>
      </div>

      {/* Message */}
      {message && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle size={20} />
          {message}
        </div>
      )}

      {/* Settings Form */}
      <form className="space-y-6">
        {/* Section 1: Commissions & Fees */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-bold">Commissions et frais</h2>

          <div>
            <label className="block text-sm font-medium mb-2">Commission platforme (%)</label>
            <input
              type="number"
              name="platformFeePercent"
              value={formData.platformFeePercent}
              onChange={handleChange}
              step="0.1"
              min="0"
              max="100"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
            <p className="text-sm text-gray-400 mt-2">
              Pourcentage de commission appliqué à chaque commande
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Montant minimum</label>
              <input
                type="number"
                name="minOrderAmount"
                value={formData.minOrderAmount}
                onChange={handleChange}
                step="0.01"
                min="0"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Montant maximum</label>
              <input
                type="number"
                name="maxOrderAmount"
                value={formData.maxOrderAmount}
                onChange={handleChange}
                step="0.01"
                min="0"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Section : Livraison */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-bold">Livraison et livreurs</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Rayon de recherche (km)</label>
              <input
                type="number"
                name="driverMaxRadiusKm"
                value={formData.driverMaxRadiusKm}
                onChange={handleChange}
                step="0.5"
                min="1"
                max="50"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">Distance maximale boutique ↔ livreur pour proposer une course</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Délai d'acceptation (s)</label>
              <input
                type="number"
                name="driverOfferSeconds"
                value={formData.driverOfferSeconds}
                onChange={handleChange}
                step="1"
                min="10"
                max="600"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">Temps laissé au livreur avant de passer au suivant</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Rémunération de base (€)</label>
              <input
                type="number"
                name="driverBaseFee"
                value={formData.driverBaseFee}
                onChange={handleChange}
                step="0.1"
                min="0"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">Montant fixe par course</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Rémunération par km (€)</label>
              <input
                type="number"
                name="driverPerKmFee"
                value={formData.driverPerKmFee}
                onChange={handleChange}
                step="0.05"
                min="0"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">Ajouté pour chaque km boutique ↔ livreur</p>
            </div>
          </div>
        </div>

        {/* Section 2: Thème */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-bold">Thème de l'interface</h2>

          <div>
            <label className="block text-sm font-medium mb-3">Choisir un thème</label>
            <select
              name="selectedTheme"
              value={formData.selectedTheme}
              onChange={(e) => handleThemeChange(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
            >
              {Object.entries(AVAILABLE_THEMES).map(([id, theme]) => (
                <option key={id} value={id}>
                  {theme.name} - {theme.description}
                </option>
              ))}
            </select>
            <p className="text-sm text-gray-400 mt-2">
              Le thème change immédiatement et est sauvegardé automatiquement.
            </p>
          </div>

          {/* Theme Preview */}
          <div className="mt-6">
            <p className="text-sm font-medium mb-3">Aperçu du thème actuel</p>
            <div className="grid grid-cols-3 gap-3">
              {['primary', 'secondary', 'accent', 'success', 'error', 'warning'].map((colorType) => {
                const theme = getTheme(formData.selectedTheme);
                const colorKey = `${colorType}Color` as keyof Theme;
                const color = theme[colorKey] as string;
                return (
                  <div key={colorType} className="flex flex-col items-center">
                    <div
                      className="w-12 h-12 rounded-lg border border-gray-600 mb-2"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-xs text-gray-400 capitalize">{colorType}</span>
                    <span className="text-xs text-gray-500">{color}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Section 3: Maintenance */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-bold">Mode maintenance</h2>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              name="maintenanceMode"
              checked={formData.maintenanceMode}
              onChange={handleChange}
              className="w-4 h-4 rounded border-gray-600 cursor-pointer"
            />
            <label className="text-sm font-medium cursor-pointer">
              Activer le mode maintenance
            </label>
          </div>

          {formData.maintenanceMode && (
            <div>
              <label className="block text-sm font-medium mb-2">Message de maintenance</label>
              <textarea
                name="maintenanceMessage"
                value={formData.maintenanceMessage}
                onChange={handleChange}
                placeholder="Message à afficher aux utilisateurs..."
                rows={3}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />
            </div>
          )}
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors font-medium"
          >
            {saving ? 'Sauvegarde...' : 'Sauvegarder les paramètres'}
          </button>
        </div>
      </form>
    </div>
  );
}
