'use client';

import { signalerErreur } from '@/lib/erreurs';
import { useState, useCallback } from 'react';
import { CreditCard, Plus, Trash2 } from 'lucide-react';
import { useDerniereValeur } from '@/lib/use-derniere-valeur';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface PaymentMethod {
  id: string;
  type: string;
  brand: string;
  last4: string;
  isDefault: boolean;
}

interface PaymentMethodsProps {
  onSelect: (methodId: string) => void;
}

export function PaymentMethods({ onSelect }: PaymentMethodsProps) {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  // Gardé dans une ref : un onSelect recréé à chaque rendu du parent ne doit pas relancer le chargement.
  const onSelectRef = useDerniereValeur(onSelect);

  const fetchPaymentMethods = useCallback(async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    try {
      const response = await fetch(`${API_URL}/api/payment-methods`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setMethods(data.data);
        const defaultMethod = data.data.find((m: PaymentMethod) => m.isDefault);
        if (defaultMethod) {
          setSelected(defaultMethod.id);
          onSelectRef.current(defaultMethod.id);
        }
      }
    } catch (err) {
      signalerErreur('Error fetching payment methods:', err);
    } finally {
      setLoading(false);
    }
  }, [onSelectRef]);

  useEffectChargement(() => {
    fetchPaymentMethods();
  }, [fetchPaymentMethods]);

  const handleDelete = async (methodId: string) => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    try {
      await fetch(`${API_URL}/api/payment-methods/${methodId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      setMethods((prev) => prev.filter((m) => m.id !== methodId));
      if (selected === methodId) setSelected(null);
    } catch (err) {
      signalerErreur('Error deleting payment method:', err);
    }
  };

  if (loading) return <p className="text-gray-400">Chargement...</p>;

  return (
    <div className="space-y-3">
      {methods.map((method) => (
        <div
          key={method.id}
          onClick={() => {
            setSelected(method.id);
            onSelect(method.id);
          }}
          className={`p-4 rounded-lg cursor-pointer transition border-2 flex justify-between items-center ${
            selected === method.id
              ? 'bg-orange-600/10 border-orange-600'
              : 'bg-gray-800 border-gray-700 hover:border-gray-600'
          }`}
        >
          <div className="flex items-center gap-3">
            <CreditCard size={20} className="text-gray-400" />
            <div>
              <p className="text-white font-semibold capitalize">{method.brand}</p>
              <p className="text-gray-400 text-sm">•••• {method.last4}</p>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(method.id);
            }}
            className="p-1 text-red-500 hover:bg-red-900/20 rounded"
          >
            <Trash2 size={18} />
          </button>
        </div>
      ))}

      <button className="w-full p-3 border-2 border-dashed border-gray-700 rounded-lg text-gray-400 hover:text-white hover:border-gray-600 transition flex items-center justify-center gap-2">
        <Plus size={18} />
        Ajouter une carte
      </button>
    </div>
  );
}
