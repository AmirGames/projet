'use client';


import { jetonAcces } from '@/lib/jeton-session';
import { signalerErreur } from '@/lib/erreurs';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Briefcase, Search, Eye, CheckCircle, XCircle } from 'lucide-react';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Delivery {
  id: string;
  name: string;
  email: string;
  phone?: string;
  status: 'active' | 'suspended' | 'inactive';
  deliveries?: number;
  rating?: number;
}

export default function DeliveriesPage() {
  const t = useTranslations('superownerMembers');
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended' | 'inactive'>('all');

  const fetchDeliveries = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const token = jetonAcces();
      const response = await fetch(`${API_URL}/api/superowner/members/deliveries`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      if (!Array.isArray(data.deliveries)) throw new Error('Invalid couriers response');
      // L'API renvoie les statuts de la base, en majuscules (ACTIVE) ; l'écran
      // — couleurs, filtre, libellés — les attend en minuscules.
      setDeliveries(
        data.deliveries.map((ligne: Delivery) => ({
          ...ligne,
          status: String(ligne.status || '').toLowerCase() as Delivery['status'],
        }))
      );
    } catch (error) {
      setLoadError(true);
      signalerErreur('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffectChargement(() => {
    fetchDeliveries();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-50 text-green-600';
      case 'suspended':
        return 'bg-orange-50 text-orange-600';
      case 'inactive':
        return 'bg-gray-600/20 text-gray-500';
      default:
        return 'bg-gray-600/20 text-gray-500';
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

  if (loading && deliveries.length === 0) return <div className="text-center py-8" role="status">{t('loading')}</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Briefcase size={32} className="text-purple-600" />
          {t('deliveriesTitle')}
        </h1>
        <p className="text-gray-500 mt-1">{t('deliveriesSubtitle')}</p>
      </div>

      {loadError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800" role="alert">
          <span>{t('loadError')}</span>
          <button type="button" onClick={fetchDeliveries} className="rounded-md border border-red-300 px-3 py-2 font-medium hover:bg-red-100">
            {t('retry')}
          </button>
        </div>
      )}
      {loading && deliveries.length > 0 && <p className="text-sm text-gray-500" role="status">{t('loading')}</p>}

      {/* Search and Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-3 top-3 text-gray-500" />
            <input
              type="text"
              aria-label={t('searchPlaceholder')}
              placeholder={t('searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-gray-100 border border-gray-300 rounded-lg pl-10 pr-4 py-2 text-gray-900 placeholder-gray-400 focus:outline-hidden focus:border-purple-500"
            />
          </div>
        </div>

        {/* Status Filter */}
        <div className="flex gap-2">
          {(['all', 'active', 'suspended', 'inactive'] as const).map((status) => (
            <button
              key={status}
              type="button"
              aria-pressed={statusFilter === status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-lg border transition-colors ${
                statusFilter === status
                  ? 'bg-purple-50 border-purple-600 text-purple-600'
                  : 'bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {t(`status.${status}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {filteredDeliveries.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100 border-b border-gray-300">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">{t('name')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">{t('email')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">{t('phone')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">{t('deliveriesCount')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">{t('rating')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">{t('statusColumn')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">{t('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredDeliveries.map((delivery) => (
                  <tr key={delivery.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">{delivery.name}</td>
                    <td className="px-6 py-4 text-gray-500 text-sm">{delivery.email}</td>
                    <td className="px-6 py-4 text-gray-500 text-sm">{delivery.phone || '—'}</td>
                    <td className="px-6 py-4 text-gray-700 text-sm">{delivery.deliveries ?? 0}</td>
                    <td className="px-6 py-4 text-gray-700 text-sm">{typeof delivery.rating === 'number' ? delivery.rating.toFixed(1) : '—'}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(delivery.status)}`}>
                        {getStatusIcon(delivery.status)}
                        {t.has(`status.${delivery.status}`) ? t(`status.${delivery.status}`) : delivery.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <Link
                          href={`/superowner/zupeat/drivers?status=${encodeURIComponent(delivery.status.toUpperCase())}&driver=${encodeURIComponent(delivery.id)}`}
                          className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-purple-700 hover:bg-purple-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-600"
                          title={t('view')}
                          aria-label={`${t('view')} — ${delivery.name}`}
                        >
                          <Eye size={18} />
                          {t('view')}
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <Briefcase size={48} className="mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500">{t('empty')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
