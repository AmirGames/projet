'use client';

import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, Search, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCurrentStore } from '@/lib/current-store';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type StaffRole = 'MANAGER' | 'CASHIER' | 'KITCHEN' | 'DELIVERY' | 'SUPPORT';
type StaffStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

interface Staff {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: StaffRole;
  status: StaffStatus;
  createdAt: string;
}

const ROLE_COLORS: { [key in StaffRole]: string } = {
  MANAGER: 'bg-purple-600',
  CASHIER: 'bg-blue-600',
  KITCHEN: 'bg-orange-600',
  DELIVERY: 'bg-green-600',
  SUPPORT: 'bg-pink-600',
};

const ROLE_LABELS: { [key in StaffRole]: string } = {
  MANAGER: 'Gérant',
  CASHIER: 'Caissier',
  KITCHEN: 'Cuisine',
  DELIVERY: 'Livraison',
  SUPPORT: 'Support',
};

const STATUS_COLORS: { [key in StaffStatus]: string } = {
  ACTIVE: 'text-green-400',
  INACTIVE: 'text-slate-400',
  SUSPENDED: 'text-red-400',
};

export default function StaffPage() {
  const t = useTranslations('merchantStaff');
  const { storeId } = useCurrentStore();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'CASHIER' as StaffRole,
  });
  const [stats, setStats] = useState({ total: 0, active: 0 });
  const [formError, setFormError] = useState('');


  useEffect(() => {
    if (storeId) {
      fetchStaff();
    }
  }, [storeId]);


  const fetchStaff = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/staff?storeId=${storeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setStaff(data.staff || []);
        setStats({ total: data.total || 0, active: data.active || 0 });
      }
    } catch (error) {
      console.error('Error fetching staff:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveStaff = async () => {
    setFormError('');

    if (!formData.name.trim()) {
      setFormError(t('errorNameRequired'));
      return;
    }

    if (!formData.email.trim()) {
      setFormError(t('errorEmailRequired'));
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setFormError(t('errorEmailInvalid'));
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('accessToken');
      const payload = {
        storeId,
        ...formData,
      };

      const url = editingStaff
        ? `${API_URL}/api/staff/${editingStaff.id}`
        : `${API_URL}/api/staff`;

      const response = await fetch(url, {
        method: editingStaff ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        await fetchStaff();
        setShowForm(false);
        setEditingStaff(null);
        setFormData({ name: '', email: '', phone: '', role: 'CASHIER' });
      }
    } catch (error) {
      console.error('Error saving staff:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStaff = async (id: string) => {
    if (!confirm(t('confirmDelete'))) return;

    setSaving(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/staff/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        await fetchStaff();
      }
    } catch (error) {
      console.error('Error deleting staff:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: StaffStatus) => {
    const newStatus: StaffStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

    setSaving(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/staff/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        await fetchStaff();
      }
    } catch (error) {
      console.error('Error toggling status:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleEditStaff = (s: Staff) => {
    setEditingStaff(s);
    setFormData({
      name: s.name,
      email: s.email,
      phone: s.phone || '',
      role: s.role,
    });
    setFormError('');
    setShowForm(true);
  };

  const handleAddStaff = () => {
    setEditingStaff(null);
    setFormData({ name: '', email: '', phone: '', role: 'CASHIER' });
    setFormError('');
    setShowForm(true);
  };

  const filteredStaff = staff.filter(
    (s) =>
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <Users className="text-amber-500" />
              {t('title')}
            </h1>
            <p className="text-slate-400 mt-2">{t('description')}</p>
          </div>
          <button
            onClick={handleAddStaff}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition"
          >
            <Plus size={20} />
            {t('addMember')}
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <p className="text-slate-400 text-sm">{t('statsTotal')}</p>
            <p className="text-3xl font-bold text-white mt-1">{stats.total}</p>
          </div>
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <p className="text-slate-400 text-sm">{t('statsActive')}</p>
            <p className="text-3xl font-bold text-green-400 mt-1">{stats.active}</p>
          </div>
        </div>

        {/* Create/Edit Form */}
        {showForm && (
          <div className="bg-slate-800 rounded-lg p-6 mb-8 border border-slate-700">
            <h2 className="text-xl font-bold text-white mb-4">
              {editingStaff ? t('formEditMember') : t('formNewMember')}
            </h2>
            {formError && (
              <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 mb-4 text-red-200">
                {formError}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-slate-300 text-sm block mb-2">{t('fieldName')}</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t('placeholderName')}
                  className="w-full px-3 py-2 bg-slate-700 text-white rounded border border-slate-600 focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-slate-300 text-sm block mb-2">{t('fieldEmail')}</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder={t('placeholderEmail')}
                  className="w-full px-3 py-2 bg-slate-700 text-white rounded border border-slate-600 focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-slate-300 text-sm block mb-2">{t('fieldPhone')}</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder={t('placeholderPhone')}
                  className="w-full px-3 py-2 bg-slate-700 text-white rounded border border-slate-600 focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-slate-300 text-sm block mb-2">{t('fieldRole')}</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as StaffRole })}
                  className="w-full px-3 py-2 bg-slate-700 text-white rounded border border-slate-600 focus:border-amber-500 focus:outline-none"
                >
                  <option value="CASHIER">{t('roleCashier')}</option>
                  <option value="KITCHEN">{t('roleKitchen')}</option>
                  <option value="DELIVERY">{t('roleDelivery')}</option>
                  <option value="SUPPORT">{t('roleSupport')}</option>
                  <option value="MANAGER">{t('roleManager')}</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveStaff}
                disabled={saving}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition disabled:opacity-50"
              >
                {editingStaff ? t('buttonUpdate') : t('buttonCreate')}
              </button>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingStaff(null);
                  setFormData({ name: '', email: '', phone: '', role: 'CASHIER' });
                }}
                className="px-4 py-2 bg-slate-700 text-white rounded hover:bg-slate-600 transition"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-3 text-slate-400" size={20} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full pl-10 pr-4 py-2 bg-slate-800 text-white rounded-lg border border-slate-700 focus:border-amber-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Staff Table */}
        {filteredStaff.length > 0 ? (
          <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-700 border-b border-slate-600">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-white">{t('colName')}</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-white">{t('colEmail')}</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-white">{t('colPhone')}</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-white">{t('colRole')}</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-white">{t('colStatus')}</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-white">{t('colActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStaff.map((s, idx) => (
                    <tr key={s.id} className={idx % 2 === 0 ? 'bg-slate-800' : 'bg-slate-750'}>
                      <td className="px-6 py-4 text-sm text-white font-medium">{s.name}</td>
                      <td className="px-6 py-4 text-sm text-slate-300">{s.email}</td>
                      <td className="px-6 py-4 text-sm text-slate-300">{s.phone || '-'}</td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`px-3 py-1 rounded-full text-white text-xs font-medium ${ROLE_COLORS[s.role]}`}>
                          {ROLE_LABELS[s.role]}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`font-medium ${STATUS_COLORS[s.status]}`}>
                          {s.status === 'ACTIVE' ? `✓ ${t('statusActive')}` : s.status === 'INACTIVE' ? t('statusInactive') : t('statusSuspended')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-right flex gap-2 justify-end">
                        <button
                          onClick={() => handleToggleStatus(s.id, s.status)}
                          disabled={saving}
                          className={`px-3 py-1 rounded text-sm font-medium transition disabled:opacity-50 ${
                            s.status === 'ACTIVE'
                              ? 'bg-red-600 text-white hover:bg-red-700'
                              : 'bg-green-600 text-white hover:bg-green-700'
                          }`}
                        >
                          {s.status === 'ACTIVE' ? t('buttonDeactivate') : t('buttonActivate')}
                        </button>
                        <button
                          onClick={() => handleEditStaff(s)}
                          className="p-2 text-amber-400 hover:bg-slate-700 rounded transition"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDeleteStaff(s.id)}
                          disabled={saving}
                          className="p-2 text-red-400 hover:bg-slate-700 rounded transition disabled:opacity-50"
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="text-center py-16">
            <Users className="mx-auto text-slate-600 mb-4" size={48} />
            <p className="text-slate-400 text-lg">
              {staff.length === 0 ? t('emptyNoMembers') : t('emptyNoMatches')}
            </p>
            {staff.length === 0 && (
              <button
                onClick={handleAddStaff}
                className="mt-4 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition inline-flex items-center gap-2"
              >
                <Plus size={20} />
                {t('addFirstMember')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
