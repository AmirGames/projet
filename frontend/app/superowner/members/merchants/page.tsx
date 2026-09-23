'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ShoppingCart, Search, Filter, Eye, Edit2, Trash2, CheckCircle, XCircle } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Merchant {
  id: string;
  name: string;
  email: string;
  storeName?: string;
  status: 'active' | 'suspended' | 'closed';
  joinDate: string;
  stores?: number;
  revenue?: number;
}

export default function MerchantsPage() {
  const t = useTranslations('superownerMembers');
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended' | 'closed'>('all');

  useEffect(() => {
    fetchMerchants();
  }, []);

  const fetchMerchants = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/superowner/members/merchants`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      // L'API renvoie les statuts de la base, en majuscules (ACTIVE) ; l'écran
      // — couleurs, filtre, libellés — les attend en minuscules.
      setMerchants(
        (data.merchants || []).map((ligne: any) => ({ ...ligne, status: String(ligne.status || '').toLowerCase() }))
      );
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-600/20 text-green-400';
      case 'suspended':
        return 'bg-orange-600/20 text-orange-400';
      case 'closed':
        return 'bg-red-600/20 text-red-400';
      default:
        return 'bg-gray-600/20 text-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle size={16} />;
      default:
        return <XCircle size={16} />;
    }
  };

  const filteredMerchants = merchants.filter((merchant) => {
    const matchesSearch =
      merchant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      merchant.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || merchant.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) return <div className="text-center py-8">{t('loading')}</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <ShoppingCart size={32} className="text-green-400" />
          {t('merchantsTitle')}
        </h1>
        <p className="text-gray-400 mt-1">{t('merchantsSubtitle')}</p>
      </div>

      {/* Search and Filters */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-4">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-3 top-3 text-gray-500" />
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-10 pr-4 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-green-500"
            />
          </div>
          <button className="px-4 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg flex items-center gap-2 text-gray-300 transition-colors">
            <Filter size={18} />
            {t('filters')}
          </button>
        </div>

        {/* Status Filter */}
        <div className="flex gap-2">
          {(['all', 'active', 'suspended', 'closed'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-lg border transition-colors ${
                statusFilter === status
                  ? 'bg-green-600/20 border-green-600 text-green-400'
                  : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {t(`status.${status}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
        {filteredMerchants.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700 border-b border-gray-600">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">{t('name')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">{t('email')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">{t('storeName')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">{t('statusColumn')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">{t('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {filteredMerchants.map((merchant) => (
                  <tr key={merchant.id} className="hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-100">{merchant.name}</td>
                    <td className="px-6 py-4 text-gray-400 text-sm">{merchant.email}</td>
                    <td className="px-6 py-4 text-gray-400 text-sm">{merchant.storeName || '-'}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(merchant.status)}`}>
                        {getStatusIcon(merchant.status)}
                        {t.has(`status.${merchant.status}`) ? t(`status.${merchant.status}`) : merchant.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button className="p-2 hover:bg-gray-600 rounded transition-colors text-gray-400 hover:text-gray-300" title={t('view')}>
                          <Eye size={18} />
                        </button>
                        <button className="p-2 hover:bg-gray-600 rounded transition-colors text-gray-400 hover:text-gray-300" title={t('edit')}>
                          <Edit2 size={18} />
                        </button>
                        <button className="p-2 hover:bg-red-600/20 rounded transition-colors text-gray-400 hover:text-red-400" title={t('delete')}>
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <ShoppingCart size={48} className="mx-auto text-gray-600 mb-4" />
            <p className="text-gray-400">{t('empty')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
