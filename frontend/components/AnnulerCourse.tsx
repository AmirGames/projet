'use client';

/**
 * Modal pour annuler une course acceptée.
 * Utilisé par le livreur pour annuler une course avec raison.
 */

import { useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Props {
  deliveryId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

// Le motif part au serveur tel quel, en français : c'est ce que l'équipe lit.
// Seul l'affichage suit la langue (`raisons.<rang>` des traductions).
const reasons = [
  'Client absent',
  'Adresse introuvable',
  'Route bloquée/embouteillage',
  'Problème véhicule',
  'Urgence personnelle',
  'Autre',
];

export function AnnulerCourse({ deliveryId, onSuccess, onCancel }: Props) {
  const t = useTranslations('annulerCourse');
  const [selectedReason, setSelectedReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    try {
      const reason = selectedReason === 'Autre' ? customReason : selectedReason;

      if (!reason || reason.trim().length === 0) {
        setError(t('choisirRaison'));
        return;
      }

      setLoading(true);
      setError('');

      const token = localStorage.getItem('driverToken') || localStorage.getItem('accessToken');
      if (!token) {
        setError(t('nonAuthentifie'));
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
        throw new Error(data.error || t('erreurAnnulation'));
      }

      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('erreurInconnue'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white border border-gray-200 rounded-lg max-w-md w-full shadow-xl">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <AlertCircle size={24} className="text-red-500" />
              {t('titre')}
            </h2>
            <button
              onClick={onCancel}
              className="text-gray-500 hover:text-gray-700"
            >
              <X size={24} />
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            {t('aide')}
          </p>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-sm p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">{t('raison')}</label>
            <div className="space-y-2">
              {reasons.map((reason, rang) => (
                <label
                  key={reason}
                  className="flex items-center gap-3 p-3 bg-gray-50 hover:bg-gray-100 rounded-lg cursor-pointer transition"
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
                  <span className="text-gray-700">{t(`raisons.${rang}`)}</span>
                </label>
              ))}
            </div>
          </div>

          {selectedReason === 'Autre' && (
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-2">
                {t('preciser')}
              </label>
              <textarea
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder={t('decrivez')}
                className="w-full bg-gray-100 border border-gray-300 rounded-lg p-2 text-gray-900 placeholder-gray-400 focus:outline-hidden focus:border-orange-500"
                rows={3}
              />
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold py-2 rounded-lg transition"
          >
            {t('continuer')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold py-2 rounded-lg transition"
          >
            {loading ? t('annulation') : t('confirmer')}
          </button>
        </div>
      </div>
    </div>
  );
}
