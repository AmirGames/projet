'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { Building2, Users, Ban, CheckCircle, XCircle, Eye } from 'lucide-react';

interface Organization {
  id: string;
  name: string;
  email: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
  tier: 'FREE' | 'PREMIUM' | 'PRO';
  createdAt: string;
  activeUsers: number;
  revenue: number;
}

interface OrganizationsResponse {
  organizations: Organization[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function OrganizationsPage() {
  const t = useTranslations('superownerOrganizations');
  const locale = useLocale();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [action, setAction] = useState('');
  const limit = 20;

  // Suspension et fermeture partagent le service de l'espace
  // d'administration : le comportement est strictement le même.
  // Le changement de formule n'était possible que depuis la fiche détaillée
  // d'un commerçant, dans l'autre espace d'administration.
  const changerFormule = async (org: Organization, tier: string) => {
    setAction(org.id);
    setError('');

    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${API_URL}/api/superowner/organizations/${org.id}/tier`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tier }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t('tierChangeFailed'));
        return;
      }

      await fetchOrganizations();
    } catch {
      setError(t('connectionError'));
    } finally {
      setAction('');
    }
  };

  const agirSurCommercant = async (
    org: Organization,
    operation: 'suspend' | 'unsuspend' | 'close'
  ) => {
    const libelles = {
      suspend: t('verbSuspend'),
      unsuspend: t('verbUnsuspend'),
      close: t('verbClose'),
    };

    let reason = '';
    if (operation !== 'unsuspend') {
      reason = window.prompt(t('promptReason', { action: libelles[operation], name: org.name })) || '';
      if (!reason.trim()) return;
    } else if (!window.confirm(t('confirmReactivate', { name: org.name }))) {
      return;
    }

    setAction(org.id);
    setError('');

    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(
        `${API_URL}/api/superowner/organizations/${org.id}/${operation}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(reason ? { reason } : {}),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t('actionFailed', { action: libelles[operation] }));
        return;
      }

      await fetchOrganizations();
    } catch {
      setError(t('connectionError'));
    } finally {
      setAction('');
    }
  };

  useEffect(() => {
    fetchOrganizations();
  }, [offset]);

  const fetchOrganizations = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const query = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      });

      const res = await fetch(`${API_URL}/api/superowner/organizations?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error(t('loadError'));
      const data: OrganizationsResponse = await res.json();
      setOrganizations(data.organizations);
      setTotal(data.pagination?.total ?? data.organizations?.length ?? 0);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('genericError'));
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: { [key: string]: string } = {
      ACTIVE: 'bg-green-500/10 text-green-400 border-green-500/20',
      SUSPENDED: 'bg-red-500/10 text-red-400 border-red-500/20',
      CLOSED: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
    };
    return colors[status] || 'bg-gray-500/10 text-gray-400 border-gray-500/20';
  };

  const getStatusLabel = (status: string) => {
    const labels: { [key: string]: string } = {
      ACTIVE: t('statusActive'),
      SUSPENDED: t('statusSuspended'),
      CLOSED: t('statusClosed'),
    };
    return labels[status] || status;
  };

  const getTierColor = (tier: string) => {
    const colors: { [key: string]: string } = {
      FREE: 'bg-gray-600',
      PREMIUM: 'bg-blue-600',
      PRO: 'bg-purple-600',
    };
    return colors[tier] || 'bg-gray-600';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white flex items-center gap-2">
          <Building2 className="w-8 h-8" />
          {t('title')}
        </h1>
        <p className="text-gray-400 mt-2">{t('subtitle')}</p>
      </div>

      {error && (
        <div className="p-4 bg-red-900/20 text-red-400 rounded-lg border border-red-500/20">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : organizations.length === 0 ? (
        <div className="text-center py-12 bg-gray-800/50 rounded-lg border border-gray-700/50">
          <Building2 className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <p className="text-gray-400">{t('empty')}</p>
        </div>
      ) : (
        <div className="bg-gray-800/50 rounded-lg border border-gray-700/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-900/50 border-b border-gray-700/50">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">{t('colName')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">{t('colEmail')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">{t('colPlan')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">{t('colStatus')}</th>
                  <th className="px-6 py-3 text-center text-sm font-semibold text-gray-300">{t('colUsers')}</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-300">{t('colRevenue')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">{t('colDate')}</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-300">{t('colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {organizations.map((org) => (
                  <tr key={org.id} className="hover:bg-gray-700/20 transition">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-semibold text-white">{org.name}</p>
                        <p className="text-xs text-gray-500 mt-1">{org.id.slice(0, 8)}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-400">{org.email}</td>
                    <td className="px-6 py-4">
                      <select
                        value={org.tier}
                        onChange={(e) => changerFormule(org, e.target.value)}
                        disabled={action === org.id}
                        title={t('tierTitle')}
                        className={`px-3 py-1 rounded text-xs font-semibold text-white border-0 cursor-pointer disabled:opacity-40 ${getTierColor(
                          org.tier
                        )}`}
                      >
                        <option value="FREE">FREE</option>
                        <option value="PREMIUM">PREMIUM</option>
                        <option value="PRO">PRO</option>
                      </select>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(org.status)}`}>
                        {getStatusLabel(org.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Users size={16} className="text-blue-400" />
                        <span className="text-sm text-gray-400">{org.activeUsers}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className="font-bold text-green-400">{Number(org.revenue || 0).toLocaleString(locale === 'en' ? 'en-US' : 'fr-FR', { style: 'currency', currency: 'EUR' })}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(org.createdAt).toLocaleDateString(locale === 'en' ? 'en-US' : 'fr-FR')}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {/* La fiche détaillée n'était reliée à rien : on y
                            accédait uniquement en tapant l'adresse. */}
                        <Link
                          href={`/superowner/organizations/${org.id}`}
                          title={t('viewDetails')}
                          className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white transition"
                        >
                          <Eye size={16} />
                        </Link>
                        {org.status === 'ACTIVE' && (
                          <button
                            onClick={() => agirSurCommercant(org, 'suspend')}
                            disabled={action === org.id}
                            title={t('suspend')}
                            className="p-2 bg-orange-600/80 hover:bg-orange-600 disabled:opacity-40 rounded-lg text-white transition"
                          >
                            <Ban size={16} />
                          </button>
                        )}
                        {org.status === 'SUSPENDED' && (
                          <button
                            onClick={() => agirSurCommercant(org, 'unsuspend')}
                            disabled={action === org.id}
                            title={t('unsuspend')}
                            className="p-2 bg-green-600/80 hover:bg-green-600 disabled:opacity-40 rounded-lg text-white transition"
                          >
                            <CheckCircle size={16} />
                          </button>
                        )}
                        {org.status !== 'CLOSED' && (
                          <button
                            onClick={() => agirSurCommercant(org, 'close')}
                            disabled={action === org.id}
                            title={t('close')}
                            className="p-2 bg-red-600/80 hover:bg-red-600 disabled:opacity-40 rounded-lg text-white transition"
                          >
                            <XCircle size={16} />
                          </button>
                        )}
                        {org.status === 'CLOSED' && (
                          <span className="text-xs text-gray-500">{t('closedLabel')}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">
          {t('showingRange', { from: offset + 1, to: Math.min(offset + limit, total), total })}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 disabled:opacity-50 transition"
          >
            {t('previous')}
          </button>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={offset + limit >= total}
            className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 disabled:opacity-50 transition"
          >
            {t('next')}
          </button>
        </div>
      </div>
    </div>
  );
}
