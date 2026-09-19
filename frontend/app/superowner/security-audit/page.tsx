'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Shield, AlertTriangle, CheckCircle } from 'lucide-react';

interface AuditEvent {
  id: string;
  action: string;
  actor: string;
  target: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'SUCCESS' | 'FAILED' | 'WARNING';
  details: string;
  createdAt: string;
}

interface AuditResponse {
  events: AuditEvent[];
  summary: {
    totalEvents: number;
    criticalEvents: number;
    lastEvent: string;
  };
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function SecurityAuditPage() {
  const t = useTranslations('superownerSecurityAudit');
  const locale = useLocale();
  const localeFormat = locale === 'en' ? 'en-US' : 'fr-FR';
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [summary, setSummary] = useState({ totalEvents: 0, criticalEvents: 0, lastEvent: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const limit = 20;

  useEffect(() => {
    fetchEvents();
  }, [offset]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const query = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      });

      const res = await fetch(`${API_URL}/api/superowner/security-audit?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error(t('loadError'));
      const data: AuditResponse = await res.json();
      setEvents(data.events);
      setSummary(data.summary);
      setTotal(data.pagination.total);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('genericError'));
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    const colors: { [key: string]: string } = {
      LOW: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      MEDIUM: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
      HIGH: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
      CRITICAL: 'bg-red-500/10 text-red-400 border-red-500/20',
    };
    return colors[severity] || 'bg-gray-500/10 text-gray-400 border-gray-500/20';
  };

  const getStatusColor = (status: string) => {
    const colors: { [key: string]: string } = {
      SUCCESS: 'text-green-400',
      FAILED: 'text-red-400',
      WARNING: 'text-yellow-400',
    };
    return colors[status] || 'text-gray-400';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white flex items-center gap-2">
          <Shield className="w-8 h-8" />
          {t('title')}
        </h1>
        <p className="text-gray-400 mt-2">{t('subtitle')}</p>
      </div>

      {error && (
        <div className="p-4 bg-red-900/20 text-red-400 rounded-lg border border-red-500/20">
          {error}
        </div>
      )}

      {summary.criticalEvents > 0 && (
        <div className="bg-red-600/20 border border-red-600/50 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-red-400 mt-1 flex-shrink-0" />
          <div>
            <p className="font-bold text-red-400">{t('criticalEvents', { count: summary.criticalEvents })}</p>
            <p className="text-sm text-red-400/80">{t('attentionRequired')}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <p className="text-gray-400 text-sm mb-2">{t('totalEvents')}</p>
          <p className="text-3xl font-bold text-white">{summary.totalEvents}</p>
          <p className="text-xs text-gray-500 mt-2">{t('recorded')}</p>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <p className="text-gray-400 text-sm mb-2">{t('criticalEventsLabel')}</p>
          <p className="text-3xl font-bold text-red-400">{summary.criticalEvents}</p>
          <p className="text-xs text-gray-500 mt-2">{t('requiringAttention')}</p>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <p className="text-gray-400 text-sm mb-2">{t('lastEvent')}</p>
          <p className="text-sm font-medium text-white">{new Date(summary.lastEvent).toLocaleDateString(localeFormat)}</p>
          <p className="text-xs text-gray-500 mt-2">{new Date(summary.lastEvent).toLocaleTimeString(localeFormat)}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-12 bg-gray-800/50 rounded-lg border border-gray-700/50">
          <CheckCircle className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <p className="text-gray-400">{t('empty')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <div key={event.id} className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <p className="font-semibold text-white">{event.action}</p>
                  <p className="text-sm text-gray-400 mt-1">{event.details}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getSeverityColor(event.severity)}`}>
                  {event.severity}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500 mt-2">
                <span>{t('actor')}: {event.actor}</span>
                <span>•</span>
                <span>{t('target')}: {event.target}</span>
                <span>•</span>
                <span className={getStatusColor(event.status)}>{event.status}</span>
                <span>•</span>
                <span>{new Date(event.createdAt).toLocaleDateString(localeFormat)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">
          {t('showingRange', { from: offset + 1, to: Math.min(offset + limit, total), total })}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 disabled:opacity-50 transition"
          >
            {t('previous')}
          </button>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={offset + limit >= total}
            className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 disabled:opacity-50 transition"
          >
            {t('next')}
          </button>
        </div>
      </div>
    </div>
  );
}
