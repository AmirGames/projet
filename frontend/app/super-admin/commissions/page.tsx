'use client';

import { useState } from 'react';
import { Search, Download, Filter } from 'lucide-react';

import { euro } from '@/lib/format';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Commission {
  id: string;
  orgId: string;
  orgName: string;
  amount: number;
  percentage: number;
  period: string;
  ordersCount: number;
  totalRevenue: number;
  status: 'PAID' | 'PENDING' | 'PROCESSING';
}

export default function CommissionsPage() {
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PAID' | 'PENDING' | 'PROCESSING'>('ALL');
  const [selectedPeriod, setSelectedPeriod] = useState('');

  const fetchCommissions = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/admin/commissions`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setCommissions(data.commissions || []);
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffectChargement(() => {
    fetchCommissions();
  }, []);

  const filteredCommissions = commissions.filter(commission => {
    const matchesSearch = commission.orgName.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || commission.status === statusFilter;
    const matchesPeriod = !selectedPeriod || commission.period === selectedPeriod;
    return matchesSearch && matchesStatus && matchesPeriod;
  });

  const periods = Array.from(new Set(commissions.map(c => c.period)));

  const stats = {
    total: commissions.reduce((sum, c) => sum + Number(c.amount || 0), 0),
    paid: commissions.filter(c => c.status === 'PAID').reduce((sum, c) => sum + Number(c.amount || 0), 0),
    pending: commissions.filter(c => c.status === 'PENDING').reduce((sum, c) => sum + Number(c.amount || 0), 0),
    processing: commissions.filter(c => c.status === 'PROCESSING').reduce((sum, c) => sum + Number(c.amount || 0), 0),
  };

  const exportCommissions = () => {
    const csv = [
      ['Période', 'Commerçant', 'Montant', 'Pourcentage', 'Statut', 'Commandes', 'Revenu'].join(','),
      ...filteredCommissions.map(c =>
        [
          c.period,
          c.orgName,
          c.amount.toFixed(2),
          c.percentage + '%',
          c.status,
          c.ordersCount,
          c.totalRevenue.toFixed(2),
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `commissions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  if (loading) return <div className="text-center py-8">Chargement...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Gestion des Commissions</h1>
        <p className="text-gray-400 mt-1">Suivi détaillé par période et commerçant</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <p className="text-gray-400 text-sm mb-2">Montant Total</p>
          <p className="text-2xl font-bold text-green-400">{euro(stats.total)}</p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <p className="text-gray-400 text-sm mb-2">Payées</p>
          <p className="text-2xl font-bold text-blue-400">{euro(stats.paid)}</p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <p className="text-gray-400 text-sm mb-2">En Attente</p>
          <p className="text-2xl font-bold text-yellow-400">{euro(stats.pending)}</p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <p className="text-gray-400 text-sm mb-2">En Traitement</p>
          <p className="text-2xl font-bold text-purple-400">{euro(stats.processing)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-2">
            <Search size={20} className="text-gray-400" />
            <input
              type="text"
              placeholder="Chercher commerçant..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter size={20} className="text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">Tous les statuts</option>
              <option value="PAID">Payées</option>
              <option value="PENDING">En attente</option>
              <option value="PROCESSING">En traitement</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
            >
              <option value="">Toutes les périodes</option>
              {periods.map(period => (
                <option key={period} value={period}>{period}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={exportCommissions}
          className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 rounded-lg px-4 py-2 font-medium transition-colors w-full md:w-auto"
        >
          <Download size={20} />
          Exporter CSV
        </button>
      </div>

      {/* Commissions Table */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
        {filteredCommissions.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            Aucune commission trouvée.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-700 border-b border-gray-600">
              <tr>
                <th className="px-6 py-4 text-left">Période</th>
                <th className="px-6 py-4 text-left">Commerçant</th>
                <th className="px-6 py-4 text-right">Montant</th>
                <th className="px-6 py-4 text-right">Pourcentage</th>
                <th className="px-6 py-4 text-center">Statut</th>
                <th className="px-6 py-4 text-right">Commandes</th>
                <th className="px-6 py-4 text-right">Revenu</th>
              </tr>
            </thead>
            <tbody>
              {filteredCommissions.map((commission) => (
                <tr key={commission.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                  <td className="px-6 py-4 font-medium">{commission.period}</td>
                  <td className="px-6 py-4">{commission.orgName}</td>
                  <td className="px-6 py-4 text-right font-bold text-green-400">
                    {euro(commission.amount)}
                  </td>
                  <td className="px-6 py-4 text-right">{commission.percentage}%</td>
                  <td className="px-6 py-4 text-center">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        commission.status === 'PAID'
                          ? 'bg-green-600/20 text-green-400'
                          : commission.status === 'PENDING'
                          ? 'bg-yellow-600/20 text-yellow-400'
                          : 'bg-blue-600/20 text-blue-400'
                      }`}
                    >
                      {commission.status === 'PAID' && '✅ Payée'}
                      {commission.status === 'PENDING' && '⏳ Attente'}
                      {commission.status === 'PROCESSING' && '⚙️ Traitement'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-gray-400">{commission.ordersCount}</td>
                  <td className="px-6 py-4 text-right text-gray-400">{euro(commission.totalRevenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-gray-400 text-sm">
        Total: <strong>{filteredCommissions.length}</strong> commission(s)
      </div>
    </div>
  );
}
