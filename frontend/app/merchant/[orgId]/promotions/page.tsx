'use client';

import { signalerErreur } from '@/lib/erreurs';
import { useState, useCallback } from 'react';
import { Plus, Edit2, Trash2, Search, ToggleLeft, ToggleRight, Zap } from 'lucide-react';
import { useCurrentStore } from '@/lib/current-store';
import { useLocale, useTranslations } from 'next-intl';
import { euro } from '@/lib/format';
import { useDonneesModifiees } from '@/lib/temps-reel';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Promotion {
  id: string;
  code: string;
  description?: string;
  type: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: number;
  applicableToAll: boolean;
  productIds: string[];
  categoryIds: string[];
  startDate?: string;
  endDate?: string;
  maxUses?: number;
  activeFromTime?: string | null;
  activeToTime?: string | null;
  activeDays?: number[];
  currentUses: number;
  status: string;
  createdAt: string;
}

export default function PromotionsPage() {
  const t = useTranslations('merchantpromotions');
  const locale = useLocale();

  const { storeId } = useCurrentStore();
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Promotion | null>(null);
  const [message, setMessage] = useState('');
  const [formData, setFormData] = useState({
    code: '',
    description: '',
    type: 'PERCENTAGE' as 'PERCENTAGE' | 'FIXED_AMOUNT',
    discountValue: '',
    applicableToAll: true,
    maxUses: '',
    startDate: '',
    endDate: '',
    activeFromTime: '',
    activeToTime: '',
    activeDays: [] as number[],
  });

  const fetchPromotions = useCallback(async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/promotions?storeId=${storeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setPromotions(data.promotions || []);
      }
    } catch (error) {
      signalerErreur('Error fetching promotions:', error);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  // Une promotion créée, suspendue ou utilisée (son compteur bouge) : la
  // liste suit.
  useDonneesModifiees(['promotions', 'orders'], () => fetchPromotions(), {
    storeId,
    delaiMs: 1000,
    actif: Boolean(storeId),
  });

  useEffectChargement(() => {
    if (storeId) {
      fetchPromotions();
    }
  }, [storeId, fetchPromotions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.code.trim()) {
      setMessage(t('msgCodeRequis'));
      return;
    }

    if (!formData.discountValue) {
      setMessage(t('msgValeurRequise'));
      return;
    }

    try {
      const token = localStorage.getItem('accessToken');

      const payload = {
        storeId,
        code: formData.code.toUpperCase(),
        description: formData.description,
        type: formData.type,
        discountValue: parseFloat(formData.discountValue),
        applicableToAll: formData.applicableToAll,
        maxUses: formData.maxUses ? parseInt(formData.maxUses) : undefined,
        startDate: formData.startDate ? new Date(formData.startDate).toISOString() : undefined,
        endDate: formData.endDate ? new Date(formData.endDate).toISOString() : undefined,
        activeFromTime: formData.activeFromTime || null,
        activeToTime:   formData.activeToTime   || null,
        activeDays:     formData.activeDays,
      };

      if (editingPromo) {
        const response = await fetch(`${API_URL}/api/promotions/${editingPromo.id}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          const updated = await response.json();
          setPromotions(prev => prev.map(p => p.id === editingPromo.id ? updated.promotion : p));
          setMessage(t('msgMisAJour'));
          resetForm();
          setTimeout(() => setMessage(''), 3000);
        } else {
          setMessage(t('msgErreurMaj'));
        }
      } else {
        const response = await fetch(`${API_URL}/api/promotions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          const created = await response.json();
          setPromotions(prev => [created.promotion, ...prev]);
          setMessage(t('msgCree'));
          resetForm();
          setTimeout(() => setMessage(''), 3000);
        } else {
          const error = await response.json();
          setMessage(`❌ ${error.error || error.message || t('createError')}`);
        }
      }
    } catch (error) {
      signalerErreur('Error saving promotion:', error);
      setMessage(t('msgErreurSauvegarde'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('confirmerSuppression'))) {
      return;
    }

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/promotions/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        setPromotions(prev => prev.filter(p => p.id !== id));
        setMessage(t('msgSupprime'));
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage(t('msgErreurSuppression'));
      }
    } catch (error) {
      signalerErreur('Error deleting promotion:', error);
      setMessage(t('msgErreurSuppression'));
    }
  };

  const handleToggleStatus = async (id: string) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/promotions/${id}/toggle`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const updated = await response.json();
        setPromotions(prev => prev.map(p => p.id === id ? updated.promotion : p));
      }
    } catch (error) {
      signalerErreur('Error toggling promotion:', error);
    }
  };

  const handleEdit = (promo: Promotion) => {
    setEditingPromo(promo);
    setFormData({
      code: promo.code,
      description: promo.description || '',
      type: promo.type,
      discountValue: promo.discountValue.toString(),
      applicableToAll: promo.applicableToAll,
      maxUses: promo.maxUses?.toString() || '',
      startDate: promo.startDate ? new Date(promo.startDate).toISOString().split('T')[0] : '',
      endDate: promo.endDate ? new Date(promo.endDate).toISOString().split('T')[0] : '',
      activeFromTime: promo.activeFromTime ?? '',
      activeToTime:   promo.activeToTime   ?? '',
      activeDays:     promo.activeDays     ?? [],
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingPromo(null);
    setFormData({
      code: '',
      description: '',
      type: 'PERCENTAGE',
      discountValue: '',
      applicableToAll: true,
      maxUses: '',
      startDate: '',
      endDate: '',
      activeFromTime: '',
      activeToTime: '',
      activeDays: [],
    });
  };

  const filteredPromotions = promotions.filter(p =>
    p.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isExpired = (promo: Promotion) => {
    if (!promo.endDate) return false;
    return new Date(promo.endDate) < new Date();
  };

  const isActive = (promo: Promotion) => {
    if (promo.status !== 'ACTIVE') return false;
    const now = new Date();
    if (promo.startDate && new Date(promo.startDate) > now) return false;
    if (promo.endDate && new Date(promo.endDate) < now) return false;
    return true;
  };

  // Dimanche d'abord, comme getDay() : `jours.<0-6>` des traductions.
  const JOURS = [0, 1, 2, 3, 4, 5, 6].map((j) => t(`jours.${j}`));

  const libellePlage = (promo: Promotion): string | null => {
    const h = promo.activeFromTime || promo.activeToTime
      ? `${promo.activeFromTime ?? '00:00'} – ${promo.activeToTime ?? '24:00'}`
      : null;
    const j = promo.activeDays && promo.activeDays.length > 0
      ? promo.activeDays.map(d => JOURS[d]).join(', ')
      : null;
    return h || j ? [h, j].filter(Boolean).join(' · ') : null;
  };

  const toggleJour = (j: number) => {
    setFormData(f => ({
      ...f,
      activeDays: f.activeDays.includes(j)
        ? f.activeDays.filter(d => d !== j)
        : [...f.activeDays, j].sort((a, b) => a - b),
    }));
  };

  if (loading) {
    return (
      <div className="flex h-screen">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
            <p className="text-gray-500">{t('chargement')}</p>
          </div>
        </div>
      </div>
    );
  }

  const activePromos = promotions.filter(isActive);
  const totalDiscount = promotions.reduce((acc, p) => acc + p.currentUses, 0);

  return (
    <div className="text-gray-900">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{t('titre')}</h1>
            <p className="text-gray-500 mt-1">{t('sousTitre')}</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="bg-orange-600 text-white hover:bg-orange-700 px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition-colors"
          >
            <Plus size={20} /> {t('ajouterCode')}
          </button>
        </div>

        {message && (
          <div className={`p-4 rounded-lg ${
            message.includes('✅')
              ? 'bg-green-50 border border-green-200 text-green-600'
              : 'bg-red-50 border border-red-200 text-red-600'
          }`}>
            {message}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-gray-500 text-sm">{t('totalCodes')}</p>
            <p className="text-3xl font-bold">{promotions.length}</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-600 text-sm">{t('codesActifs')}</p>
            <p className="text-3xl font-bold text-green-600">{activePromos.length}</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-blue-600 text-sm">{t('utilisationsTotales')}</p>
            <p className="text-3xl font-bold text-blue-600">{totalDiscount}</p>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex gap-3">
            <Search size={20} className="text-gray-500 mt-2" />
            <input
              type="text"
              placeholder={t('rechercher')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 bg-gray-100 border border-gray-300 rounded px-3 py-2 text-gray-900 focus:outline-none focus:border-red-500"
            />
          </div>
        </div>

        <div className="space-y-3">
          {filteredPromotions.length === 0 ? (
            <div className="text-center py-12 bg-white border border-gray-200 rounded-lg">
              <p className="text-gray-500">{t('aucun')}</p>
            </div>
          ) : (
            filteredPromotions.map(promo => (
              <div
                key={promo.id}
                className={`border rounded-lg p-4 transition-colors ${
                  isExpired(promo)
                    ? 'bg-gray-100 border-gray-300 opacity-70'
                    : isActive(promo)
                    ? 'bg-green-50 border-green-200 hover:border-green-600'
                    : 'bg-white border-gray-200 hover:border-red-600'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-lg font-mono font-bold">{promo.code}</h3>
                      {isActive(promo) && (
                        <Zap size={16} className="text-green-600" />
                      )}
                      {isExpired(promo) && (
                        <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded">
                          {t('expire')}
                        </span>
                      )}
                      <span className={`text-xs px-2 py-1 rounded ${
                        promo.status === 'ACTIVE'
                          ? 'bg-green-100 text-green-600'
                          : 'bg-gray-600/30 text-gray-500'
                      }`}>
                        {promo.status === 'ACTIVE' ? t('active') : t('inactif')}
                      </span>
                    </div>

                    {promo.description && (
                      <p className="text-sm text-gray-500 mb-2">{promo.description}</p>
                    )}

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <p className="text-gray-500">{t('reduction')}</p>
                        <p className="font-semibold">
                          {promo.type === 'PERCENTAGE'
                            ? `${promo.discountValue}%`
                            : euro(promo.discountValue)}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">{t('utilisations')}</p>
                        <p className="font-semibold">
                          {promo.currentUses}
                          {promo.maxUses ? `/${promo.maxUses}` : '/∞'}
                        </p>
                      </div>
                      {promo.startDate && (
                        <div>
                          <p className="text-gray-500">{t('debut')}</p>
                          <p className="font-semibold text-xs">
                            {new Date(promo.startDate).toLocaleDateString(locale)}
                          </p>
                        </div>
                      )}
                      {promo.endDate && (
                        <div>
                          <p className="text-gray-500">{t('fin')}</p>
                          <p className="font-semibold text-xs">
                            {new Date(promo.endDate).toLocaleDateString(locale)}
                          </p>
                        </div>
                      )}
                    </div>

                    {libellePlage(promo) && (
                      <div className="mt-2 text-xs text-orange-600 flex items-center gap-1">
                        🕐 {libellePlage(promo)}
                      </div>
                    )}

                    {!promo.applicableToAll && (
                      <div className="mt-1 text-xs text-yellow-600">
                        {t('limite')}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => handleToggleStatus(promo.id)}
                      className={`p-2 rounded transition-colors ${
                        promo.status === 'ACTIVE'
                          ? 'bg-green-600 text-white hover:bg-green-700'
                          : 'bg-gray-200 hover:bg-gray-100'
                      }`}
                      title={promo.status === 'ACTIVE' ? t('desactiver') : t('activer')}
                    >
                      {promo.status === 'ACTIVE' ? (
                        <ToggleRight size={16} />
                      ) : (
                        <ToggleLeft size={16} />
                      )}
                    </button>
                    <button
                      onClick={() => handleEdit(promo)}
                      className="bg-gray-100 text-gray-700 hover:bg-gray-200 p-2 rounded transition-colors"
                      title={t('edit')}
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(promo.id)}
                      className="bg-red-50 text-red-700 hover:bg-red-100 p-2 rounded transition-colors"
                      title={t('delete')}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-gray-200 rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="border-b border-gray-200 p-6 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-2xl font-bold">
                {editingPromo ? t('modifier') : t('ajouter')}
              </h2>
              <button
                onClick={resetForm}
                className="text-gray-500 hover:text-gray-900 text-2xl"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="text-sm text-gray-500 block mb-2">{t('code')}</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="w-full bg-gray-100 border border-gray-300 rounded px-3 py-2 text-gray-900 focus:outline-none focus:border-red-500 font-mono"
                  placeholder={t('exempleCode')}
                  disabled={!!editingPromo}
                  required
                />
              </div>

              <div>
                <label className="text-sm text-gray-500 block mb-2">{t('description')}</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-gray-100 border border-gray-300 rounded px-3 py-2 text-gray-900 focus:outline-none focus:border-red-500"
                  placeholder={t('descriptionPlaceholder')}
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-gray-500 block mb-2">{t('type')}</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                    className="w-full bg-gray-100 border border-gray-300 rounded px-3 py-2 text-gray-900 focus:outline-none focus:border-red-500"
                  >
                    <option value="PERCENTAGE">{t('typePourcentage')}</option>
                    <option value="FIXED_AMOUNT">{t('typeMontant')}</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-500 block mb-2">{t('valeur')}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.discountValue}
                    onChange={(e) => setFormData({ ...formData, discountValue: e.target.value })}
                    className="w-full bg-gray-100 border border-gray-300 rounded px-3 py-2 text-gray-900 focus:outline-none focus:border-red-500"
                    placeholder={formData.type === 'PERCENTAGE' ? '20' : '10.00'}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-500 block mb-2">{t('utilisationsMax')}</label>
                <input
                  type="number"
                  min="1"
                  value={formData.maxUses}
                  onChange={(e) => setFormData({ ...formData, maxUses: e.target.value })}
                  className="w-full bg-gray-100 border border-gray-300 rounded px-3 py-2 text-gray-900 focus:outline-none focus:border-red-500"
                  placeholder={t('illimite')}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-gray-500 block mb-2">{t('dateDebut')}</label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full bg-gray-100 border border-gray-300 rounded px-3 py-2 text-gray-900 focus:outline-none focus:border-red-500"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-500 block mb-2">{t('dateFin')}</label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full bg-gray-100 border border-gray-300 rounded px-3 py-2 text-gray-900 focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              {/* ── Plage horaire d'activation ─────────────────────────────── */}
              <div>
                <label className="text-sm text-gray-500 block mb-2">
                  {t('plage')}
                  <span className="ml-1 text-gray-500">{t('facultatif')}</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">{t('heureDe')}</label>
                    <input
                      type="time"
                      value={formData.activeFromTime}
                      onChange={(e) => setFormData({ ...formData, activeFromTime: e.target.value })}
                      className="w-full bg-gray-100 border border-gray-300 rounded px-3 py-2 text-gray-900 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">À</label>
                    <input
                      type="time"
                      value={formData.activeToTime}
                      onChange={(e) => setFormData({ ...formData, activeToTime: e.target.value })}
                      className="w-full bg-gray-100 border border-gray-300 rounded px-3 py-2 text-gray-900 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>
                {formData.activeFromTime && formData.activeToTime && (
                  <p className="mt-1 text-xs text-orange-600">
                    {t('valableEntre', { debut: formData.activeFromTime, fin: formData.activeToTime })}
                  </p>
                )}
              </div>

              {/* ── Jours de la semaine ──────────────────────────────────────── */}
              <div>
                <label className="text-sm text-gray-500 block mb-2">
                  {t('joursActifs')}
                  <span className="ml-1 text-gray-500">{t('tousSiAucun')}</span>
                </label>
                <div className="flex gap-1 flex-wrap">
                  {JOURS.map((nom, j) => (
                    <button
                      key={j}
                      type="button"
                      onClick={() => toggleJour(j)}
                      className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                        formData.activeDays.includes(j)
                          ? 'bg-orange-600 text-white'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {nom}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="applicableToAll"
                  checked={formData.applicableToAll}
                  onChange={(e) => setFormData({ ...formData, applicableToAll: e.target.checked })}
                  className="rounded"
                />
                <label htmlFor="applicableToAll" className="text-sm text-gray-500">
                  {t('tousProduits')}
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 rounded font-semibold transition-colors"
                >
                  {t('annuler')}
                </button>
                <button
                  type="submit"
                  className="bg-orange-600 text-white hover:bg-orange-700 flex-1 py-2 rounded font-semibold transition-colors"
                >
                  {editingPromo ? t('update') : t('create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
