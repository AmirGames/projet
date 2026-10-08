'use client';


import { jetonAcces } from '@/lib/jeton-session';
import { signalerErreur } from '@/lib/erreurs';
import { useState, useCallback } from 'react';
import { Plus, Edit2, Trash2, Search, Users } from 'lucide-react';
import { useCurrentStore } from '@/lib/current-store';
import { useTranslations } from 'next-intl';
import { useEffectChargement } from '@/lib/use-effect-chargement';

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

// Le libellé de chaque rôle : `roles.<role>` des traductions.

const STATUS_COLORS: { [key in StaffStatus]: string } = {
  ACTIVE: 'text-green-600',
  INACTIVE: 'text-gray-500',
  SUSPENDED: 'text-red-600',
};

export default function StaffPage() {
  const t = useTranslations('merchantstaff');

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



  const fetchStaff = useCallback(async () => {
    try {
      const token = jetonAcces();
      const response = await fetch(`${API_URL}/api/staff?storeId=${storeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setStaff(data.staff || []);
        setStats({ total: data.total || 0, active: data.active || 0 });
      }
    } catch (error) {
      signalerErreur('Error fetching staff:', error);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffectChargement(() => {
    if (storeId) {
      fetchStaff();
    }
  }, [storeId, fetchStaff]);

  const handleSaveStaff = async () => {
    setFormError('');

    if (!formData.name.trim()) {
      setFormError(t('nomRequis'));
      return;
    }

    if (!formData.email.trim()) {
      setFormError(t('emailRequis'));
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setFormError('Email invalide');
      return;
    }

    setSaving(true);
    try {
      const token = jetonAcces();
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
      signalerErreur('Error saving staff:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStaff = async (id: string) => {
    if (!confirm(t('confirmerSuppression'))) return;

    setSaving(true);
    try {
      const token = jetonAcces();
      const response = await fetch(`${API_URL}/api/staff/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        await fetchStaff();
      }
    } catch (error) {
      signalerErreur('Error deleting staff:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: StaffStatus) => {
    const newStatus: StaffStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

    setSaving(true);
    try {
      const token = jetonAcces();
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
      signalerErreur('Error toggling status:', error);
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
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  return (
    <div className="text-gray-900">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Users className="text-amber-500" />
              {t('titre')}
            </h1>
            <p className="text-gray-500 mt-2">{t('sousTitre')}</p>
          </div>
          <button
            onClick={handleAddStaff}
            className="bg-orange-600 text-white hover:bg-orange-700 flex items-center gap-2 px-4 py-2 rounded-lg transition"
          >
            <Plus size={20} />
            {t('ajouterMembre')}
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-gray-500 text-sm">{t('totalMembres')}</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{stats.total}</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-gray-500 text-sm">{t('actifs')}</p>
            <p className="text-3xl font-bold text-green-600 mt-1">{stats.active}</p>
          </div>
        </div>

        {/* Create/Edit Form */}
        {showForm && (
          <div className="bg-white rounded-lg p-6 mb-8 border border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editingStaff ? t('modifierMembre') : t('nouveauMembre')}
            </h2>
            {formError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-800">
                {formError}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-gray-700 text-sm block mb-2">{t('nom')}</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t('exempleNom')}
                  className="w-full px-3 py-2 bg-gray-100 text-gray-900 rounded-sm border border-gray-300 focus:border-amber-500 focus:outline-hidden"
                />
              </div>
              <div>
                <label className="text-gray-700 text-sm block mb-2">{t('email')}</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder={t('exempleEmail')}
                  className="w-full px-3 py-2 bg-gray-100 text-gray-900 rounded-sm border border-gray-300 focus:border-amber-500 focus:outline-hidden"
                />
              </div>
              <div>
                <label className="text-gray-700 text-sm block mb-2">{t('telephone')}</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+33 6 XX XX XX XX"
                  className="w-full px-3 py-2 bg-gray-100 text-gray-900 rounded-sm border border-gray-300 focus:border-amber-500 focus:outline-hidden"
                />
              </div>
              <div>
                <label className="text-gray-700 text-sm block mb-2">{t('role')}</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as StaffRole })}
                  className="w-full px-3 py-2 bg-gray-100 text-gray-900 rounded-sm border border-gray-300 focus:border-amber-500 focus:outline-hidden"
                >
                  <option value="CASHIER">{t('caissier')}</option>
                  <option value="KITCHEN">{t('cuisine')}</option>
                  <option value="DELIVERY">{t('livraison')}</option>
                  <option value="SUPPORT">{t('support')}</option>
                  <option value="MANAGER">{t('gerant')}</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveStaff}
                disabled={saving}
                className="bg-orange-600 text-white hover:bg-orange-700 px-4 py-2 rounded-sm transition disabled:opacity-50"
              >
                {editingStaff ? t('mettreAJour') : t('create')}
              </button>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingStaff(null);
                  setFormData({ name: '', email: '', phone: '', role: 'CASHIER' });
                }}
                className="px-4 py-2 bg-gray-100 text-gray-900 rounded-sm hover:bg-gray-200 transition"
              >
                {t('annuler')}
              </button>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-3 text-gray-500" size={20} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('rechercher')}
              className="w-full pl-10 pr-4 py-2 bg-white text-gray-900 rounded-lg border border-gray-200 focus:border-amber-500 focus:outline-hidden"
            />
          </div>
        </div>

        {/* Staff Table */}
        {filteredStaff.length > 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100 border-b border-gray-300">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">{t('nom')}</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">{t('email')}</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">{t('telephone')}</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">{t('role')}</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">{t('statut')}</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStaff.map((s, idx) => (
                    <tr key={s.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-100'}>
                      <td className="px-6 py-4 text-sm text-gray-900 font-medium">{s.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{s.email}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{s.phone || '-'}</td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`px-3 py-1 rounded-full text-white text-xs font-medium ${ROLE_COLORS[s.role]}`}>
                          {t(`roles.${s.role}`)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`font-medium ${STATUS_COLORS[s.status]}`}>
                          {s.status === 'ACTIVE' ? t('statusActive') : s.status === 'INACTIVE' ? t('inactif') : t('statusSuspended')}
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
                          {s.status === 'ACTIVE' ? t('desactiver') : t('activer')}
                        </button>
                        <button
                          onClick={() => handleEditStaff(s)}
                          className="p-2 text-amber-600 hover:bg-gray-100 rounded-sm transition"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDeleteStaff(s.id)}
                          disabled={saving}
                          className="p-2 text-red-600 hover:bg-gray-100 rounded-sm transition disabled:opacity-50"
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
            <Users className="mx-auto text-gray-400 mb-4" size={48} />
            <p className="text-gray-500 text-lg">
              {staff.length === 0 ? t('aucunMembre') : t('empty')}
            </p>
            {staff.length === 0 && (
              <button
                onClick={handleAddStaff}
                className="bg-orange-600 text-white hover:bg-orange-700 mt-4 px-4 py-2 rounded-lg transition inline-flex items-center gap-2"
              >
                <Plus size={20} />
                {t('premier')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
