'use client';

import { useState } from 'react';
import { useDonneesModifiees } from '@/lib/temps-reel';
import { useTranslations } from 'next-intl';
import { Users, DollarSign, AlertCircle, Server, Lock, ChevronRight } from 'lucide-react';

import { euro } from '@/lib/format';
import Link from 'next/link';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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
  score >= 90 ? 'text-green-400' : score >= 60 ? 'text-amber-400' : 'text-red-400';

const teinteFond = (score: number) =>
  score >= 90
    ? 'bg-green-600/20 text-green-400'
    : score >= 60
      ? 'bg-amber-600/20 text-amber-400'
      : 'bg-red-600/20 text-red-400';

export default function SuperOwnerDashboard() {
  const t = useTranslations('superownerDashboard');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboardStats = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/superowner/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setStats(data.stats);
    } catch (error) {
      console.error('Erreur:', error);
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
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Lock size={32} className="text-red-600" />
          {t('title')}
        </h1>
        <p className="text-gray-400 mt-1">{t('subtitle')}</p>
      </div>

      {/* Critical Alerts */}
      {stats?.criticalAlerts ? (
        <div className="bg-red-600/20 border border-red-600/50 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle size={24} className="text-red-400 mt-1" />
            <div>
              <p className="font-bold text-red-400">{t('criticalAlerts', { count: stats.criticalAlerts })}</p>
              <p className="text-sm text-red-400/80">{t('criticalAlertsSubtitle')}</p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-lg bg-green-600/20 text-green-400">
              <DollarSign size={24} />
            </div>
            {stats?.growth ? (
              <span className={`text-sm font-bold ${stats.growth >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {stats.growth >= 0 ? '+' : ''}{stats.growth.toFixed(1)}%
              </span>
            ) : null}
          </div>
          <p className="text-gray-400 text-sm mb-1">{t('totalRevenue')}</p>
          <p className="text-3xl font-bold">{euro((stats?.totalRevenue || 0), 0)}</p>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-lg bg-blue-600/20 text-blue-400">
              <DollarSign size={24} />
            </div>
          </div>
          <p className="text-gray-400 text-sm mb-1">{t('platformFee')}</p>
          <p className="text-3xl font-bold text-blue-400">{euro((stats?.platformFee || 0), 0)}</p>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-lg bg-purple-600/20 text-purple-400">
              <Users size={24} />
            </div>
          </div>
          <p className="text-gray-400 text-sm mb-1">{t('organizations')}</p>
          <p className="text-3xl font-bold text-purple-400">{stats?.activeOrganizations || 0}</p>
        </div>

        {/* Le chiffre seul ici ; ce qui le compose est sur sa propre page. */}
        <Link
          href="/superowner/health"
          title={t('systemHealthTitle')}
          className="bg-gray-800 border border-gray-700 rounded-lg p-6 block hover:border-gray-500 transition"
        >
          <div className="flex justify-between items-start mb-4">
            {/* Le vert n'est pas « différent de zéro » : c'est un seuil. Un
                score de 40 % s'affichait en vert comme un score de 100. */}
            <div className={`p-3 rounded-lg ${teinteFond(stats?.systemHealth ?? 0)}`}>
              <Server size={24} />
            </div>
            <ChevronRight size={18} className="text-gray-500" />
          </div>
          <p className="text-gray-400 text-sm mb-1">{t('systemHealth')}</p>
          <p className={`text-3xl font-bold ${teinteTexte(stats?.systemHealth ?? 0)}`}>
            {stats?.systemHealth ?? 0}%
          </p>
        </Link>
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <p className="text-gray-400 text-sm mb-2">{t('totalUsers')}</p>
          <p className="text-4xl font-bold">{stats?.totalUsers || 0}</p>
          <p className="text-xs text-gray-500 mt-2">{t('totalUsersSubtitle')}</p>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <p className="text-gray-400 text-sm mb-2">{t('mrr')}</p>
          <p className="text-4xl font-bold text-green-400">{euro((stats?.monthlyRecurring || 0), 0)}</p>
          <p className="text-xs text-gray-500 mt-2">{t('mrrSubtitle')}</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <h2 className="text-lg font-bold mb-4">{t('quickActions')}</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link
            href="/superowner/organizations"
            className="p-4 bg-gray-700 hover:bg-gray-600 rounded-lg text-center transition-colors block"
          >
            <p className="text-2xl mb-2">🏢</p>
            <p className="text-sm font-medium">{t('quickOrganizations')}</p>
          </Link>
          <Link
            href="/superowner/billing"
            className="p-4 bg-gray-700 hover:bg-gray-600 rounded-lg text-center transition-colors block"
          >
            <p className="text-2xl mb-2">💳</p>
            <p className="text-sm font-medium">{t('quickBilling')}</p>
          </Link>
          <Link
            href="/superowner/system-config"
            className="p-4 bg-gray-700 hover:bg-gray-600 rounded-lg text-center transition-colors block"
          >
            <p className="text-2xl mb-2">⚙️</p>
            <p className="text-sm font-medium">{t('quickConfig')}</p>
          </Link>
          <Link
            href="/superowner/security-audit"
            className="p-4 bg-gray-700 hover:bg-gray-600 rounded-lg text-center transition-colors block"
          >
            <p className="text-2xl mb-2">🔒</p>
            <p className="text-sm font-medium">{t('quickSecurityAudit')}</p>
          </Link>
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-600/20 border border-blue-600/50 rounded-lg p-4">
        <p className="text-blue-400 text-sm">
          {t('loggedInAs')}
        </p>
      </div>
    </div>
  );
}
