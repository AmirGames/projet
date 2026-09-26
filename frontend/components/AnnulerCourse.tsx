'use client';

/**
 * Modal pour annuler une course acceptée.
 * Utilisé par le livreur pour annuler une course avec raison.
 */

import { useState } from 'react';
import { AlertCircle, X } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Props {
  deliveryId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

const reasons = [
  'Client absent',
  'Adresse introuvable',
  'Route bloquée/embouteillage',
  'Problème véhicule',
  'Urgence personnelle',
  'Autre',
];

export function AnnulerCourse({ deliveryId, onSuccess, onCancel }: Props) {
  const [selectedReason, setSelectedReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    try {
      const reason = selectedReason === 'Autre' ? customReason : selectedReason;

      if (!reason || reason.trim().length === 0) {
        setError('Veuillez sélectionner ou entrer une raison');
        return;
      }

      setLoading(true);
      setError('');

      const token = localStorage.getItem('driverToken') || localStorage.getItem('accessToken');
      if (!token) {
        setError('Non authentifié');
        return;
      }

      const response = await fetch(`${API_URL}/api/drivers/deliveries/${deliveryId}/cancel`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Erreur lors de l\'annulation');
      }

      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 border border-gray-700 rounded-lg max-w-md w-full shadow-xl">
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <AlertCircle size={24} className="text-red-500" />
              Annuler la course
            </h2>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-300"
            >
              <X size={24} />
            </button>
          </div>
          <p className="text-sm text-gray-400 mt-2">
            Indiquez la raison de l'annulation. Un autre livreur sera proposé au restaurant.
          </p>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-900/20 border border-red-600/30 rounded p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-300">Raison d'annulation</label>
            <div className="space-y-2">
              {reasons.map((reason) => (
                <label
                  key={reason}
                  className="flex items-center gap-3 p-3 bg-gray-700/50 hover:bg-gray-700 rounded-lg cursor-pointer transition"
                >
                  <input
                    type="radio"
                    name="reason"
                    value={reason}
                    checked={selectedReason === reason}
                    onChange={(e) => {
                      setSelectedReason(e.target.value);
                      if (reason !== 'Autre') {
                        setCustomReason('');
                      }
                    }}
                    className="w-4 h-4"
                  />
                  <span className="text-gray-300">{reason}</span>
                </label>
              ))}
            </div>
          </div>

          {selectedReason === 'Autre' && (
            <div>
              <label className="text-sm font-semibold text-gray-300 block mb-2">
                Précisez la raison
              </label>
              <textarea
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Décrivez brièvement..."
                className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
                rows={3}
              />
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-700 flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 rounded-lg transition"
          >
            Continuer la course
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold py-2 rounded-lg transition"
          >
            {loading ? 'Annulation...' : 'Confirmer l\'annulation'}
          </button>
        </div>
      </div>
    </div>
  );
}
