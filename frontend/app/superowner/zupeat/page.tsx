'use client';


import { jetonAcces } from '@/lib/jeton-session';
import { signalerErreur } from '@/lib/erreurs';
import { useState } from 'react';
import { useDonneesModifiees } from '@/lib/temps-reel';
import { useTranslations } from 'next-intl';
import { Users, DollarSign, AlertCircle, Server, Lock, ChevronRight } from 'lucide-react';

import { euro } from '@/lib/format';
import Link from 'next/link';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import { AccesPlateforme, chargerAcces } from '@/lib/acces-plateforme';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Chaque raccourci n'apparaît qu'aux rôles qui ont accès à sa section.
const RACCOURCIS = [
  { href: '/superowner/zupeat/organizations', section: 'organizations', icone: '🏢', libelle: 'quickOrganizations' },
  { href: '/superowner/zupeat/billing', section: 'billing', icone: '💳', libelle: 'quickBilling' },
  { href: '/superowner/system-config', section: 'system-config', icone: '⚙️', libelle: 'quickConfig' },
  { href: '/superowner/security-audit', section: 'security-audit', icone: '🔒', libelle: 'quickSecurityAudit' },
] as const;

interface DashboardStats {
  totalRevenue: number;
  platformFee: number;
  activeOrganizations: number;
  totalUsers: number;
  systemHealth: number;
  criticalAlerts: number;
  monthlyRecurring: number;
  growth: number;
}

/** Vert au-dessus de 90, orange au-dessus de 60, rouge en dessous. */
const teinteTexte = (score: number) =>
  score >= 90 ? 'text-green-600' : score >= 60 ? 'text-amber-600' : 'text-red-600';

const teinteFond = (score: number) =>
  score >= 90
    ? 'bg-green-50 text-green-600'
    : score >= 60
      ? 'bg-amber-50 text-amber-600'
      : 'bg-red-50 text-red-600';

