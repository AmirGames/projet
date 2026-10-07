'use client';

import { useParams } from 'next/navigation';
import { useState, useCallback } from 'react';
import { FileCheck, AlertCircle, Loader2, BarChart3, Ban, RotateCcw } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function DriverDetailPage() {
  const params = useParams();
  const driverId = params.id as string;

  const [stats, setStats] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [infractions, setInfractions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'stats' | 'documents' | 'infractions'>('stats');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, infsRes] = await Promise.all([
        fetch(`${API_URL}/api/zupdrive/admin/drivers/${driverId}/stats`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }),
        fetch(`${API_URL}/api/zupdrive/admin/drivers/${driverId}/infractions`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }),
      ]);

      if (!statsRes.ok || !infsRes.ok) throw new Error('Erreur');

      const statsData = await statsRes.json();
      const infsData = await infsRes.json();

      setStats(statsData);
      setInfractions(infsData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }, [driverId]);

  const handleSuspend = async () => {
    const reason = prompt('Raison de la suspension:');
    if (!reason) return;

    try {
      const response = await fetch(`${API_URL}/api/zupdrive/admin/drivers/${driverId}/suspend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ reason }),
      });

      if (!response.ok) throw new Error('Erreur');
      alert('Chauffeur suspendu');
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const handleReactivate = async () => {
    if (!confirm('Réactiver ce chauffeur?')) return;

    try {
      const response = await fetch(`${API_URL}/api/zupdrive/admin/drivers/${driverId}/reactivate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) throw new Error('Erreur');
      alert('Chauffeur réactivé');
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Détails du Chauffeur</h1>
          <p className="text-gray-600 mt-1">{driverId}</p>
        </div>
        <button onClick={loadData} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          {loading ? <Loader2 className="w-4 h-4 animate-spin inline" /> : <BarChart3 className="w-4 h-4 inline" />}
          Actualiser
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-400" />
        </div>
      ) : stats ? (
        <>
          {/* Infos principales */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg border p-4">
              <p className="text-sm text-gray-600">Courses</p>
              <p className="text-2xl font-bold mt-1">{stats.stats.totalCourses}</p>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <p className="text-sm text-gray-600">Taux complé</p>
              <p className="text-2xl font-bold mt-1">{stats.stats.completionRate.toFixed(1)}%</p>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <p className="text-sm text-gray-600">Revenus</p>
              <p className="text-2xl font-bold mt-1">€{(stats.stats.totalEarnings / 100).toFixed(0)}</p>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <p className="text-sm text-gray-600">Status</p>
              <p
                className={`text-2xl font-bold mt-1 ${
                  stats.status === 'VALIDE'
                    ? 'text-green-600'
                    : stats.status === 'SUSPENDU'
                    ? 'text-red-600'
                    : 'text-yellow-600'
                }`}
              >
                {stats.status}
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            {['stats', 'documents', 'infractions'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`px-4 py-2 font-medium ${
                  activeTab === tab
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab === 'stats' ? 'Statistiques' : tab === 'documents' ? 'Documents' : 'Infractions'}
              </button>
            ))}
          </div>

          {/* Contenu */}
          {activeTab === 'stats' && (
            <div className="bg-white rounded-lg border p-4 space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Courses annulées</span>
                <span className="font-medium">{stats.stats.cancelledCourses}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Prix moyen</span>
                <span className="font-medium">€{(stats.stats.avgPrice / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Infractions graves</span>
                <span className={`font-medium ${stats.stats.highSeverityInfractions > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {stats.stats.highSeverityInfractions}
                </span>
              </div>

              {/* Actions */}
              <div className="border-t pt-4 flex gap-2">
                {stats.status === 'VALIDE' ? (
                  <button
                    onClick={handleSuspend}
                    className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 flex items-center justify-center gap-2"
                  >
                    <Ban className="w-4 h-4" />
                    Suspendre
                  </button>
                ) : stats.status === 'SUSPENDU' ? (
                  <button
                    onClick={handleReactivate}
                    className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Réactiver
                  </button>
                ) : null}
              </div>
            </div>
          )}

          {activeTab === 'infractions' && (
            <div className="space-y-3">
              {infractions.length === 0 ? (
                <div className="bg-white rounded-lg border p-8 text-center">
                  <p className="text-gray-500">Aucune infraction</p>
                </div>
              ) : (
                infractions.map((inf) => (
                  <div key={inf.id} className="bg-white rounded-lg border p-4">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-semibold">{inf.type}</h3>
                      <span
                        className={`text-xs px-2 py-1 rounded font-medium ${
                          inf.severity === 'HAUTE'
                            ? 'bg-red-100 text-red-700'
                            : inf.severity === 'MOYENNE'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-green-100 text-green-700'
                        }`}
                      >
                        {inf.severity}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{inf.description}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(inf.createdAt).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
