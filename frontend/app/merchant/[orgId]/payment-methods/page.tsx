'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Trash2, Edit2, Power } from 'lucide-react';
import Link from 'next/link';

import { useCurrentStore } from '@/lib/current-store';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface PaymentMethod {
  id: string;
  type: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  commissionPercent: number;
  fixedFee: number;
  createdAt: string;
}

export default function PaymentMethodsPage() {
  const { storeId } = useCurrentStore();
  const params = useParams();
  const router = useRouter();
  const orgId = params?.orgId as string;

  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const itemsPerPage = 20;

  useEffect(() => {
    if (storeId) fetchPaymentMethods();
  }, [storeId, page]);

  const fetchPaymentMethods = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
      if (!token) {
        router.push('/login');
        return;
      }

      const skip = page * itemsPerPage;
      const response = await fetch(
        `${API_URL}/api/payment-methods/${storeId}?skip=${skip}&take=${itemsPerPage}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!response.ok) throw new Error('Failed to fetch payment methods');

      const data = await response.json();
      setMethods(data.data || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error('Error fetching payment methods:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (methodId: string) => {
    try {
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/payment-methods/${storeId}/${methodId}/toggle`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to toggle payment method');
      const data = await response.json();
      setMethods(methods.map(m => m.id === methodId ? data.method : m));
    } catch (error) {
      console.error('Error toggling payment method:', error);
    }
  };

  const handleDelete = async (methodId: string) => {
    try {
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/payment-methods/${storeId}/${methodId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to delete payment method');
      setMethods(methods.filter(m => m.id !== methodId));
    } catch (error) {
      console.error('Error deleting payment method:', error);
    }
  };

  const totalPages = Math.ceil(total / itemsPerPage);

  if (loading && methods.length === 0) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
            <p className="text-gray-400">Chargement des méthodes de paiement...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-bold">Méthodes de Paiement</h1>
            <Link href={`/merchant/${orgId}/dashboard`} className="text-gray-400 hover:text-gray-300 text-sm">
              ← Retour
            </Link>
          </div>
          <p className="text-gray-400">Configurez les méthodes de paiement acceptées</p>
        </div>

        <div className="space-y-4">
          {methods.length === 0 ? (
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center text-gray-400">
              Aucune méthode de paiement configurée
            </div>
          ) : (
            methods.map((method) => (
              <div key={method.id} className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-bold">{method.name}</h3>
                      {method.isDefault && (
                        <span className="px-2 py-1 bg-blue-600/20 text-blue-400 text-xs rounded">Par défaut</span>
                      )}
                      <span className={`px-2 py-1 text-xs rounded ${
                        method.isActive
                          ? 'bg-green-600/20 text-green-400'
                          : 'bg-gray-600/20 text-gray-400'
                      }`}>
                        {method.isActive ? 'Actif' : 'Inactif'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400 mb-3">{method.type}</p>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-400">Commission</p>
                        <p className="font-bold text-blue-400">{Number(method.commissionPercent).toFixed(2)}%</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Frais fixes</p>
                        <p className="font-bold text-green-400">${Number(method.fixedFee).toFixed(2)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleToggle(method.id)}
                      className={`p-2 rounded transition ${
                        method.isActive
                          ? 'bg-green-600/20 hover:bg-green-600/30 text-green-400'
                          : 'bg-gray-600/20 hover:bg-gray-600/30 text-gray-400'
                      }`}
                      title={method.isActive ? 'Désactiver' : 'Activer'}
                    >
                      <Power size={18} />
                    </button>
                    <button className="p-2 hover:bg-gray-600 rounded transition text-blue-400">
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(method.id)}
                      className="p-2 hover:bg-gray-600 rounded transition text-red-400"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-8 px-6 py-4 bg-gray-800 border border-gray-700 rounded-lg">
            <p className="text-sm text-gray-400">Page {page + 1} sur {totalPages}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded text-sm"
              >
                Précédent
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page === totalPages - 1}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded text-sm"
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
