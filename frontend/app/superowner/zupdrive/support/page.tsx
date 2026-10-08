'use client';

/**
 * ZupDrive Admin — Support System
 * Gestion des tickets de support, messages, résolution.
 */

import { useState, useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { MessageSquare, AlertCircle, Loader2 } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface SupportTicket {
  id: string;
  ticketNumber: string;
  subject: string;
  status: 'OUVERT' | 'EN_COURS' | 'EN_ATTENTE_CLIENT' | 'RESOLU' | 'FERME';
  priority: 'BASSE' | 'MOYENNE' | 'HAUTE' | 'CRITIQUE';
  category: string;
  reporterType: string;
  createdAt: string;
  updatedAt: string;
}

export default function SupportPage() {
  const t = useTranslations('superownerZupdriveSupport');
  const locale = useLocale() === 'en' ? 'en-US' : 'fr-FR';
  // Un statut ou une priorité inconnus de l'interface s'affichent tels que le serveur les envoie.
  const libelle = (prefixe: 'status' | 'priority', valeur: string) =>
    t.has(`${prefixe}_${valeur}`) ? t(`${prefixe}_${valeur}`) : valeur;
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (priorityFilter) params.append('priority', priorityFilter);
      params.append('limit', '100');

      const response = await fetch(`${API_URL}/api/zupdrive/support/admin/tickets?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });

      if (!response.ok) throw new Error(t('loadError'));
      const { tickets: data } = await response.json();
      setTickets(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('unknownError'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter, t]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OUVERT': return 'bg-blue-100 text-blue-700';
      case 'EN_COURS': return 'bg-yellow-100 text-yellow-700';
      case 'EN_ATTENTE_CLIENT': return 'bg-purple-100 text-purple-700';
      case 'RESOLU': return 'bg-green-100 text-green-700';
      case 'FERME': return 'bg-gray-100 text-gray-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'CRITIQUE': return '🔴';
      case 'HAUTE': return '🟠';
      case 'MOYENNE': return '🟡';
      case 'BASSE': return '🟢';
      default: return '⚪';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-gray-600 mt-2">{t('subtitle')}</p>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('filterStatus')}</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">{t('allStatuses')}</option>
              <option value="OUVERT">{t('status_OUVERT')}</option>
              <option value="EN_COURS">{t('status_EN_COURS')}</option>
              <option value="RESOLU">{t('status_RESOLU')}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('filterPriority')}</label>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">{t('allPriorities')}</option>
              <option value="CRITIQUE">{t('priority_CRITIQUE')}</option>
              <option value="HAUTE">{t('priority_HAUTE')}</option>
              <option value="MOYENNE">{t('priority_MOYENNE')}</option>
              <option value="BASSE">{t('priority_BASSE')}</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={loadTickets}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
              {t('load')}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <div>
            <h3 className="font-medium text-red-900">{t('errorTitle')}</h3>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-400" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-gray-500">{t('empty')}</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">{t('colTicket')}</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">{t('colSubject')}</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">{t('colStatus')}</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">{t('colPriority')}</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">{t('colCreated')}</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">{t('colAction')}</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.id} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="px-6 py-4 font-mono text-sm text-gray-900">{ticket.ticketNumber}</td>
                  <td className="px-6 py-4">
                    <p className="text-gray-900 font-medium">{ticket.subject}</p>
                    <p className="text-xs text-gray-500">{ticket.category}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-block px-2 py-1 rounded-sm text-xs font-medium ${getStatusColor(ticket.status)}`}>
                      {libelle('status', ticket.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-lg">{getPriorityIcon(ticket.priority)} {libelle('priority', ticket.priority)}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {new Date(ticket.createdAt).toLocaleDateString(locale)}
                  </td>
                  <td className="px-6 py-4">
                    <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                      {t('viewDetails')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
