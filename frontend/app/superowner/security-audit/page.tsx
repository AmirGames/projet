'use client';

import { useEffect, useState } from 'react';
import { Shield, AlertTriangle, CheckCircle, Zap } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface SecurityEvent {
  id: string;
  timestamp: string;
  type: 'LOGIN_ATTEMPT' | 'FAILED_AUTH' | 'PERMISSION_DENIED' | 'API_ABUSE' | 'ANOMALY';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  source: string;
  ipAddress: string;
  resolved: boolean;
}

interface SecuritySummary {
  totalEvents: number;
  criticalAlerts: number;
  failedAttempts: number;
  suspiciousIps: number;
  systemHealth: number;
}

export default function SecurityAuditPage() {
  const [summary, setSummary] = useState<SecuritySummary | null>(null);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('ALL');

  useEffect(() => {
    fetchSecurityData();
  }, []);

  const fetchSecurityData = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/superowner/security-audit`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setSummary(data.summary);
      setEvents(data.events || []);
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredEvents = events.filter(event => {
    return severityFilter === 'ALL' || event.severity === severityFilter;
  });

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-red-600/20 text-red-400 border-red-600/50';
      case 'HIGH':
        return 'bg-orange-600/20 text-orange-400 border-orange-600/50';
      case 'MEDIUM':
        return 'bg-yellow-600/20 text-yellow-400 border-yellow-600/50';
      default:
        return 'bg-blue-600/20 text-blue-400 border-blue-600/50';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
      case 'HIGH':
        return <AlertTriangle size={16} />;
      default:
        return <CheckCircle size={16} />;
    }
  };

  if (loading) return <div className="text-center py-8">Chargement...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Shield size={32} className="text-purple-400" />
          Audit Sécurité
        </h1>
        <p className="text-gray-400 mt-1">Surveillance des anomalies et tentatives d'accès</p>
      </div>

      {/* Critical Alerts */}
      {summary?.criticalAlerts ? (
        <div className="bg-red-600/20 border border-red-600/50 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={24} className="text-red-400 mt-1" />
            <div>
              <p className="font-bold text-red-400">{summary.criticalAlerts} Alerte(s) Critique(s)</p>
              <p className="text-sm text-red-400/80">Investigation immédiate requise</p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Security Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-lg bg-purple-600/20 text-purple-400">
              <Zap size={24} />
            </div>
          </div>
          <p className="text-gray-400 text-sm mb-1">Événements Totaux</p>
          <p className="text-3xl font-bold">{summary?.totalEvents || 0}</p>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-lg bg-red-600/20 text-red-400">
              <AlertTriangle size={24} />
            </div>
          </div>
          <p className="text-gray-400 text-sm mb-1">Tentatives Échouées</p>
          <p className="text-3xl font-bold text-red-400">{summary?.failedAttempts || 0}</p>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-lg bg-orange-600/20 text-orange-400">
              <Shield size={24} />
            </div>
          </div>
          <p className="text-gray-400 text-sm mb-1">IPs Suspectes</p>
          <p className="text-3xl font-bold text-orange-400">{summary?.suspiciousIps || 0}</p>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex justify-between items-start mb-4">
            <div className={`p-3 rounded-lg ${summary?.systemHealth ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'}`}>
              <CheckCircle size={24} />
            </div>
          </div>
          <p className="text-gray-400 text-sm mb-1">Santé Sécurité</p>
          <p className={`text-3xl font-bold ${summary?.systemHealth ? 'text-green-400' : 'text-red-400'}`}>
            {summary?.systemHealth || 0}%
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as any)}
          className="bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
        >
          <option value="ALL">Tous les niveaux</option>
          <option value="CRITICAL">Critique</option>
          <option value="HIGH">Haut</option>
          <option value="MEDIUM">Moyen</option>
          <option value="LOW">Bas</option>
        </select>
      </div>

      {/* Security Events */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold">Événements Récents</h2>
        {filteredEvents.length > 0 ? (
          filteredEvents.map((event) => (
            <div
              key={event.id}
              className={`border rounded-lg p-4 ${getSeverityColor(event.severity)}`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-1">{getSeverityIcon(event.severity)}</div>
                <div className="flex-1">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-bold">{event.type.replace(/_/g, ' ')}</p>
                      <p className="text-sm mt-1">{event.description}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${event.resolved ? 'bg-green-600/20 text-green-400' : 'bg-yellow-600/20 text-yellow-400'}`}>
                      {event.resolved ? '✅ Résolu' : '⏳ En attente'}
                    </span>
                  </div>
                  <div className="flex gap-4 mt-2 text-xs opacity-75">
                    <span>📍 {event.ipAddress}</span>
                    <span>⏰ {new Date(event.timestamp).toLocaleString('fr-FR')}</span>
                    <span>🔗 {event.source}</span>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="p-8 text-center text-gray-400 bg-gray-800 border border-gray-700 rounded-lg">
            Aucun événement trouvé.
          </div>
        )}
      </div>

      {/* Info */}
      <div className="bg-blue-600/20 border border-blue-600/50 rounded-lg p-4">
        <p className="text-blue-400 text-sm">
          💡 Tous les événements de sécurité sont enregistrés et analysés automatiquement. Les alertes critiques déclenchent des notifications instantanées.
        </p>
      </div>
    </div>
  );
}
