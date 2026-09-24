'use client';

import { useTranslations } from 'next-intl';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, AlertCircle, Clock, Archive, XCircle } from 'lucide-react';
import Link from 'next/link';

import { DossierCommercant } from '@/components/DossierCommercant';
import { useDonneesModifiees } from '@/lib/temps-reel';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface MerchantDetail {
  id: string;
  name: string;
  slug: string;
  tier: string;
  status: string;
  suspensionReason?: string;
  suspensionDate?: string;
  closureReason?: string;
  closureDate?: string;
  closedUntil?: string;
  archiveBackupId?: string;
  isArchivedPermanently?: boolean;
  stores: any[];
  memberships: any[];
  tickets: any[];
  commissionHistory: any[];
  stats: {
    totalRevenue: number;
    commission: number;
    ordersCount: number;
  };
}

export default function MerchantDetailPage() {
  const t = useTranslations('superownerOrganizationDetail');
  const router = useRouter();
  const params = useParams();
  // Le segment s'appelle [orgId] depuis le regroupement des espaces
  // d'administration ; lire params.id donnait « undefined » dans l'URL
  // appelée.
  const merchantId = params.orgId as string;

  const [merchant, setMerchant] = useState<MerchantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [newTier, setNewTier] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionReason, setActionReason] = useState('');
  const [showActionModal, setShowActionModal] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  // Le backend renvoie { error, code } : sans ce mapping le message réel est perdu.
  const ensureOk = async (response: Response, fallback: string) => {
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error || data?.message || fallback);
    }
  };

  useEffect(() => {
    fetchMerchant();
  }, [merchantId]);

  // Sa formule, son statut, ses boutiques, ses commandes : la fiche suit.
  useDonneesModifiees(
    ['organizations', 'merchant-profile', 'stores', 'orders', 'tickets'],
    () => fetchMerchant(true),
    { orgId: merchantId, delaiMs: 1000 }
  );

  // silencieux : une relecture en direct ne touche pas à la formule en cours
  // de choix, et un échec passager ne renvoie pas à la liste.
  const fetchMerchant = async (silencieux = false) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/admin/merchants/${merchantId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // « Failed to fetch » était annoncé pour un simple 404 : le message
      // faisait croire à une panne réseau. ensureOk remonte la vraie raison.
      await ensureOk(response, t('merchantNotFound'));

      const data = await response.json();
      setMerchant(data);
      if (!silencieux) setNewTier(data.tier);
    } catch (error) {
      // Un commerçant qui n'existe pas n'est pas un incident : on ramène à la
      // liste sans encombrer la console.
      if (silencieux) return;
      router.push('/superowner/organizations');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!merchant) return;
    setSaving(true);

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/admin/merchants/${merchantId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tier: newTier }),
      });

      await ensureOk(response, t('updateFailed'));

      fetchMerchant();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t('actionFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleSuspend = async () => {
    if (!merchant || !actionReason) return;
    setSaving(true);

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/admin/merchants/${merchantId}/suspend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: actionReason }),
      });

      await ensureOk(response, t('suspensionFailed'));

      setActionReason('');
      setShowActionModal(null);
      fetchMerchant();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t('actionFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleUnsuspend = async () => {
    if (!merchant) return;
    setSaving(true);

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/admin/merchants/${merchantId}/unsuspend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      await ensureOk(response, t('reactivationFailed'));

      setShowActionModal(null);
      fetchMerchant();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t('actionFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleClose = async () => {
    if (!merchant || !actionReason) return;
    setSaving(true);

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/admin/merchants/${merchantId}/close`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: actionReason }),
      });

      await ensureOk(response, t('closureFailed'));

      setActionReason('');
      setShowActionModal(null);
      fetchMerchant();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t('actionFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async () => {
    if (!merchant) return;
    setSaving(true);

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/admin/merchants/${merchantId}/restore-from-backup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      await ensureOk(response, t('restoreFailed'));

      setShowActionModal(null);
      fetchMerchant();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t('actionFailed'));
    } finally {
      setSaving(false);
    }
  };

  const getDaysUntilHardDelete = () => {
    if (!merchant?.closedUntil) return null;
    const now = new Date();
    const deadline = new Date(merchant.closedUntil);
    const days = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, days);
  };

  if (loading) return <div className="text-center py-8">Chargement...</div>;
  if (!merchant) return <div className="text-center py-8 text-red-400">Commerçant non trouvé</div>;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/superowner/organizations" className="p-2 hover:bg-gray-700 rounded-lg transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-3xl font-bold">{merchant.name}</h1>
          <p className="text-gray-400 mt-1">{merchant.slug}</p>
        </div>
      </div>

      {actionError && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-400">
          {actionError}
        </div>
      )}

      {/* Status Alert & Timeline */}
      {merchant.status !== 'ACTIVE' && (
        <div className={`${
          merchant.status === 'SUSPENDED' ? 'bg-yellow-500/20 border-yellow-500/50' : 'bg-red-500/20 border-red-500/50'
        } border rounded-lg p-4 space-y-3`}>
          <div className="flex items-center gap-3">
            <AlertCircle size={20} className={merchant.status === 'SUSPENDED' ? 'text-yellow-400' : 'text-red-400'} />
            <span className={merchant.status === 'SUSPENDED' ? 'text-yellow-400' : 'text-red-400'}>
              Statut: {merchant.status}
            </span>
          </div>

          {merchant.status === 'SUSPENDED' && merchant.suspensionReason && (
            <div className="text-sm text-gray-300 ml-8">
              <p className="font-medium mb-1">Raison:</p>
              <p>{merchant.suspensionReason}</p>
              {merchant.suspensionDate && (
                <p className="text-gray-400 mt-1">Depuis le {new Date(merchant.suspensionDate).toLocaleDateString('fr-FR')}</p>
              )}
            </div>
          )}

          {merchant.status === 'CLOSED' && merchant.closureReason && (
            <div className="text-sm text-gray-300 ml-8 space-y-2">
              <p className="font-medium">Raison de fermeture:</p>
              <p>{merchant.closureReason}</p>
              {merchant.closureDate && (
                <p className="text-gray-400">Fermé le {new Date(merchant.closureDate).toLocaleDateString('fr-FR')}</p>
              )}

              {/* Timeline */}
              <div className="mt-4 space-y-2 pt-2 border-t border-gray-700">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-gray-400" />
                  <span className="text-sm">
                    {getDaysUntilHardDelete()}j avant suppression permanente
                  </span>
                </div>

                {merchant.closedUntil && (
                  <p className="text-sm text-gray-400">
                    Suppression prévue le {new Date(merchant.closedUntil).toLocaleDateString('fr-FR')}
                  </p>
                )}

                {!merchant.isArchivedPermanently && merchant.archiveBackupId && (
                  <p className="text-sm text-green-400 flex items-center gap-2">
                    <Archive size={16} />
                    Backup disponible pour restauration
                  </p>
                )}

                {merchant.isArchivedPermanently && (
                  <p className="text-sm text-red-400 flex items-center gap-2">
                    <XCircle size={16} />
                    Données définitivement supprimées
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Le dossier : ce que la plateforme sait du commerçant, et les pièces
          qu'il a déposées — sans quoi elles resteraient en attente à jamais. */}
      <DossierCommercant orgId={merchantId} />

      {/* Quick Actions */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-bold">Actions rapides</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {merchant.status === 'ACTIVE' && (
            <>
              <button
                onClick={() => setShowActionModal('suspend')}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg transition-colors font-medium text-sm"
              >
                Suspendre
              </button>
              <button
                onClick={() => setShowActionModal('close')}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors font-medium text-sm"
              >
                Fermer le compte
              </button>
            </>
          )}

          {merchant.status === 'SUSPENDED' && (
            <button
              onClick={handleUnsuspend}
              disabled={saving}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg transition-colors font-medium text-sm col-span-2"
            >
              {saving ? 'Réactivation...' : t('reactivate')}
            </button>
          )}

          {merchant.status === 'CLOSED' && !merchant.isArchivedPermanently && (
            <button
              onClick={() => setShowActionModal('restore')}
              disabled={saving}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg transition-colors font-medium text-sm col-span-2"
            >
              {saving ? 'Restauration...' : t('restoreFromBackup')}
            </button>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-bold">Gestion générale</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Plan</label>
            <select
              value={newTier}
              onChange={(e) => setNewTier(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
            >
              <option value="FREE">FREE</option>
              <option value="PREMIUM">PREMIUM</option>
              <option value="PRO">PRO</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={handleUpdate}
              disabled={saving}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors font-medium"
            >
              {saving ? t('saving') : t('update')}
            </button>
          </div>
        </div>
      </div>

      {/* Action Modal */}
      {showActionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 max-w-md w-full space-y-4">
            <h3 className="text-xl font-bold">
              {showActionModal === 'suspend' && t('suspendAccount')}
              {showActionModal === 'close' && t('closeAccountModal')}
              {showActionModal === 'restore' && t('restoreAccount')}
            </h3>

            {showActionModal === 'restore' ? (
              <p className="text-gray-300">
                Êtes-vous sûr de vouloir restaurer ce compte ? Les données supprimées seront restaurées et le statut passera à ACTIVE.
              </p>
            ) : (
              <>
                <p className="text-gray-300 text-sm">
                  {showActionModal === 'suspend' && 'Le commerçant ne pourra plus accéder à son compte'}
                  {showActionModal === 'close' && 'Les données seront sauvegardées et progressivement supprimées'}
                </p>
                <textarea
                  placeholder="Raison..."
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 resize-none"
                  rows={3}
                />
              </>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowActionModal(null);
                  setActionReason('');
                  setActionError('');
                }}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors font-medium"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  if (showActionModal === 'suspend') handleSuspend();
                  else if (showActionModal === 'close') handleClose();
                  else if (showActionModal === 'restore') handleRestore();
                }}
                disabled={saving || (showActionModal !== 'restore' && !actionReason)}
                className={`flex-1 px-4 py-2 rounded-lg transition-colors font-medium ${
                  showActionModal === 'suspend' ? 'bg-yellow-600 hover:bg-yellow-700' :
                  showActionModal === 'close' ? 'bg-red-600 hover:bg-red-700' :
                  'bg-green-600 hover:bg-green-700'
                } disabled:opacity-50`}
              >
                {saving ? 'Traitement...' : t('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <p className="text-gray-400 text-sm mb-2">Chiffre d'affaires</p>
          <p className="text-3xl font-bold">{merchant.stats.totalRevenue.toFixed(2)} €</p>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <p className="text-gray-400 text-sm mb-2">Commission</p>
          <p className="text-3xl font-bold text-green-400">{merchant.stats.commission.toFixed(2)} €</p>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <p className="text-gray-400 text-sm mb-2">Commandes</p>
          <p className="text-3xl font-bold">{merchant.stats.ordersCount}</p>
        </div>
      </div>

      {/* Stores */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <h2 className="text-lg font-bold mb-4">Boutiques ({merchant.stores.length})</h2>
        {merchant.stores.length > 0 ? (
          <div className="space-y-2">
            {merchant.stores.map((store) => (
              <div key={store.id} className="p-3 bg-gray-700 rounded-lg flex justify-between items-center">
                <div>
                  <p className="font-medium">{store.name}</p>
                  <p className="text-sm text-gray-400">{store.id}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400">Aucune boutique</p>
        )}
      </div>

      {/* Team Members */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <h2 className="text-lg font-bold mb-4">Équipe ({merchant.memberships.length})</h2>
        {merchant.memberships.length > 0 ? (
          <div className="space-y-2">
            {merchant.memberships.map((member) => (
              <div key={member.id} className="p-3 bg-gray-700 rounded-lg flex justify-between items-center">
                <div>
                  <p className="font-medium">{member.user.email}</p>
                  <p className="text-sm text-gray-400">{member.role}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400">Aucun membre</p>
        )}
      </div>

      {/* Recent Tickets */}
      {merchant.tickets.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <h2 className="text-lg font-bold mb-4">Tickets récents</h2>
          <div className="space-y-2">
            {merchant.tickets.slice(0, 5).map((ticket) => (
              <div key={ticket.id} className="p-3 bg-gray-700 rounded-lg">
                <p className="font-medium">{ticket.title}</p>
                <div className="text-sm text-gray-400 mt-1 flex gap-2">
                  <span className="px-2 py-1 bg-gray-600 rounded">{ticket.status}</span>
                  <span className="px-2 py-1 bg-gray-600 rounded">{ticket.priority}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
