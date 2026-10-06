'use client';

import { signalerErreur } from '@/lib/erreurs';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Trash2, Edit2, Power, Plus, X } from 'lucide-react';
import Link from 'next/link';

import { useCurrentStore } from '@/lib/current-store';
import { useTranslations } from 'next-intl';
import { euro } from '@/lib/format';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface PaymentMethod {
  id: string;
  type: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  commissionPercent: number;
  fixedFee: number;
  createdAt: string;
}

export default function PaymentMethodsPage() {
  const t = useTranslations('merchantpaymentmethods');
  const { storeId } = useCurrentStore();
  const params = useParams();
  const router = useRouter();
  const orgId = params?.orgId as string;

  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const itemsPerPage = 20;

  // Aucun moyen de paiement ne pouvait être ajouté ni modifié : la page ne
  // savait qu'activer, désactiver et supprimer.
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [enEdition, setEnEdition] = useState<PaymentMethod | null>(null);
  const [message, setMessage] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [formulaire, setFormulaire] = useState({
    type: 'CASH',
    name: '',
    commissionPercent: '0',
    fixedFee: '0',
    isDefault: false,
  });

  const ouvrirModale = (methode?: PaymentMethod) => {
    setEnEdition(methode || null);
    setFormulaire({
      type: methode?.type || 'CASH',
      name: methode?.name || '',
      commissionPercent: methode ? String(methode.commissionPercent ?? 0) : '0',
      fixedFee: methode ? String(methode.fixedFee ?? 0) : '0',
      isDefault: methode?.isDefault ?? false,
    });
    setMessage('');
    setModaleOuverte(true);
  };

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formulaire.name.trim().length < 2) {
      setMessage(t('msgNomCourt'));
      return;
    }

    setEnvoi(true);
    setMessage('');

    try {
      const token = localStorage.getItem('accessToken');
      const url = enEdition
        ? `${API_URL}/api/payment-methods/${storeId}/${enEdition.id}`
        : `${API_URL}/api/payment-methods/${storeId}`;

      // Le type n'est pas modifiable après création : il détermine
      // l'intégration utilisée.
      const corps = enEdition
        ? {
            name: formulaire.name.trim(),
            commissionPercent: Number(formulaire.commissionPercent),
            fixedFee: Number(formulaire.fixedFee),
            isDefault: formulaire.isDefault,
          }
        : {
            type: formulaire.type,
            name: formulaire.name.trim(),
            commissionPercent: Number(formulaire.commissionPercent),
            fixedFee: Number(formulaire.fixedFee),
            isDefault: formulaire.isDefault,
          };

      const response = await fetch(url, {
        method: enEdition ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(corps),
      });

      const donnees = await response.json();

      if (!response.ok) {
        setMessage(`❌ ${donnees.error || 'Enregistrement impossible'}`);
        return;
      }

      setModaleOuverte(false);
      fetchPaymentMethods();
    } catch {
      setMessage(t('msgConnexion'));
    } finally {
      setEnvoi(false);
    }
  };

  const fetchPaymentMethods = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
      if (!token) {
        router.push('/login');
        return;
      }

      const skip = page * itemsPerPage;
      const response = await fetch(
        `${API_URL}/api/payment-methods/${storeId}?skip=${skip}&take=${itemsPerPage}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!response.ok) throw new Error('Failed to fetch payment methods');

      const data = await response.json();
      setMethods(data.data || []);
      setTotal(data.total || 0);
    } catch (error) {
      signalerErreur('Error fetching payment methods:', error);
    } finally {
      setLoading(false);
    }
  }, [page, router, storeId]);

  useEffect(() => {
    if (storeId) fetchPaymentMethods();
  }, [storeId, page, fetchPaymentMethods]);

  const handleToggle = async (methodId: string) => {
    try {
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/payment-methods/${storeId}/${methodId}/toggle`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to toggle payment method');
      const data = await response.json();
      setMethods(methods.map(m => m.id === methodId ? data.method : m));
    } catch (error) {
      signalerErreur('Error toggling payment method:', error);
    }
  };

  const handleDelete = async (methodId: string) => {
    try {
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/payment-methods/${storeId}/${methodId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to delete payment method');
      setMethods(methods.filter(m => m.id !== methodId));
    } catch (error) {
      signalerErreur('Error deleting payment method:', error);
    }
  };

  const totalPages = Math.ceil(total / itemsPerPage);

  if (loading && methods.length === 0) {
    return (
      <div className="text-gray-900">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
            <p className="text-gray-500">{t('chargement')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="text-gray-900">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-bold">{t('titre')}</h1>
            <div className="flex items-center gap-4">
              <button
                onClick={() => ouvrirModale()}
                className="bg-orange-600 text-white hover:bg-orange-700 flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors"
              >
                <Plus size={18} /> {t('ajouterMethode')}
              </button>
              <Link href={`/merchant/${orgId}/dashboard`} className="text-gray-500 hover:text-gray-700 text-sm">
                {t('retour')}
              </Link>
            </div>
          </div>
          <p className="text-gray-500">{t('sousTitre')}</p>
        </div>

        <div className="space-y-4">
          {methods.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">
              {t('aucune')}
            </div>
          ) : (
            methods.map((method) => (
              <div key={method.id} className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-bold">{method.name}</h3>
                      {method.isDefault && (
                        <span className="px-2 py-1 bg-blue-50 text-blue-600 text-xs rounded">{t('parDefaut')}</span>
                      )}
                      <span className={`px-2 py-1 text-xs rounded ${
                        method.isActive
                          ? 'bg-green-50 text-green-600'
                          : 'bg-gray-600/20 text-gray-500'
                      }`}>
                        {method.isActive ? t('active') : t('inactif')}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mb-3">{t.has(`types.${method.type}`) ? t(`types.${method.type}`) : method.type}</p>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500">{t('commission')}</p>
                        <p className="font-bold text-blue-600">{Number(method.commissionPercent).toFixed(2)}%</p>
                      </div>
                      <div>
                        <p className="text-gray-500">{t('fraisFixes')}</p>
                        <p className="font-bold text-green-600">{euro(Number(method.fixedFee))}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleToggle(method.id)}
                      className={`p-2 rounded transition ${
                        method.isActive
                          ? 'bg-green-50 hover:bg-green-100 text-green-600'
                          : 'bg-gray-600/20 hover:bg-gray-600/30 text-gray-500'
                      }`}
                      title={method.isActive ? t('desactiver') : t('activer')}
                    >
                      <Power size={18} />
                    </button>
                    <button
                      onClick={() => ouvrirModale(method)}
                      title={t('modifierMethode')}
                      className="p-2 hover:bg-gray-200 rounded transition text-blue-600"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(method.id)}
                      className="p-2 hover:bg-gray-200 rounded transition text-red-600"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-8 px-6 py-4 bg-white border border-gray-200 rounded-lg">
            <p className="text-sm text-gray-500">{t('pageSur', { page: page + 1, total: totalPages })}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 rounded text-sm"
              >
                {t('precedent')}
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page === totalPages - 1}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 rounded text-sm"
              >
                {t('suivant')}
              </button>
            </div>
          </div>
        )}

        {modaleOuverte && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <form
              onSubmit={enregistrer}
              className="bg-white border border-gray-200 rounded-lg p-6 w-full max-w-md space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">
                  {enEdition ? t('modifier') : t('nouvelle')}
                </h2>
                <button
                  type="button"
                  onClick={() => setModaleOuverte(false)}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <X size={20} />
                </button>
              </div>

              {message && <div className="bg-gray-100 rounded-lg p-3 text-sm">{message}</div>}

              {!enEdition && (
                <div>
                  <label className="block text-sm text-gray-500 mb-1">{t('type')}</label>
                  <select
                    value={formulaire.type}
                    onChange={(e) => setFormulaire({ ...formulaire, type: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-red-500"
                  >
                    <option value="CASH">{t('especes')}</option>
                    <option value="CREDIT_CARD">{t('carteCredit')}</option>
                    <option value="DEBIT_CARD">{t('carteDebit')}</option>
                    <option value="STRIPE">Stripe</option>
                    <option value="PAYPAL">PayPal</option>
                    <option value="BANK_TRANSFER">{t('virement')}</option>
                    <option value="APPLE_PAY">Apple Pay</option>
                    <option value="GOOGLE_PAY">Google Pay</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm text-gray-500 mb-1">{t('nomAffiche')}</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  value={formulaire.name}
                  onChange={(e) => setFormulaire({ ...formulaire, name: e.target.value })}
                  placeholder={t('exempleNom')}
                  className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">{t('commissionPourcent')}</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formulaire.commissionPercent}
                    onChange={(e) =>
                      setFormulaire({ ...formulaire, commissionPercent: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-red-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">{t('fraisFixesEuros')}</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formulaire.fixedFee}
                    onChange={(e) => setFormulaire({ ...formulaire, fixedFee: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formulaire.isDefault}
                  onChange={(e) => setFormulaire({ ...formulaire, isDefault: e.target.checked })}
                  className="w-4 h-4 accent-red-500"
                />
                <span className="text-sm">{t('parDefautCase')}</span>
              </label>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={envoi}
                  className="bg-orange-600 text-white hover:bg-orange-700 flex-1 px-4 py-2 disabled:opacity-40 rounded-lg font-medium transition-colors"
                >
                  {envoi ? t('saving') : t('save')}
                </button>
                <button
                  type="button"
                  onClick={() => setModaleOuverte(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  {t('annuler')}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
