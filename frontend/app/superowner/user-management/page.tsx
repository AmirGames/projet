'use client';

import { useState, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Users, Plus, Trash2 } from 'lucide-react';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type Role = 'SUPER_ADMIN' | 'ADMIN' | 'SUPPORT';

interface Plateforme {
  code: string;
  label: string;
}

interface Admin {
  id: string;
  email: string;
  name: string;
  /** SUPEROWNER, ou le rôle sur ZupEat. */
  role: 'SUPEROWNER' | Role | null;
  /** Les rôles du membre, plateforme par plateforme. */
  acces: { plateforme: string; role: Role }[];
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  lastLogin: string;
  createdAt: string;
}

interface AdminsResponse {
  admins: Admin[];
  plateformes: Plateforme[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

export default function UserManagementPage() {
  const t = useTranslations('superownerUserManagement');
  const locale = useLocale();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [plateformes, setPlateformes] = useState<Plateforme[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ email: '', name: '', role: 'ADMIN', plateforme: 'EAT' });
  const limit = 20;

  const fetchAdmins = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const query = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      });

      const res = await fetch(`${API_URL}/api/superowner/admins?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error(t('loadError'));
      const data: AdminsResponse = await res.json();
      setAdmins(data.admins);
      setPlateformes(data.plateformes);
      setTotal(data.pagination.total);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('genericError'));
    } finally {
      setLoading(false);
    }
  }, [offset, t]);

  useEffectChargement(() => {
    fetchAdmins();
  }, [offset, fetchAdmins]);

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.email.trim() || !formData.name.trim()) {
      setError(t('emailNameRequired'));
      return;
    }

    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${API_URL}/api/superowner/admins`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || t('createError'));
      }
      setFormData({ email: '', name: '', role: 'ADMIN', plateforme: 'EAT' });
      setShowForm(false);
      fetchAdmins();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('genericError'));
    }
  };

  const handleDeleteAdmin = async (adminId: string) => {
    if (!confirm(t('deleteConfirm'))) return;

    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${API_URL}/api/superowner/admins/${adminId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || t('deleteError'));
      }
      setAdmins(admins.filter(a => a.id !== adminId));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('genericError'));
    }
  };

  // Un rôle vide retire l'accès à la plateforme ; le membre garde les autres.
  const handleChangeRole = async (adminId: string, plateforme: Plateforme, role: string) => {
    if (!role && !confirm(t('revokePlatformConfirm', { plateforme: plateforme.label }))) return;
    try {
      const token = localStorage.getItem('accessToken');
      const res = role
        ? await fetch(`${API_URL}/api/superowner/admins/${adminId}/role`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ role, plateforme: plateforme.code }),
          })
        : await fetch(`${API_URL}/api/superowner/admins/${adminId}/acces/${plateforme.code}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || data.error?.message || t('roleChangeError'));
      }
      setAdmins((liste) =>
        liste.map((a) => {
          if (a.id !== adminId) return a;
          const autres = a.acces.filter((x) => x.plateforme !== plateforme.code);
          return { ...a, acces: role ? [...autres, { plateforme: plateforme.code, role: role as Role }] : autres };
        })
      );
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('genericError'));
    }
  };

  const getRoleColor = (role: string) => {
    const colors: { [key: string]: string } = {
      SUPEROWNER: 'bg-red-600',
      ADMIN: 'bg-blue-600',
      SUPER_ADMIN: 'bg-orange-600',
      SUPPORT: 'bg-purple-600',
    };
    return colors[role] || 'bg-gray-600';
  };

  const getStatusColor = (status: string) => {
    const colors: { [key: string]: string } = {
      ACTIVE: 'text-green-400',
      INACTIVE: 'text-gray-400',
      SUSPENDED: 'text-red-400',
    };
    return colors[status] || 'text-gray-400';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            <Users className="w-8 h-8" />
            {t('title')}
          </h1>
          <p className="text-gray-400 mt-2">{t('subtitle')}</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
        >
          <Plus size={20} />
          {t('addAdmin')}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-900/20 text-red-400 rounded-lg border border-red-500/20">
          {error}
        </div>
      )}

      {showForm && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4">{t('newAdminTitle')}</h2>
          <form onSubmit={handleAddAdmin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">{t('email')}</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                placeholder="admin@example.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">{t('name')}</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                placeholder={t('namePlaceholder')}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">{t('role')}</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
              >
                <option value="SUPER_ADMIN">{t('roleSuperAdmin')}</option>
                <option value="ADMIN">{t('roleAdmin')}</option>
                <option value="SUPPORT">{t('roleSupport')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">{t('platform')}</label>
              <select
                value={formData.plateforme}
                onChange={(e) => setFormData({ ...formData, plateforme: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
              >
                {plateformes.map((p) => (
                  <option key={p.code} value={p.code}>{p.label}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">{t('platformHint')}</p>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded">
                {t('create')}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded"
              >
                {t('cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : admins.length === 0 ? (
        <div className="text-center py-12 bg-gray-800/50 rounded-lg">
          <Users className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <p className="text-gray-400">{t('empty')}</p>
        </div>
      ) : (
        <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-700/50 border-b border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold">{t('colEmail')}</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">{t('colName')}</th>
                {plateformes.map((p) => (
                  <th key={p.code} className="px-6 py-3 text-left text-sm font-semibold">{p.label}</th>
                ))}
                <th className="px-6 py-3 text-left text-sm font-semibold">{t('colStatus')}</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">{t('colLastLogin')}</th>
                <th className="px-6 py-3 text-right text-sm font-semibold">{t('colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {admins.map((admin) => (
                <tr key={admin.id} className="hover:bg-gray-700/50 transition">
                  <td className="px-6 py-4 text-sm">{admin.email}</td>
                  <td className="px-6 py-4 text-sm">{admin.name}</td>
                  {plateformes.map((p) => {
                    const role = admin.acces.find((a) => a.plateforme === p.code)?.role ?? '';
                    return (
                      <td key={p.code} className="px-6 py-4 text-sm">
                        {admin.role === 'SUPEROWNER' ? (
                          <span className={`px-2 py-1 rounded text-xs font-semibold text-white ${getRoleColor('SUPEROWNER')}`}>
                            {t('roleSuperOwner')}
                          </span>
                        ) : (
                          <select
                            value={role}
                            onChange={(e) => handleChangeRole(admin.id, p, e.target.value)}
                            aria-label={`${t('colRole')} ${p.label}`}
                            className={`px-2 py-1 rounded text-xs font-semibold text-white border-0 ${getRoleColor(role)}`}
                          >
                            <option value="">{t('noAccess')}</option>
                            <option value="SUPER_ADMIN">{t('roleSuperAdmin')}</option>
                            <option value="ADMIN">{t('roleAdmin')}</option>
                            <option value="SUPPORT">{t('roleSupport')}</option>
                          </select>
                        )}
                      </td>
                    );
                  })}
                  <td className={`px-6 py-4 text-sm font-semibold ${getStatusColor(admin.status)}`}>
                    {admin.status}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-400">
                    {new Date(admin.lastLogin).toLocaleDateString(locale === 'en' ? 'en-US' : 'fr-FR')}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleDeleteAdmin(admin.id)}
                      className="p-2 text-red-400 hover:bg-red-900/20 rounded transition"
                      title={t('delete')}
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
            className="px-4 py-2 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 disabled:opacity-50"
          >
            {t('previous')}
          </button>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={offset + limit >= total}
            className="px-4 py-2 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 disabled:opacity-50"
          >
            {t('next')}
          </button>
        </div>
      </div>
    </div>
  );
}