export default function SuperOwnerDashboard() {
  const t = useTranslations('superownerDashboard');
  // Le rôle du compte : le titre, les raccourcis et le bandeau en dépendent.
  const [acces, setAcces] = useState<AccesPlateforme | null>(null);
  useEffectChargement(() => {
    chargerAcces().then(setAcces).catch(() => setAcces(null));
  }, []);
  const estSuperOwner = !!acces?.isSuperOwner;
  const nomDuRole = estSuperOwner ? 'SuperOwner' : acces?.roleLabel ?? '';
  const peutVoir = (section: string) => estSuperOwner || !!acces?.permissions[section];
  // Revenus, frais et MRR : réservés aux rôles qui ont « Facturation ». Le
  // serveur ne les envoie pas aux autres ; ici on retire les cartes vides.
  const finances = peutVoir('billing');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboardStats = async () => {
    try {
      const token = jetonAcces();
      const response = await fetch(`${API_URL}/api/superowner/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setStats(data.stats);
    } catch (error) {
      signalerErreur('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  // Les chiffres portent sur toute la plateforme : n'importe quelle écriture
  // peut les changer. Deux secondes suffisent pour qu'une rafale n'en
  // provoque qu'une relecture.
  useDonneesModifiees('*', () => fetchDashboardStats(), { delaiMs: 2000 });

  useEffectChargement(() => {
    fetchDashboardStats();
  }, []);

  if (loading) return <div className="text-center py-8">{t('loading')}</div>;

  return (
    <div className="space-y-6">
      <title>{t('ongletTitre')}</title>
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Lock size={32} className="text-red-600" />
          {nomDuRole ? t('titleRole', { role: nomDuRole }) : t('titleGeneric')}
        </h1>
        <p className="text-gray-500 mt-1">{estSuperOwner ? t('subtitle') : t('subtitleTeam')}</p>
      </div>

      {/* Critical Alerts */}
      {stats?.criticalAlerts ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle size={24} className="text-red-600 mt-1" />
            <div>
              <p className="font-bold text-red-600">{t('criticalAlerts', { count: stats.criticalAlerts })}</p>
              <p className="text-sm text-red-600/80">{t('criticalAlertsSubtitle')}</p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Key Metrics */}
      <div className={`grid grid-cols-1 gap-4 ${finances ? 'md:grid-cols-4' : 'md:grid-cols-2'}`}>
        {finances && (
          <>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-lg bg-green-50 text-green-600">
              <DollarSign size={24} />
            </div>
            {stats?.growth ? (
              <span className={`text-sm font-bold ${stats.growth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {stats.growth >= 0 ? '+' : ''}{stats.growth.toFixed(1)}%
              </span>
            ) : null}
          </div>
          <p className="text-gray-500 text-sm mb-1">{t('totalRevenue')}</p>
          <p className="text-3xl font-bold">{euro((stats?.totalRevenue || 0), 0)}</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-lg bg-blue-50 text-blue-600">
              <DollarSign size={24} />
            </div>
          </div>
          <p className="text-gray-500 text-sm mb-1">{t('platformFee')}</p>
          <p className="text-3xl font-bold text-blue-600">{euro((stats?.platformFee || 0), 0)}</p>
        </div>

          </>
        )}

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-lg bg-purple-50 text-purple-600">
              <Users size={24} />
            </div>
          </div>
          <p className="text-gray-500 text-sm mb-1">{t('organizations')}</p>
          <p className="text-3xl font-bold text-purple-600">{stats?.activeOrganizations || 0}</p>
        </div>

        {/* Le chiffre seul ici ; ce qui le compose est sur sa propre page. */}
        <Link
          href="/superowner/health"
          title={t('systemHealthTitle')}
          className="bg-white border border-gray-200 rounded-lg p-6 block hover:border-gray-400 transition"
        >
          <div className="flex justify-between items-start mb-4">
            {/* Le vert n'est pas « différent de zéro » : c'est un seuil. Un
                score de 40 % s'affichait en vert comme un score de 100. */}
            <div className={`p-3 rounded-lg ${teinteFond(stats?.systemHealth ?? 0)}`}>
              <Server size={24} />
            </div>
            <ChevronRight size={18} className="text-gray-500" />
          </div>
          <p className="text-gray-500 text-sm mb-1">{t('systemHealth')}</p>
          <p className={`text-3xl font-bold ${teinteTexte(stats?.systemHealth ?? 0)}`}>
            {stats?.systemHealth ?? 0}%
          </p>
        </Link>
      </div>

      {/* Secondary Metrics */}
      <div className={`grid grid-cols-1 gap-4 ${finances ? 'md:grid-cols-2' : ''}`}>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <p className="text-gray-500 text-sm mb-2">{t('totalUsers')}</p>
          <p className="text-4xl font-bold">{stats?.totalUsers || 0}</p>
          <p className="text-xs text-gray-500 mt-2">{t('totalUsersSubtitle')}</p>
        </div>

        {finances && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <p className="text-gray-500 text-sm mb-2">{t('mrr')}</p>
          <p className="text-4xl font-bold text-green-600">{euro((stats?.monthlyRecurring || 0), 0)}</p>
          <p className="text-xs text-gray-500 mt-2">{t('mrrSubtitle')}</p>
        </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-bold mb-4">{t('quickActions')}</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {RACCOURCIS.filter((r) => peutVoir(r.section)).map((r) => (
            <Link
              key={r.href}
              href={r.href}
              className="p-4 bg-gray-100 hover:bg-gray-200 rounded-lg text-center transition-colors block"
            >
              <p className="text-2xl mb-2">{r.icone}</p>
              <p className="text-sm font-medium">{t(r.libelle)}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-blue-600 text-sm">
          {estSuperOwner
            ? t('loggedInAs')
            : nomDuRole
              ? t('loggedInAsRole', { role: nomDuRole })
              : null}
        </p>
      </div>
    </div>
  );
}
