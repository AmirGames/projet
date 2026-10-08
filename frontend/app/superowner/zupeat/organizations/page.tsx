'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { Building2, Users, Ban, CheckCircle, XCircle, Eye, Gift, X, Handshake } from 'lucide-react';
import { useDonneesModifiees } from '@/lib/temps-reel';
import { useEffectChargement } from '@/lib/use-effect-chargement';

interface Organization {
  id: string;
  name: string;
  email: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
  tier: 'FREE' | 'PREMIUM' | 'PRO';
  createdAt: string;
  /** Vide tant que la plateforme n'a pas validé le commerce. */
  approvedAt: string | null;
  activeUsers: number;
  revenue: number;
  /** La promo « zéro commission » offerte par la plateforme. */
  commissionFree: {
    active: boolean;
    until: string | null;
    note: string | null;
    /** Réglée et pas encore expirée. */
    enCours: boolean;
  };
  /** Les conditions négociées à la main, qui remplacent celles de la formule. */
  customTerms: {
    actives: boolean;
    commission: number | null;
    commissionLivreursPlateforme: number | null;
    maxBoutiques: number | null;
    prixMensuel: number | null;
    note: string | null;
  };
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
  // Les dossiers à valider, ce que la plateforme cherche en premier.
  const [aValider, setAValider] = useState(false);
  const limit = 20;
  // Le commerçant dont on règle la promo « zéro commission ».
  const [promo, setPromo] = useState<{ org: Organization; until: string; note: string } | null>(null);

  // Le commerçant dont on règle les conditions négociées. Champs vides : la
  // formule s'applique.
  const [conditions, setConditions] = useState<{
    org: Organization;
    commission: string;
    commissionLivreurs: string;
    maxBoutiques: string;
    prixMensuel: string;
    note: string;
  } | null>(null);

  // silencieux : une relecture en direct garde la page affichée.
  const fetchOrganizations = useCallback(async (silencieux = false) => {
    if (!silencieux) setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const query = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
        ...(aValider ? { validation: 'attente' } : {}),
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
  }, [aValider, offset, t]);

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

  const ouvrirPromo = (org: Organization) => {
    setPromo({
      org,
      until: org.commissionFree.until ? org.commissionFree.until.slice(0, 10) : '',
      note: org.commissionFree.note || '',
    });
  };

  const ouvrirConditions = (org: Organization) => {
    const c = org.customTerms;
    setConditions({
      org,
      commission: c.commission?.toString() ?? '',
      commissionLivreurs: c.commissionLivreursPlateforme?.toString() ?? '',
      maxBoutiques: c.maxBoutiques?.toString() ?? '',
      prixMensuel: c.prixMensuel?.toString() ?? '',
      note: c.note ?? '',
    });
  };

  const enregistrerConditions = async (retirer = false) => {
    if (!conditions) return;
    // Champ vide = null = la formule s'applique.
    const nombre = (v: string) => (retirer || v.trim() === '' ? null : Number(v.replace(',', '.')));
    setAction(conditions.org.id);
    setError('');

    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(
        `${API_URL}/api/superowner/organizations/${conditions.org.id}/conditions`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            commission: nombre(conditions.commission),
            commissionLivreursPlateforme: nombre(conditions.commissionLivreurs),
            maxBoutiques: nombre(conditions.maxBoutiques),
            prixMensuel: nombre(conditions.prixMensuel),
            note: retirer ? null : conditions.note,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t('termsFailed'));
        return;
      }

