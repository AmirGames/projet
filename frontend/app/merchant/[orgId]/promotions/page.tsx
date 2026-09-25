'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Edit2, Trash2, Search, ToggleLeft, ToggleRight, Zap } from 'lucide-react';
import { useCurrentStore } from '@/lib/current-store';
import { useTranslations } from 'next-intl';
import { useDonneesModifiees } from '@/lib/temps-reel';

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

  // Une promotion créée, suspendue ou utilisée (son compteur bouge) : la
  // liste suit.
  useDonneesModifiees(['promotions', 'orders'], () => fetchPromotions(), {
    storeId,
    delaiMs: 1000,
    actif: Boolean(storeId),
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
      console.error('Error fetching promotions:', error);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    if (storeId) {
      fetchPromotions();
    }
  }, [storeId, fetchPromotions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.code.trim()) {
      setMessage('❌ Le code promo est requis');
      return;
    }

    if (!formData.discountValue) {
      setMessage('❌ La valeur de réduction est requise');
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
          setMessage('✅ Code promo mis à jour');
          resetForm();
          setTimeout(() => setMessage(''), 3000);
        } else {
          setMessage('❌ Erreur lors de la mise à jour');
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
          setMessage('✅ Code promo créé');
          resetForm();
          setTimeout(() => setMessage(''), 3000);
        } else {
          const error = await response.json();
          setMessage(`❌ ${error.error || error.message || t('createError')}`);
        }
      }
    } catch (error) {
      console.error('Error saving promotion:', error);
      setMessage('❌ Erreur lors de la sauvegarde');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce code promo?')) {
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
        setMessage('✅ Code promo supprimé');
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('❌ Erreur lors de la suppression');
      }
    } catch (error) {
      console.error('Error deleting promotion:', error);
      setMessage('❌ Erreur lors de la suppression');
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
      console.error('Error toggling promotion:', error);
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

  const JOURS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

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
      <div className="flex h-screen bg-gray-900">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
            <p className="text-gray-400">Chargement des codes promo...</p>
          </div>
        </div>
      </div>
    );
  }

  const activePromos = promotions.filter(isActive);
  const totalDiscount = promotions.reduce((acc, p) => acc + p.currentUses, 0);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">🎟️ Codes Promo</h1>
            <p className="text-gray-400 mt-1">Gérez vos promotions et réductions</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition-colors"
          >
            <Plus size={20} /> Ajouter Code
          </button>
        </div>

        {message && (
          <div className={`p-4 rounded-lg ${
            message.includes('✅')
              ? 'bg-green-600/20 border border-green-600/50 text-green-400'
              : 'bg-red-600/20 border border-red-600/50 text-red-400'
          }`}>
            {message}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <p className="text-gray-400 text-sm">Total de codes</p>
            <p className="text-3xl font-bold">{promotions.length}</p>
          </div>
          <div className="bg-green-600/20 border border-green-600/50 rounded-lg p-4">
            <p className="text-green-400 text-sm">Codes actifs</p>
            <p className="text-3xl font-bold text-green-400">{activePromos.length}</p>
          </div>
          <div className="bg-blue-600/20 border border-blue-600/50 rounded-lg p-4">
            <p className="text-blue-400 text-sm">Utilisations totales</p>
            <p className="text-3xl font-bold text-blue-400">{totalDiscount}</p>
          </div>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <div className="flex gap-3">
            <Search size={20} className="text-gray-500 mt-2" />
            <input
              type="text"
              placeholder="Rechercher par code ou description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-red-500"
            />
          </div>
        </div>

        <div className="space-y-3">
          {filteredPromotions.length === 0 ? (
            <div className="text-center py-12 bg-gray-800 border border-gray-700 rounded-lg">
              <p className="text-gray-400">Aucun code promo trouvé</p>
            </div>
          ) : (
            filteredPromotions.map(promo => (
              <div
                key={promo.id}
                className={`border rounded-lg p-4 transition-colors ${
                  isExpired(promo)
                    ? 'bg-gray-700 border-gray-600 opacity-70'
                    : isActive(promo)
                    ? 'bg-green-600/10 border-green-600/50 hover:border-green-600'
                    : 'bg-gray-800 border-gray-700 hover:border-red-600'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-lg font-mono font-bold">{promo.code}</h3>
                      {isActive(promo) && (
                        <Zap size={16} className="text-green-400" />
                      )}
                      {isExpired(promo) && (
                        <span className="text-xs bg-red-600/30 text-red-400 px-2 py-1 rounded">
                          Expiré
                        </span>
                      )}
                      <span className={`text-xs px-2 py-1 rounded ${
                        promo.status === 'ACTIVE'
                          ? 'bg-green-600/30 text-green-400'
                          : 'bg-gray-600/30 text-gray-400'
                      }`}>
                        {promo.status === 'ACTIVE' ? t('active') : 'Inactif'}
                      </span>
                    </div>

                    {promo.description && (
                      <p className="text-sm text-gray-400 mb-2">{promo.description}</p>
                    )}

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <p className="text-gray-500">Réduction</p>
                        <p className="font-semibold">
                          {promo.type === 'PERCENTAGE'
                            ? `${promo.discountValue}%`
                            : `$${promo.discountValue.toFixed(2)}`}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Utilisations</p>
                        <p className="font-semibold">
                          {promo.currentUses}
                          {promo.maxUses ? `/${promo.maxUses}` : '/∞'}
                        </p>
                      </div>
                      {promo.startDate && (
                        <div>
                          <p className="text-gray-500">Début</p>
                          <p className="font-semibold text-xs">
                            {new Date(promo.startDate).toLocaleDateString('fr-FR')}
                          </p>
                        </div>
                      )}
                      {promo.endDate && (
                        <div>
                          <p className="text-gray-500">Fin</p>
                          <p className="font-semibold text-xs">
                            {new Date(promo.endDate).toLocaleDateString('fr-FR')}
                          </p>
                        </div>
                      )}
                    </div>

                    {libellePlage(promo) && (
                      <div className="mt-2 text-xs text-orange-400 flex items-center gap-1">
                        🕐 {libellePlage(promo)}
                      </div>
                    )}

                    {!promo.applicableToAll && (
                      <div className="mt-1 text-xs text-yellow-400">
                        ⚠️ Limité à certains produits/catégories
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => handleToggleStatus(promo.id)}
                      className={`p-2 rounded transition-colors ${
                        promo.status === 'ACTIVE'
                          ? 'bg-green-600 hover:bg-green-700'
                          : 'bg-gray-600 hover:bg-gray-700'
                      }`}
                      title={promo.status === 'ACTIVE' ? 'Désactiver' : 'Activer'}
                    >
                      {promo.status === 'ACTIVE' ? (
                        <ToggleRight size={16} />
                      ) : (
                        <ToggleLeft size={16} />
                      )}
                    </button>
                    <button
                      onClick={() => handleEdit(promo)}
                      className="p-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                      title={t('edit')}
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(promo.id)}
                      className="p-2 bg-red-600 hover:bg-red-700 rounded transition-colors"
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
          <div className="bg-gray-800 border border-gray-700 rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="border-b border-gray-700 p-6 flex items-center justify-between sticky top-0 bg-gray-800">
              <h2 className="text-2xl font-bold">
                {editingPromo ? 'Modifier Code Promo' : 'Ajouter Code Promo'}
              </h2>
              <button
                onClick={resetForm}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="text-sm text-gray-400 block mb-2">Code promo *</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-red-500 font-mono"
                  placeholder="EX: SAVE20"
                  disabled={!!editingPromo}
                  required
                />
              </div>

              <div>
                <label className="text-sm text-gray-400 block mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-red-500"
                  placeholder="Description du code..."
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-gray-400 block mb-2">Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-red-500"
                  >
                    <option value="PERCENTAGE">Pourcentage (%)</option>
                    <option value="FIXED_AMOUNT">Montant ($)</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-400 block mb-2">Valeur *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.discountValue}
                    onChange={(e) => setFormData({ ...formData, discountValue: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-red-500"
                    placeholder={formData.type === 'PERCENTAGE' ? '20' : '10.00'}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-400 block mb-2">Utilisations max</label>
                <input
                  type="number"
                  min="1"
                  value={formData.maxUses}
                  onChange={(e) => setFormData({ ...formData, maxUses: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-red-500"
                  placeholder="Laisser vide pour illimité"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-gray-400 block mb-2">Date début</label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-red-500"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 block mb-2">Date fin</label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              {/* ── Plage horaire d'activation ─────────────────────────────── */}
              <div>
                <label className="text-sm text-gray-400 block mb-2">
                  Plage horaire d&apos;activation
                  <span className="ml-1 text-gray-500">(facultatif)</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">De</label>
                    <input
                      type="time"
                      value={formData.activeFromTime}
                      onChange={(e) => setFormData({ ...formData, activeFromTime: e.target.value })}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">À</label>
                    <input
                      type="time"
                      value={formData.activeToTime}
                      onChange={(e) => setFormData({ ...formData, activeToTime: e.target.value })}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>
                {formData.activeFromTime && formData.activeToTime && (
                  <p className="mt-1 text-xs text-orange-400">
                    La promo ne sera valable qu&apos;entre {formData.activeFromTime} et {formData.activeToTime}.
                  </p>
                )}
              </div>

              {/* ── Jours de la semaine ──────────────────────────────────────── */}
              <div>
                <label className="text-sm text-gray-400 block mb-2">
                  Jours actifs
                  <span className="ml-1 text-gray-500">(tous si aucun coché)</span>
                </label>
                <div className="flex gap-1 flex-wrap">
                  {(['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'] as const).map((nom, j) => (
                    <button
                      key={j}
                      type="button"
                      onClick={() => toggleJour(j)}
                      className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                        formData.activeDays.includes(j)
                          ? 'bg-orange-600 text-white'
                          : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
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
                <label htmlFor="applicableToAll" className="text-sm text-gray-400">
                  S&apos;applique à tous les produits
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded font-semibold transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-red-600 hover:bg-red-700 rounded font-semibold transition-colors"
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
