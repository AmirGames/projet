'use client';

import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';

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
  });

  useEffect(() => {
    fetchConfig();
  }, []);

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
      });
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : type === 'number' ? parseFloat(value) : value,
    }));
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
        body: JSON.stringify(formData),
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

        {/* Section 2: Maintenance */}
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