      setConditions(null);
      await fetchOrganizations();
    } catch {
      setError(t('connectionError'));
    } finally {
      setAction('');
    }
  };

  const reglerPromo = async (active: boolean) => {
    if (!promo) return;
    setAction(promo.org.id);
    setError('');

    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(
        `${API_URL}/api/superowner/organizations/${promo.org.id}/commission-promo`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            active,
            until: active && promo.until ? promo.until : null,
            note: active ? promo.note : null,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t('promoFailed'));
        return;
      }

      setPromo(null);
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

  // Un commerce qui s'inscrit, dépose une pièce, est validé par un collègue :
  // la file suit.
  useDonneesModifiees(['organizations', 'merchant-profile', 'stores'], () => fetchOrganizations(true), {
    delaiMs: 1000,
  });

  useEffectChargement(() => {
    fetchOrganizations();
  }, [offset, aValider, fetchOrganizations]);

  const getStatusColor = (status: string) => {
    const colors: { [key: string]: string } = {
      ACTIVE: 'bg-green-100 text-green-600 border-green-500/20',
      SUSPENDED: 'bg-red-100 text-red-600 border-red-500/20',
      CLOSED: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
    };
    return colors[status] || 'bg-gray-500/10 text-gray-500 border-gray-500/20';
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
      FREE: 'bg-gray-200',
      PREMIUM: 'bg-sky-100',
      PRO: 'bg-purple-100',
    };
    return colors[tier] || 'bg-gray-200';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
          <Building2 className="w-8 h-8" />
          {t('title')}
        </h1>
        <p className="text-gray-500 mt-2">{t('subtitle')}</p>
      </div>

      <div className="flex gap-2">
        {[false, true].map((filtre) => (
          <button
            key={String(filtre)}
            type="button"
            onClick={() => {
              setOffset(0);
              setAValider(filtre);
            }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
              aValider === filtre
                ? 'bg-gray-900 border-gray-900 text-white'
                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100'
            }`}
          >
            {filtre ? t('filterPending') : t('filterAll')}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-lg border border-red-500/20">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : organizations.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200/50">
          <Building2 className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <p className="text-gray-500">{t('empty')}</p>
        </div>
      ) : (
        <div className="bg-gray-50 rounded-lg border border-gray-200/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200/50">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">{t('colName')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">{t('colEmail')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">{t('colPlan')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">{t('colStatus')}</th>
                  <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">{t('colUsers')}</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">{t('colRevenue')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">{t('colDate')}</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">{t('colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {organizations.map((org) => (
                  <tr key={org.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-semibold text-gray-900">{org.name}</p>
                        <p className="text-xs text-gray-500 mt-1">{org.id.slice(0, 8)}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{org.email}</td>
                    <td className="px-6 py-4">
                      <select
                        value={org.tier}
                        onChange={(e) => changerFormule(org, e.target.value)}
                        disabled={action === org.id}
                        title={t('tierTitle')}
                        className={`px-3 py-1 rounded text-xs font-semibold text-gray-900 border-0 cursor-pointer disabled:opacity-40 ${getTierColor(
                          org.tier
                        )}`}
                      >
                        <option value="FREE">FREE</option>
                        <option value="PREMIUM">PREMIUM</option>
                        <option value="PRO">PRO</option>
                      </select>
                      {org.customTerms?.actives && (
                        <span
                          title={org.customTerms.note || t('termsBadgeTitle')}
                          className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border bg-amber-100 text-amber-700 border-amber-500/30"
                        >
                          <Handshake size={12} />
                          {org.customTerms.commission !== null
                            ? t('termsBadgeRate', { rate: org.customTerms.commission })
                            : t('termsBadge')}
                        </span>
                      )}
                      {org.commissionFree.enCours && (
                        <span
                          title={org.commissionFree.note || t('promoBadgeTitle')}
                          className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border bg-pink-100 text-pink-700 border-pink-500/30"
                        >
                          <Gift size={12} />
                          {org.commissionFree.until
                            ? t('promoBadgeUntil', {
                                date: new Date(org.commissionFree.until).toLocaleDateString(
                                  locale === 'en' ? 'en-US' : 'fr-FR'
                                ),
                              })
                            : t('promoBadge')}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(org.status)}`}>
                        {getStatusLabel(org.status)}
                      </span>
                      {!org.approvedAt && (
                        <span
                          title={t('pendingApprovalTitle')}
                          className="ml-2 px-3 py-1 rounded-full text-xs font-semibold border bg-blue-100 text-blue-700 border-blue-500/30"
                        >
                          {t('pendingApproval')}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Users size={16} className="text-blue-600" />
                        <span className="text-sm text-gray-500">{org.activeUsers}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className="font-bold text-green-600">{Number(org.revenue || 0).toLocaleString(locale === 'en' ? 'en-US' : 'fr-FR', { style: 'currency', currency: 'EUR' })}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(org.createdAt).toLocaleDateString(locale === 'en' ? 'en-US' : 'fr-FR')}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {/* La fiche détaillée n'était reliée à rien : on y
                            accédait uniquement en tapant l'adresse. */}
                        <Link
                          href={`/superowner/zupeat/organizations/${org.id}`}
                          title={t('viewDetails')}
                          className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-900 transition"
                        >
                          <Eye size={16} />
                        </Link>
                        <button
                          onClick={() => ouvrirConditions(org)}
                          disabled={action === org.id}
                          title={t('termsButton')}
                          className={`p-2 rounded-lg text-gray-900 transition disabled:opacity-40 ${
                            org.customTerms?.actives
                              ? 'bg-amber-600/80 hover:bg-amber-600'
                              : 'bg-gray-100 hover:bg-gray-200'
                          }`}
                        >
                          <Handshake size={16} />
                        </button>
                        <button
                          onClick={() => ouvrirPromo(org)}
                          disabled={action === org.id}
                          title={t('promoButton')}
                          className={`p-2 rounded-lg text-gray-900 transition disabled:opacity-40 ${
                            org.commissionFree.enCours
                              ? 'bg-pink-600/80 hover:bg-pink-600'
                              : 'bg-gray-100 hover:bg-gray-200'
                          }`}
                        >
                          <Gift size={16} />
                        </button>
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
        <p className="text-sm text-gray-500">
          {t('showingRange', { from: offset + 1, to: Math.min(offset + limit, total), total })}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition"
          >
            {t('previous')}
          </button>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={offset + limit >= total}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition"
          >
            {t('next')}
          </button>
        </div>
      </div>

      {promo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md bg-white border border-gray-200 rounded-lg p-6 space-y-4">
            <div className="flex items-start justify-between">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Gift size={20} className="text-pink-600" />
                {t('promoTitle', { name: promo.org.name })}
              </h2>
              <button
                type="button"
                onClick={() => setPromo(null)}
                aria-label={t('promoCancel')}
                className="p-1 text-gray-500 hover:text-gray-900"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-sm text-gray-500">{t('promoHelp')}</p>

            <div>
              <label className="block text-sm text-gray-500 mb-1" htmlFor="promo-fin">
                {t('promoUntil')}
              </label>
              <input
                id="promo-fin"
                type="date"
                value={promo.until}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setPromo({ ...promo, until: e.target.value })}
                className="w-full bg-gray-100 border border-gray-300 rounded-sm px-3 py-2 text-gray-900 focus:outline-hidden focus:border-pink-500"
              />
              <p className="text-xs text-gray-500 mt-1">{t('promoUntilHelp')}</p>
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-1" htmlFor="promo-note">
                {t('promoNote')}
              </label>
              <input
                id="promo-note"
                value={promo.note}
                maxLength={200}
                placeholder={t('promoNotePlaceholder')}
                onChange={(e) => setPromo({ ...promo, note: e.target.value })}
                className="w-full bg-gray-100 border border-gray-300 rounded-sm px-3 py-2 text-gray-900 focus:outline-hidden focus:border-pink-500"
              />
            </div>

            <div className="flex gap-2 justify-end">
              {promo.org.commissionFree.enCours && (
                <button
                  type="button"
                  onClick={() => reglerPromo(false)}
                  disabled={action === promo.org.id}
                  className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-900 disabled:opacity-40 transition"
                >
                  {t('promoRemove')}
                </button>
              )}
              <button
                type="button"
                onClick={() => reglerPromo(true)}
                disabled={action === promo.org.id}
                className="px-4 py-2 rounded-lg bg-pink-600 hover:bg-pink-700 text-white font-semibold disabled:opacity-40 transition"
              >
                {promo.org.commissionFree.enCours ? t('promoUpdate') : t('promoGrant')}
              </button>
            </div>
          </div>
        </div>
      )}
      {conditions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-white border border-gray-200 rounded-lg p-6 space-y-4">
            <div className="flex items-start justify-between">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Handshake size={20} className="text-amber-600" />
                {t('termsTitle', { name: conditions.org.name })}
              </h2>
              <button
                type="button"
                onClick={() => setConditions(null)}
                aria-label={t('promoCancel')}
                className="p-1 text-gray-500 hover:text-gray-900"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-sm text-gray-500">{t('termsHelp')}</p>

            <div>
              <label className="block text-sm text-gray-500 mb-1" htmlFor="cond-commission">
                {t('termsCommission')}
              </label>
              <input
                id="cond-commission"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={conditions.commission}
                placeholder={t('termsPlaceholder')}
                onChange={(e) => setConditions({ ...conditions, commission: e.target.value })}
                className="w-full bg-gray-100 border border-gray-300 rounded-sm px-3 py-2 text-gray-900 focus:outline-hidden focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1" htmlFor="cond-livreurs">
                {t('termsPlatformDelivery')}
              </label>
              <input
                id="cond-livreurs"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={conditions.commissionLivreurs}
                placeholder={t('termsPlaceholder')}
                onChange={(e) => setConditions({ ...conditions, commissionLivreurs: e.target.value })}
                className="w-full bg-gray-100 border border-gray-300 rounded-sm px-3 py-2 text-gray-900 focus:outline-hidden focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1" htmlFor="cond-boutiques">
                {t('termsMaxStores')}
              </label>
              <input
                id="cond-boutiques"
                type="number"
                min="0"
                step="1"
                inputMode="decimal"
                value={conditions.maxBoutiques}
                placeholder={t('termsPlaceholder')}
                onChange={(e) => setConditions({ ...conditions, maxBoutiques: e.target.value })}
                className="w-full bg-gray-100 border border-gray-300 rounded-sm px-3 py-2 text-gray-900 focus:outline-hidden focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1" htmlFor="cond-prix">
                {t('termsPrice')}
              </label>
              <input
                id="cond-prix"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={conditions.prixMensuel}
                placeholder={t('termsPlaceholder')}
                onChange={(e) => setConditions({ ...conditions, prixMensuel: e.target.value })}
                className="w-full bg-gray-100 border border-gray-300 rounded-sm px-3 py-2 text-gray-900 focus:outline-hidden focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-1" htmlFor="cond-note">
                {t('termsNote')}
              </label>
              <input
                id="cond-note"
                value={conditions.note}
                maxLength={500}
                placeholder={t('termsNotePlaceholder')}
                onChange={(e) => setConditions({ ...conditions, note: e.target.value })}
                className="w-full bg-gray-100 border border-gray-300 rounded-sm px-3 py-2 text-gray-900 focus:outline-hidden focus:border-amber-500"
              />
            </div>

            <div className="flex gap-2 justify-end">
              {conditions.org.customTerms?.actives && (
                <button
                  type="button"
                  onClick={() => enregistrerConditions(true)}
                  disabled={action === conditions.org.id}
                  className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-900 disabled:opacity-40 transition"
                >
                  {t('termsRemove')}
                </button>
              )}
              <button
                type="button"
                onClick={() => enregistrerConditions()}
                disabled={action === conditions.org.id}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold disabled:opacity-40 transition"
              >
                {t('termsSave')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
