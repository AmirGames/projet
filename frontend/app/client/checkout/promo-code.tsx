'use client';

import { useState } from 'react';
import { Tag, AlertCircle, Check } from 'lucide-react';

import { euro } from '@/lib/format';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface PromoCodeProps {
  orderAmount: number;
  onApply: (code: string, discount: number) => void;
}

export function PromoCode({ orderAmount, onApply }: PromoCodeProps) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [discount, setDiscount] = useState(0);

  const handleApply = async () => {
    if (!code.trim()) return;

    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      const response = await fetch(`${API_URL}/api/promotions/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, orderAmount }),
      });

      if (response.ok) {
        const data = await response.json();
        setDiscount(data.data.discount);
        setSuccess(true);
        onApply(code, data.data.discount);
      } else {
        const data = await response.json();
        setError(data.error || data.message || 'Code invalide');
      }
    } catch (err) {
      setError('Erreur lors de la validation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <div className="flex items-center gap-2 mb-3">
        <Tag size={18} className="text-orange-500" />
        <label className="text-white font-semibold">Code promo</label>
      </div>

      {success ? (
        <div className="flex items-center gap-2 p-3 bg-green-900/30 border border-green-700 rounded-lg text-green-200">
          <Check size={18} />
          <span>Code appliqué ! Économie: {euro(discount)}</span>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="SUMMER20"
            className="flex-1 px-3 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder-gray-500"
            disabled={loading}
          />
          <button
            onClick={handleApply}
            disabled={loading || !code.trim()}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 text-white rounded-lg transition font-medium"
          >
            {loading ? 'Vérif...' : 'Appliquer'}
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 mt-2 p-2 bg-red-900/30 border border-red-700 rounded text-red-200 text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}
    </div>
  );
}
