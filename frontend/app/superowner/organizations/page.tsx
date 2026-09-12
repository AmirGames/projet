'use client';

import { useEffect, useState } from 'react';
import { Search, Plus, Trash2, Edit2, Eye } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Organization {
  id: string;
  name: string;
  email: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
  usersCount: number;
  revenue: number;
  commission: number;
  createdAt: string;
  subscriptionPlan: string;
}

export default function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED' | 'INACTIVE'>('ALL');

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const fetchOrganizations = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/superowner/organizations`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setOrganizations(data.organizations || []);
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredOrganizations = organizations.filter(org => {
    const matchesSearch = org.name.toLowerCase().includes(search.toLowerCase()) ||
                         org.email.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || org.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) return <div className="text-center py-8">Chargement...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gestion des Organisations</h1>
          <p className="text-gray-400 mt-1">Créer et gérer les organisations</p>
        </div>
        <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 rounded-lg px-4 py-2 font-medium transition-colors">
          <Plus size={20} />
          Créer Organisation
        </button>
      </div>

      {/* Filters */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <Search size={20} className="text-gray-400" />
            <input
              type="text"
              placeholder="Chercher par nom ou email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">Tous les statuts</option>
            <option value="ACTIVE">Actifs</option>
            <option value="SUSPENDED">Suspendus</option>
            <option value="INACTIVE">Inactifs</option>
          </select>
        </div>
      </div>

      {/* Organizations Table */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
        {filteredOrganizations.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            Aucune organisation trouvée.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-700 border-b border-gray-600">
              <tr>
                <th className="px-6 py-4 text-left">Nom</th>
                <th className="px-6 py-4 text-left">Email</th>
                <th className="px-6 py-4 text-center">Statut</th>
                <th className="px-6 py-4 text-right">Utilisateurs</th>
                <th className="px-6 py-4 text-right">Revenu</th>
                <th className="px-6 py-4 text-right">Plan</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrganizations.map((org) => (
                <tr key={org.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                  <td className="px-6 py-4 font-medium">{org.name}</td>
                  <td className="px-6 py-4 text-gray-400">{org.email}</td>
                  <td className="px-6 py-4 text-center">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        org.status === 'ACTIVE'
                          ? 'bg-green-600/20 text-green-400'
                          : org.status === 'SUSPENDED'
                          ? 'bg-red-600/20 text-red-400'
                          : 'bg-gray-600/20 text-gray-400'
                      }`}
                    >
                      {org.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-gray-400">{org.usersCount}</td>
                  <td className="px-6 py-4 text-right font-bold text-green-400">${(org.revenue / 100).toFixed(2)}</td>
                  <td className="px-6 py-4 text-right text-blue-400">{org.subscriptionPlan}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex gap-2 justify-end">
                      <button className="p-2 hover:bg-gray-700 rounded transition-colors text-blue-400">
                        <Eye size={18} />
                      </button>
                      <button className="p-2 hover:bg-gray-700 rounded transition-colors text-yellow-400">
                        <Edit2 size={18} />
                      </button>
                      <button className="p-2 hover:bg-gray-700 rounded transition-colors text-red-400">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-gray-400 text-sm">
        Total: <strong>{filteredOrganizations.length}</strong> organisation(s)
      </div>
    </div>
  );
}
