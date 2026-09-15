'use client';

import { useEffect, useState } from 'react';
import { Users, DollarSign, AlertCircle, Server, Lock, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

import { euro } from '@/lib/format';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/** Un relevé de santé, avec ce qu'il mesure et comment le remonter. */
interface Controle {
  cle: string;
  libelle: string;
  poids: number;
  score: number;
  etat: 'OK' | 'ATTENTION' | 'PANNE';
  detail: string;
  remede: string;
  pointsObtenus: number;
}

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

const ICONES: Record<string, JSX.Element> = {
  OK: <CheckCircle2 size={18} className="text-green-400" />,
  ATTENTION: <AlertTriangle size={18} className="text-amber-400" />,
  PANNE: <XCircle size={18} className="text-red-400" />,
};

export default function SuperOwnerDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [sante, setSante] = useState<{ score: number; controles: Controle[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/superowner/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setStats(data.stats);
      setSante(data.systemHealth || null);
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="text-center py-8">Chargement...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Lock size={32} className="text-red-600" />
          Dashboard Superowner
        </h1>
        <p className="text-gray-400 mt-1">Vue d'ensemble complète de la plateforme</p>
      </div>

      {/* Critical Alerts */}
      {stats?.criticalAlerts ? (
        <div className="bg-red-600/20 border border-red-600/50 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle size={24} className="text-red-400 mt-1" />
            <div>
              <p className="font-bold text-red-400">{stats.criticalAlerts} Alerte(s) Critique(s)</p>
              <p className="text-sm text-red-400/80">Attention requise immédiate</p>
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
          <p className="text-gray-400 text-sm mb-1">Revenu Total</p>
          <p className="text-3xl font-bold">{euro((stats?.totalRevenue || 0), 0)}</p>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-lg bg-blue-600/20 text-blue-400">
              <DollarSign size={24} />
            </div>
          </div>
          <p className="text-gray-400 text-sm mb-1">Frais Plateforme</p>
          <p className="text-3xl font-bold text-blue-400">{euro((stats?.platformFee || 0), 0)}</p>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-lg bg-purple-600/20 text-purple-400">
              <Users size={24} />
            </div>
          </div>
          <p className="text-gray-400 text-sm mb-1">Organisations</p>
          <p className="text-3xl font-bold text-purple-400">{stats?.activeOrganizations || 0}</p>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex justify-between items-start mb-4">
            {/* Le vert n'est pas « différent de zéro » : c'est un seuil. Un
                score de 40 % s'affichait en vert comme un score de 100. */}
            <div className={`p-3 rounded-lg ${teinteFond(stats?.systemHealth ?? 0)}`}>
              <Server size={24} />
            </div>
          </div>
          <p className="text-gray-400 text-sm mb-1">Santé Système</p>
          <p className={`text-3xl font-bold ${teinteTexte(stats?.systemHealth ?? 0)}`}>
            {stats?.systemHealth ?? 0}%
          </p>
        </div>
      </div>

      {/* Le détail de la santé : le chiffre seul n'apprend rien. */}
      {sante && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-baseline justify-between gap-4 flex-wrap mb-1">
            <h2 className="text-lg font-bold">Sur quoi repose la santé système</h2>
            <span className={`text-sm font-semibold ${teinteTexte(sante.score)}`}>
              {sante.score} points sur 100
            </span>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Cinq relevés, chacun valant un nombre de points fixe. Un relevé sans rien à
            mesurer — aucune livraison, aucun webhook — rend tous ses points.
          </p>

          <div className="divide-y divide-gray-700">
            {sante.controles.map((controle) => (
              <div key={controle.cle} className="py-3 flex items-start gap-3">
                <span className="mt-0.5 flex-shrink-0">{ICONES[controle.etat]}</span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <p className="font-semibold">{controle.libelle}</p>
                    <span className="text-xs text-gray-500">
                      {controle.pointsObtenus} / {controle.poids} points
                    </span>
                  </div>
                  <p className="text-sm text-gray-400">{controle.detail}</p>
                  {controle.remede && (
                    <p className="text-sm text-amber-300 mt-1">{controle.remede}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <p className="text-gray-400 text-sm mb-2">Utilisateurs Totaux</p>
          <p className="text-4xl font-bold">{stats?.totalUsers || 0}</p>
          <p className="text-xs text-gray-500 mt-2">Clients actifs sur la plateforme</p>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <p className="text-gray-400 text-sm mb-2">Revenu Récurrent (MRR)</p>
          <p className="text-4xl font-bold text-green-400">{euro((stats?.monthlyRecurring || 0), 0)}</p>
          <p className="text-xs text-gray-500 mt-2">Revenue mensuel récurrent</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <h2 className="text-lg font-bold mb-4">Actions Rapides</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link
            href="/superowner/organizations"
            className="p-4 bg-gray-700 hover:bg-gray-600 rounded-lg text-center transition-colors block"
          >
            <p className="text-2xl mb-2">🏢</p>
            <p className="text-sm font-medium">Organisations</p>
          </Link>
          <Link
            href="/superowner/billing"
            className="p-4 bg-gray-700 hover:bg-gray-600 rounded-lg text-center transition-colors block"
          >
            <p className="text-2xl mb-2">💳</p>
            <p className="text-sm font-medium">Facturation</p>
          </Link>
          <Link
            href="/superowner/system-config"
            className="p-4 bg-gray-700 hover:bg-gray-600 rounded-lg text-center transition-colors block"
          >
            <p className="text-2xl mb-2">⚙️</p>
            <p className="text-sm font-medium">Configuration</p>
          </Link>
          <Link
            href="/superowner/security-audit"
            className="p-4 bg-gray-700 hover:bg-gray-600 rounded-lg text-center transition-colors block"
          >
            <p className="text-2xl mb-2">🔒</p>
            <p className="text-sm font-medium">Audit Sécurité</p>
          </Link>
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-600/20 border border-blue-600/50 rounded-lg p-4">
        <p className="text-blue-400 text-sm">
          🔐 Vous êtes connecté en tant que Superowner. Vous avez accès complet à tous les systèmes.
        </p>
      </div>
    </div>
  );
}
