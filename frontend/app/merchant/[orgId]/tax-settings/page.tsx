'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Trash2, Edit2, Plus, X } from 'lucide-react';
import Link from 'next/link';

import { useCurrentStore } from '@/lib/current-store';

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
  const { storeId } = useCurrentStore();
  const params = useParams();
  const router = useRouter();
  const orgId = params?.orgId as string;

  const [taxes, setTaxes] = useState<TaxSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const itemsPerPage = 20;

  // La page ne permettait que de supprimer : aucune taxe ne pouvait être
  // créée ni modifiée, alors que l'API le propose.
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [enEdition, setEnEdition] = useState<TaxSetting | null>(null);
  const [message, setMessage] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [formulaire, setFormulaire] = useState({ name: '', rate: '', applicableTo: 'all' });

  const ouvrirModale = (taxe?: TaxSetting) => {
    setEnEdition(taxe || null);
    setFormulaire({
      name: taxe?.name || '',
      rate: taxe ? String(taxe.rate) : '',
      applicableTo: taxe?.applicableTo || 'all',
    });
    setMessage('');
    setModaleOuverte(true);
  };

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault();

    const taux = Number(formulaire.rate);
    if (!formulaire.name.trim() || Number.isNaN(taux) || taux < 0 || taux > 100) {
      setMessage('❌ Indiquez un nom et un taux compris entre 0 et 100');
      return;
    }

    setEnvoi(true);
    setMessage('');

    try {
      const token = localStorage.getItem('accessToken');
      const url = enEdition
        ? `${API_URL}/api/tax-settings/${storeId}/${enEdition.id}`
        : `${API_URL}/api/tax-settings/${storeId}`;

      const response = await fetch(url, {
        method: enEdition ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: formulaire.name.trim(),
          rate: taux,
          applicableTo: formulaire.applicableTo,
        }),
      });

      const donnees = await response.json();

      if (!response.ok) {
        setMessage(`❌ ${donnees.error || 'Enregistrement impossible'}`);
        return;
      }

      setModaleOuverte(false);
      fetchTaxSettings();
    } catch {
      setMessage('❌ Erreur de connexion au serveur');
    } finally {
      setEnvoi(false);
    }
  };

  useEffect(() => {
    if (storeId) fetchTaxSettings();
  }, [storeId, page]);

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
        `${API_URL}/api/tax-settings/${storeId}?skip=${skip}&take=${itemsPerPage}`,
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
      const response = await fetch(`${API_URL}/api/tax-settings/${storeId}/${taxId}`, {
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
            <div className="flex items-center gap-4">
              <button
                onClick={() => ouvrirModale()}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg font-medium transition-colors"
              >
                <Plus size={18} /> Nouvelle taxe
              </button>
              <Link href={`/merchant/${orgId}/dashboard`} className="text-gray-400 hover:text-gray-300 text-sm">
                ← Retour
              </Link>
            </div>
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
                          <button
                            onClick={() => ouvrirModale(tax)}
                            title="Modifier cette taxe"
                            className="p-1 hover:bg-gray-600 rounded transition"
                          >
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

        {modaleOuverte && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <form
              onSubmit={enregistrer}
              className="bg-gray-800 border border-gray-700 rounded-lg p-6 w-full max-w-md space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">
                  {enEdition ? 'Modifier la taxe' : 'Nouvelle taxe'}
                </h2>
                <button
                  type="button"
                  onClick={() => setModaleOuverte(false)}
                  className="p-1 hover:bg-gray-700 rounded"
                >
                  <X size={20} />
                </button>
              </div>

              {message && (
                <div className="bg-gray-700 rounded-lg p-3 text-sm">{message}</div>
              )}

              <div>
                <label className="block text-sm text-gray-400 mb-1">Nom</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  value={formulaire.name}
                  onChange={(e) => setFormulaire({ ...formulaire, name: e.target.value })}
                  placeholder="Ex : TVA restauration"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Taux (%)</label>
                <input
                  type="number"
                  required
                  step="0.1"
                  min="0"
                  max="100"
                  value={formulaire.rate}
                  onChange={(e) => setFormulaire({ ...formulaire, rate: e.target.value })}
                  placeholder="Ex : 10"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Applicable à</label>
                <select
                  value={formulaire.applicableTo}
                  onChange={(e) => setFormulaire({ ...formulaire, applicableTo: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-red-500"
                >
                  <option value="all">Tous les produits</option>
                  <option value="categories">Certaines catégories</option>
                  <option value="products">Certains produits</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={envoi}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-40 rounded-lg font-medium transition-colors"
                >
                  {envoi ? 'Enregistrement...' : 'Enregistrer'}
                </button>
                <button
                  type="button"
                  onClick={() => setModaleOuverte(false)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
