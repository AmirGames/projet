'use client';

/**
 * ZupDrive Admin — Driver Management
 * Liste des chauffeurs avec filtres, suspension, document validation, infractions.
 */

import { useCallback, useState } from 'react';
import { Shield, AlertCircle, Ban, RotateCcw, Loader2 } from 'lucide-react';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Driver {
  id: string;
  nomComplet: string;
  email: string;
  phone: string;
  status: 'VALIDE' | 'SUSPENDU' | 'EN_ATTENTE_VALIDATION';
  rating: number;
  totalCourses: number;
  acceptanceRate: number;
  totalEarnings: number;
  createdAt: string;
  suspendedAt?: string;
  suspensionReason?: string;
}

export default function DriverManagementPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtres
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [minRating, setMinRating] = useState<number>(0);
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);

  // Charger les drivers
  const loadDrivers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (minRating > 0) params.append('minRating', minRating.toString());
      params.append('limit', limit.toString());
      params.append('offset', offset.toString());

      const response = await fetch(`${API_URL}/api/zupdrive/admin/drivers?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });

      if (!response.ok) throw new Error('Erreur lors du chargement des chauffeurs');
      const { drivers: data } = await response.json();
      setDrivers(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, minRating, limit, offset]);

  // Charger les drivers au montage
  useState(() => {
    loadDrivers();
  });

  // Suspendre un chauffeur
  const handleSuspend = async (driverId: string, reason: string) => {
    if (!reason.trim()) {
      alert('Raison requise');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/zupdrive/admin/drivers/${driverId}/suspend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ reason }),
      });

      if (!response.ok) throw new Error('Erreur lors de la suspension');
      await loadDrivers();
      alert('Chauffeur suspendu');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  };

  // Réactiver un chauffeur
  const handleReactivate = async (driverId: string) => {
    if (!confirm('Réactiver ce chauffeur ?')) return;

    try {
      const response = await fetch(`${API_URL}/api/zupdrive/admin/drivers/${driverId}/reactivate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) throw new Error('Erreur lors de la réactivation');
      await loadDrivers();
      alert('Chauffeur réactivé');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'VALIDE':
        return 'bg-green-100 text-green-700';
      case 'SUSPENDU':
        return 'bg-red-100 text-red-700';
      case 'EN_ATTENTE_VALIDATION':
        return 'bg-yellow-100 text-yellow-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'VALIDE':
        return 'Valide';
      case 'SUSPENDU':
        return 'Suspendu';
      case 'EN_ATTENTE_VALIDATION':
        return 'En attente';
      default:
        return status;
    }
  };

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Gestion des Chauffeurs</h1>
        <p className="text-gray-600 mt-2">Gérez les statuts, documents et infractions des chauffeurs</p>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Statut</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setOffset(0);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tous les statuts</option>
              <option value="VALIDE">Valide</option>
              <option value="SUSPENDU">Suspendu</option>
              <option value="EN_ATTENTE_VALIDATION">En attente</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Note minimum</label>
            <input
              type="number"
              min="0"
              max="5"
              step="0.5"
              value={minRating}
              onChange={(e) => {
                setMinRating(parseFloat(e.target.value));
                setOffset(0);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => loadDrivers()}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
              Actualiser
            </button>
          </div>
        </div>
      </div>

      {/* Erreur */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-red-900">Erreur</h3>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Liste des chauffeurs */}
      {loading ? (
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-400" />
        </div>
      ) : drivers.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-gray-500">Aucun chauffeur trouvé</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Chauffeur</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Statut</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Note</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Courses</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Revenus</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((driver) => (
                <tr key={driver.id} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-medium text-gray-900">{driver.nomComplet}</p>
                      <p className="text-sm text-gray-500">{driver.email}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(driver.status)}`}>
                      {getStatusLabel(driver.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{driver.rating?.toFixed(1) || 'N/A'}</span>
                      <span className="text-yellow-500">★</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-gray-700">{driver.totalCourses}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-gray-700">€{(driver.totalEarnings / 100).toFixed(2)}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/superowner/zupdrive/driver-management/${driver.id}`}
                        className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                      >
                        Détails
                      </Link>
                      {driver.status === 'SUSPENDU' ? (
                        <button
                          onClick={() => handleReactivate(driver.id)}
                          className="text-green-600 hover:text-green-700 text-sm font-medium flex items-center gap-1"
                        >
                          <RotateCcw className="w-4 h-4" />
                          Réactiver
                        </button>
                      ) : driver.status === 'VALIDE' ? (
                        <button
                          onClick={() => {
                            const reason = prompt('Raison de la suspension:');
                            if (reason) handleSuspend(driver.id, reason);
                          }}
                          className="text-red-600 hover:text-red-700 text-sm font-medium flex items-center gap-1"
                        >
                          <Ban className="w-4 h-4" />
                          Suspendre
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {drivers.length > 0 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Précédent
          </button>
          <span className="text-sm text-gray-600">
            Affichage {offset + 1} à {Math.min(offset + limit, offset + drivers.length)}
          </span>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={drivers.length < limit}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Suivant
          </button>
        </div>
      )}
    </div>
  );
}
