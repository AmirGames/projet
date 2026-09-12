'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface MerchantDetail {
  id: string;
  name: string;
  slug: string;
  tier: string;
  status: string;
  stores: any[];
  memberships: any[];
  tickets: any[];
  commissionHistory: any[];
  stats: {
    totalRevenue: number;
    commission: number;
    ordersCount: number;
  };
}

export default function MerchantDetailPage() {
  const router = useRouter();
  const params = useParams();
  const merchantId = params.id as string;

  const [merchant, setMerchant] = useState<MerchantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [newStatus, setNewStatus] = useState('');
  const [newTier, setNewTier] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchMerchant();
  }, [merchantId]);

  const fetchMerchant = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/admin/merchants/${merchantId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch');

      const data = await response.json();
      setMerchant(data);
      setNewStatus(data.status);
      setNewTier(data.tier);
    } catch (error) {
      console.error('Erreur:', error);
      router.push('/super-admin/merchants');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!merchant) return;
    setSaving(true);

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/admin/merchants/${merchantId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: newStatus,
          tier: newTier,
        }),
      });

      if (!response.ok) throw new Error('Failed to update');

      fetchMerchant();
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-center py-8">Chargement...</div>;
  if (!merchant) return <div className="text-center py-8 text-red-400">Commerçant non trouvé</div>;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/super-admin/merchants" className="p-2 hover:bg-gray-700 rounded-lg transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-3xl font-bold">{merchant.name}</h1>
          <p className="text-gray-400 mt-1">{merchant.slug}</p>
        </div>
      </div>

      {/* Status Alert */}
      {merchant.status !== 'ACTIVE' && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle size={20} className="text-red-400" />
          <span className="text-red-400">Statut: {merchant.status}</span>
        </div>
      )}

      {/* Controls */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-bold">Gestion du commerçant</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Statut</label>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="SUSPENDED">SUSPENDED</option>
              <option value="CLOSED">CLOSED</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Plan</label>
            <select
              value={newTier}
              onChange={(e) => setNewTier(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
            >
              <option value="FREE">FREE</option>
              <option value="PREMIUM">PREMIUM</option>
              <option value="PRO">PRO</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={handleUpdate}
              disabled={saving}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors font-medium"
            >
              {saving ? 'Sauvegarde...' : 'Mettre à jour'}
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <p className="text-gray-400 text-sm mb-2">Chiffre d'affaires</p>
          <p className="text-3xl font-bold">{merchant.stats.totalRevenue.toFixed(2)} €</p>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <p className="text-gray-400 text-sm mb-2">Commission</p>
          <p className="text-3xl font-bold text-green-400">{merchant.stats.commission.toFixed(2)} €</p>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <p className="text-gray-400 text-sm mb-2">Commandes</p>
          <p className="text-3xl font-bold">{merchant.stats.ordersCount}</p>
        </div>
      </div>

      {/* Stores */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <h2 className="text-lg font-bold mb-4">Boutiques ({merchant.stores.length})</h2>
        {merchant.stores.length > 0 ? (
          <div className="space-y-2">
            {merchant.stores.map((store) => (
              <div key={store.id} className="p-3 bg-gray-700 rounded-lg flex justify-between items-center">
                <div>
                  <p className="font-medium">{store.name}</p>
                  <p className="text-sm text-gray-400">{store.id}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400">Aucune boutique</p>
        )}
      </div>

      {/* Team Members */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <h2 className="text-lg font-bold mb-4">Équipe ({merchant.memberships.length})</h2>
        {merchant.memberships.length > 0 ? (
          <div className="space-y-2">
            {merchant.memberships.map((member) => (
              <div key={member.id} className="p-3 bg-gray-700 rounded-lg flex justify-between items-center">
                <div>
                  <p className="font-medium">{member.user.email}</p>
                  <p className="text-sm text-gray-400">{member.role}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400">Aucun membre</p>
        )}
      </div>

      {/* Recent Tickets */}
      {merchant.tickets.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <h2 className="text-lg font-bold mb-4">Tickets récents</h2>
          <div className="space-y-2">
            {merchant.tickets.slice(0, 5).map((ticket) => (
              <div key={ticket.id} className="p-3 bg-gray-700 rounded-lg">
                <p className="font-medium">{ticket.title}</p>
                <div className="text-sm text-gray-400 mt-1 flex gap-2">
                  <span className="px-2 py-1 bg-gray-600 rounded">{ticket.status}</span>
                  <span className="px-2 py-1 bg-gray-600 rounded">{ticket.priority}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
