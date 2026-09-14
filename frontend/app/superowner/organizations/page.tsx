'use client';

import { useState, useEffect } from 'react';
import { Building2, Users, Ban, CheckCircle, XCircle } from 'lucide-react';

interface Organization {
  id: string;
  name: string;
  email: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
  tier: 'FREE' | 'PREMIUM' | 'PRO';
  createdAt: string;
  activeUsers: number;
  revenue: number;
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
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [action, setAction] = useState('');
  const limit = 20;

  // Suspension et fermeture partagent le service de l'espace
  // d'administration : le comportement est strictement le même.
  const agirSurCommercant = async (
    org: Organization,
    operation: 'suspend' | 'unsuspend' | 'close'
  ) => {
    const libelles = {
      suspend: 'suspendre',
      unsuspend: 'réactiver',
      close: 'fermer définitivement',
    };

    let reason = '';
    if (operation !== 'unsuspend') {
      reason = window.prompt(`Motif pour ${libelles[operation]} « ${org.name} » :`) || '';
      if (!reason.trim()) return;
    } else if (!window.confirm(`Réactiver « ${org.name} » ?`)) {
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
        setError(data.error || `Impossible de ${libelles[operation]} ce commerçant`);
        return;
      }

      await fetchOrganizations();
    } catch {
      setError('Erreur de connexion au serveur');
    } finally {
      setAction('');
    }
  };

  useEffect(() => {
    fetchOrganizations();
  }, [offset]);

  const fetchOrganizations = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const query = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      });

      const res = await fetch(`${API_URL}/api/superowner/organizations?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Erreur lors du chargement des organisations');
      const data: OrganizationsResponse = await res.json();
      setOrganizations(data.organizations);
      setTotal(data.pagination?.total ?? data.organizations?.length ?? 0);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur s\'est produite');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: { [key: string]: string } = {
      ACTIVE: 'bg-green-500/10 text-green-400 border-green-500/20',
      SUSPENDED: 'bg-red-500/10 text-red-400 border-red-500/20',
      CLOSED: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
    };
    return colors[status] || 'bg-gray-500/10 text-gray-400 border-gray-500/20';
  };

  const getTierColor = (tier: string) => {
    const colors: { [key: string]: string } = {
      FREE: 'bg-gray-600',
      PREMIUM: 'bg-blue-600',
      PRO: 'bg-purple-600',
    };
    return colors[tier] || 'bg-gray-600';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white flex items-center gap-2">
          <Building2 className="w-8 h-8" />
          Organisations
        </h1>
        <p className="text-gray-400 mt-2">Gestion de toutes les organisations de la plateforme</p>
      </div>

      {error && (
        <div className="p-4 bg-red-900/20 text-red-400 rounded-lg border border-red-500/20">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : organizations.length === 0 ? (
        <div className="text-center py-12 bg-gray-800/50 rounded-lg border border-gray-700/50">
          <Building2 className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <p className="text-gray-400">Aucune organisation trouvée</p>
        </div>
      ) : (
        <div className="bg-gray-800/50 rounded-lg border border-gray-700/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-900/50 border-b border-gray-700/50">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">Nom</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">Email</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">Plan</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">Status</th>
                  <th className="px-6 py-3 text-center text-sm font-semibold text-gray-300">Utilisateurs</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-300">Revenu</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">Date</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {organizations.map((org) => (
                  <tr key={org.id} className="hover:bg-gray-700/20 transition">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-semibold text-white">{org.name}</p>
                        <p className="text-xs text-gray-500 mt-1">{org.id.slice(0, 8)}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-400">{org.email}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded text-xs font-semibold ${getTierColor(org.tier)} text-white`}>
                        {org.tier}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(org.status)}`}>
                        {org.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Users size={16} className="text-blue-400" />
                        <span className="text-sm text-gray-400">{org.activeUsers}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className="font-bold text-green-400">{Number(org.revenue || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(org.createdAt).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {org.status === 'ACTIVE' && (
                          <button
                            onClick={() => agirSurCommercant(org, 'suspend')}
                            disabled={action === org.id}
                            title="Suspendre ce commerçant"
                            className="p-2 bg-orange-600/80 hover:bg-orange-600 disabled:opacity-40 rounded-lg text-white transition"
                          >
                            <Ban size={16} />
                          </button>
                        )}
                        {org.status === 'SUSPENDED' && (
                          <button
                            onClick={() => agirSurCommercant(org, 'unsuspend')}
                            disabled={action === org.id}
                            title="Réactiver ce commerçant"
                            className="p-2 bg-green-600/80 hover:bg-green-600 disabled:opacity-40 rounded-lg text-white transition"
                          >
                            <CheckCircle size={16} />
                          </button>
                        )}
                        {org.status !== 'CLOSED' && (
                          <button
                            onClick={() => agirSurCommercant(org, 'close')}
                            disabled={action === org.id}
                            title="Fermer définitivement ce commerçant"
                            className="p-2 bg-red-600/80 hover:bg-red-600 disabled:opacity-40 rounded-lg text-white transition"
                          >
                            <XCircle size={16} />
                          </button>
                        )}
                        {org.status === 'CLOSED' && (
                          <span className="text-xs text-gray-500">Fermé</span>
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
        <p className="text-sm text-gray-400">
          Affichage {offset + 1} à {Math.min(offset + limit, total)} sur {total}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 disabled:opacity-50 transition"
          >
            Précédent
          </button>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={offset + limit >= total}
            className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 disabled:opacity-50 transition"
          >
            Suivant
          </button>
        </div>
      </div>
    </div>
  );
}
