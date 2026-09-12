'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Edit2, Lock, Unlock } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Merchant {
  id: string;
  name: string;
  slug: string;
  tier: string;
  status: string;
  stores: Array<{ id: string; name: string }>;
  createdAt: string;
}

export default function MerchantsPage() {
  const router = useRouter();
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('ALL');

  useEffect(() => {
    fetchMerchants();
  }, [filter]);

  const fetchMerchants = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const status = filter === 'ALL' ? '' : filter;
      const url = new URL(`${API_URL}/api/admin/merchants`);
      if (status) url.searchParams.append('status', status);

      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch');

      const data = await response.json();
      setMerchants(data.merchants || []);
    } catch (error) {
      console.error('Erreur:', error);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (merchantId: string, newStatus: string) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/admin/merchants/${merchantId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) throw new Error('Failed to update');

      fetchMerchants();
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const filteredMerchants = merchants.filter(m =>
    m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="text-center py-8">Chargement...</div>;

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-green-500/20 text-green-400',
    SUSPENDED: 'bg-red-500/20 text-red-400',
    CLOSED: 'bg-gray-500/20 text-gray-400',
  };

  const tierColors: Record<string, string> = {
    FREE: 'bg-blue-500/20 text-blue-400',
    PREMIUM: 'bg-purple-500/20 text-purple-400',
    PRO: 'bg-yellow-500/20 text-yellow-400',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Commerçants</h1>
        <p className="text-gray-400 mt-1">{merchants.length} commerçants</p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {['ALL', 'ACTIVE', 'SUSPENDED', 'CLOSED'].map(status => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === status
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={20} className="absolute left-3 top-3 text-gray-400" />
        <input
          type="text"
          placeholder="Rechercher un commerçant..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-10 pr-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Merchants Table */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-700/50 border-b border-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold">Nom</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Plan</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Statut</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Boutiques</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Créé</th>
              <th className="px-6 py-3 text-right text-sm font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {filteredMerchants.length > 0 ? (
              filteredMerchants.map((merchant) => (
                <tr
                  key={merchant.id}
                  className="hover:bg-gray-700/50 transition-colors cursor-pointer"
                  onClick={() => router.push(`/super-admin/merchants/${merchant.id}`)}
                >
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-medium">{merchant.name}</p>
                      <p className="text-sm text-gray-400">{merchant.slug}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${tierColors[merchant.tier] || tierColors['FREE']}`}>
                      {merchant.tier}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[merchant.status] || statusColors['ACTIVE']}`}>
                      {merchant.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">{merchant.stores.length}</td>
                  <td className="px-6 py-4 text-gray-400">
                    {new Date(merchant.createdAt).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const newStatus = merchant.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
                          handleStatusChange(merchant.id, newStatus);
                        }}
                        className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                      >
                        {merchant.status === 'ACTIVE' ? (
                          <Lock size={18} className="text-orange-400" />
                        ) : (
                          <Unlock size={18} className="text-green-400" />
                        )}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/super-admin/merchants/${merchant.id}`);
                        }}
                        className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                      >
                        <Edit2 size={18} className="text-blue-400" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                  Aucun commerçant trouvé
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
