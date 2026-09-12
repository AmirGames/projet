'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Trash2, Edit2 } from 'lucide-react';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface TaxSetting {
  id: string;
  name: string;
  rate: number;
  applicableTo: string;
  status: string;
  categoryIds: string[];
  productIds: string[];
}

export default function TaxSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params?.orgId as string;

  const [taxes, setTaxes] = useState<TaxSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const itemsPerPage = 20;

  useEffect(() => {
    if (orgId) fetchTaxSettings();
  }, [orgId, page]);

  const fetchTaxSettings = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
      if (!token) {
        router.push('/login');
        return;
      }

      const skip = page * itemsPerPage;
      const response = await fetch(
        `${API_URL}/api/tax-settings/${orgId}?skip=${skip}&take=${itemsPerPage}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!response.ok) throw new Error('Failed to fetch tax settings');

      const data = await response.json();
      setTaxes(data.data || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error('Error fetching tax settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (taxId: string) => {
    try {
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/tax-settings/${orgId}/${taxId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to delete tax setting');
      setTaxes(taxes.filter(t => t.id !== taxId));
    } catch (error) {
      console.error('Error deleting tax setting:', error);
    }
  };

  const totalPages = Math.ceil(total / itemsPerPage);

  if (loading && taxes.length === 0) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
            <p className="text-gray-400">Chargement des paramètres fiscaux...</p>
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
            <h1 className="text-3xl font-bold">Paramètres Fiscaux</h1>
            <Link href={`/merchant/${orgId}/dashboard`} className="text-gray-400 hover:text-gray-300 text-sm">
              ← Retour
            </Link>
          </div>
          <p className="text-gray-400">Configurez les taux de taxe pour votre magasin</p>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700 border-b border-gray-600">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold">Nom</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">Taux</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">Applicable à</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">Statut</th>
                  <th className="px-6 py-3 text-center text-sm font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {taxes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                      Aucun paramètre fiscal configuré
                    </td>
                  </tr>
                ) : (
                  taxes.map((tax) => (
                    <tr key={tax.id} className="border-b border-gray-700 hover:bg-gray-700/50 transition">
                      <td className="px-6 py-4 font-medium">{tax.name}</td>
                      <td className="px-6 py-4 text-sm">
                        <span className="text-blue-400 font-bold">{Number(tax.rate).toFixed(2)}%</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-300">
                        {tax.applicableTo === 'all' ? 'Tous les produits' : tax.applicableTo}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          tax.status === 'ACTIVE'
                            ? 'bg-green-600/20 text-green-400'
                            : 'bg-gray-600/20 text-gray-400'
                        }`}>
                          {tax.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button className="p-1 hover:bg-gray-600 rounded transition">
                            <Edit2 size={16} className="text-blue-400" />
                          </button>
                          <button
                            onClick={() => handleDelete(tax.id)}
                            className="p-1 hover:bg-gray-600 rounded transition"
                          >
                            <Trash2 size={16} className="text-red-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-700">
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
    </div>
  );
}
