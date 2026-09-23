'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Briefcase, Search, Filter, Eye, Edit2, Trash2, CheckCircle, XCircle } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Delivery {
  id: string;
  name: string;
  email: string;
  phone?: string;
  companyName?: string;
  status: 'active' | 'suspended' | 'inactive';
  joinDate: string;
  deliveries?: number;
  rating?: number;
}

export default function DeliveriesPage() {
  const t = useTranslations('superownerMembers');
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended' | 'inactive'>('all');

  useEffect(() => {
    fetchDeliveries();
  }, []);

  const fetchDeliveries = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/superowner/members/deliveries`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setDeliveries(data.deliveries || []);
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
      case 'inactive':
        return 'bg-gray-600/20 text-gray-400';
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

  const filteredDeliveries = deliveries.filter((delivery) => {
    const matchesSearch =
      delivery.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      delivery.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || delivery.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) return <div className="text-center py-8">{t('loading')}</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Briefcase size={32} className="text-purple-400" />
          {t('deliveriesTitle')}
        </h1>
        <p className="text-gray-400 mt-1">{t('deliveriesSubtitle')}</p>
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
              className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-10 pr-4 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
          </div>
          <button className="px-4 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg flex items-center gap-2 text-gray-300 transition-colors">
            <Filter size={18} />
            {t('filters')}
          </button>
        </div>

        {/* Status Filter */}
        <div className="flex gap-2">
          {(['all', 'active', 'suspended', 'inactive'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-lg border transition-colors ${
                statusFilter === status
                  ? 'bg-purple-600/20 border-purple-600 text-purple-400'
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
        {filteredDeliveries.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700 border-b border-gray-600">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">{t('name')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">{t('email')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">{t('companyName')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">{t('statusColumn')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">{t('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {filteredDeliveries.map((delivery) => (
                  <tr key={delivery.id} className="hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-100">{delivery.name}</td>
                    <td className="px-6 py-4 text-gray-400 text-sm">{delivery.email}</td>
                    <td className="px-6 py-4 text-gray-400 text-sm">{delivery.companyName || '-'}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(delivery.status)}`}>
                        {getStatusIcon(delivery.status)}
                        {t(`status.${delivery.status}`)}
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
            <Briefcase size={48} className="mx-auto text-gray-600 mb-4" />
            <p className="text-gray-400">{t('empty')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
