'use client';

import { useState, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { HelpCircle, MessageSquare, Clock, AlertCircle } from 'lucide-react';

import { TicketConversation } from '@/components/TicketConversation';
import { useDonneesModifiees } from '@/lib/temps-reel';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface SupportTicket {
  id: string;
  title: string;
  description: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  userEmail: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  assignedTo?: string;
  /** Renseigné dès que le ticket est clos : il passe alors dans les archives. */
  archivedAt?: string | null;
  organization?: string;
}

interface TicketsResponse {
  tickets: SupportTicket[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

export default function SupportTicketsPage() {
  const t = useTranslations('superownerSupportTickets');
  const locale = useLocale();

  /** L'état du ticket, en français ou anglais selon la langue : la base le
   * stocke toujours en anglais (OPEN, IN_PROGRESS, ...). */
  const LIBELLES_STATUT: Record<string, string> = {
    OPEN: t('statusOpen'),
    IN_PROGRESS: t('statusInProgress'),
    RESOLVED: t('statusResolved'),
    CLOSED: t('statusClosed'),
  };

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ticketOuvert, setTicketOuvert] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterPriority, setFilterPriority] = useState<string>('ALL');
  /**
   * Les tickets archivés.
   *
   * Clore un ticket l'archive : la liste ne montrait que les actifs, sans moyen
   * de voir ni de rouvrir ce qui avait été clos.
   */
  const [voirArchives, setVoirArchives] = useState(false);
  const limit = 20;

  // silencieux : une relecture en direct garde la liste affichée — et la
  // conversation ouverte dedans.
  const fetchTickets = useCallback(async (silencieux = false) => {
    if (!silencieux) setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const query = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      });

      if (filterStatus !== 'ALL') {
        query.append('status', filterStatus);
      }
      if (filterPriority !== 'ALL') {
        query.append('priority', filterPriority);
      }
      if (voirArchives) {
        query.append('archived', 'true');
      }

      const res = await fetch(`${API_URL}/api/superowner/support-tickets?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error(t('loadError'));
      const data: TicketsResponse = await res.json();
      setTickets(data.tickets);
      setTotal(data.pagination.total);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('genericError'));
    } finally {
      setLoading(false);
    }
  }, [filterPriority, filterStatus, offset, t, voirArchives]);

  // Un ticket ouvert par un commerçant, une réponse, un changement de statut
  // par un collègue : la liste suit.
  useDonneesModifiees('tickets', () => fetchTickets(true));

  useEffectChargement(() => {
    fetchTickets();
  }, [offset, filterStatus, filterPriority, voirArchives, fetchTickets]);

  const handleUpdateStatus = async (ticketId: string, newStatus: string) => {
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${API_URL}/api/superowner/support-tickets/${ticketId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) throw new Error(t('updateError'));
      fetchTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('genericError'));
    }
  };

  const handleUpdatePriority = async (ticketId: string, priorite: string) => {
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${API_URL}/api/superowner/support-tickets/${ticketId}/priority`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ priority: priorite }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t('priorityChangeError'));
        return;
      }

      setError('');
      fetchTickets();
    } catch {
      setError(t('connectionError'));
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'URGENT':
        return 'bg-red-600 text-white';
      case 'HIGH':
        return 'bg-orange-600 text-white';
      case 'MEDIUM':
        return 'bg-yellow-600 text-white';
      case 'LOW':
        return 'bg-green-600 text-white';
      default:
        return 'bg-gray-600 text-white';
    }
  };

  const statusOptions = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

  /** Rouvrir un ticket clos : il sort de l'archive et redevient répondable. */
  const rouvrir = (ticketId: string) => handleUpdateStatus(ticketId, 'IN_PROGRESS');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            <HelpCircle className="w-8 h-8" />
            {t('title')}
          </h1>
          <p className="text-gray-400 mt-2">{t('subtitle')}</p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-900/20 text-red-400 rounded-lg border border-red-500/20 flex items-center gap-2">
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      {/* Un ticket clos est archivé : sans cette bascule, la plateforme ne
          pouvait plus le relire ni le rouvrir. */}
      <div className="flex gap-2" role="group" aria-label={t('ticketsToShow')}>
        <button
          onClick={() => {
            setVoirArchives(false);
            setOffset(0);
          }}
          className={`px-4 py-2 rounded text-sm font-medium transition ${
            voirArchives ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-blue-600 text-white'
          }`}
        >
          {t('ongoing')}
        </button>
        <button
          onClick={() => {
            setVoirArchives(true);
            setOffset(0);
          }}
          className={`px-4 py-2 rounded text-sm font-medium transition ${
            voirArchives ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          {t('archived')}
        </button>
      </div>

      <div className="flex gap-4">
        <div className="flex-1">
          <label className="block text-sm font-medium mb-2">{t('filterByStatus')}</label>
          <select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              setOffset(0);
            }}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
          >
            <option value="ALL">{t('allStatuses')}</option>
            <option value="OPEN">{t('statusOpen')}</option>
            <option value="IN_PROGRESS">{t('statusInProgress')}</option>
            <option value="RESOLVED">{t('statusResolved')}</option>
            <option value="CLOSED">{t('statusClosed')}</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium mb-2">{t('filterByPriority')}</label>
          <select
            value={filterPriority}
            onChange={(e) => {
              setFilterPriority(e.target.value);
              setOffset(0);
            }}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
          >
            <option value="ALL">{t('allPriorities')}</option>
            <option value="URGENT">{t('priorityUrgent')}</option>
            <option value="HIGH">{t('priorityHigh')}</option>
            <option value="MEDIUM">{t('priorityMedium')}</option>
            <option value="LOW">{t('priorityLow')}</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-12 bg-gray-800/50 rounded-lg">
          <HelpCircle className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <p className="text-gray-400">
            {voirArchives ? t('emptyArchived') : t('emptyOngoing')}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {tickets.map((ticket) => (
            <div
              key={ticket.id}
              className="bg-gray-800 border border-gray-700 rounded-lg p-6 hover:border-gray-600 transition"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-bold text-white">{ticket.title}</h3>
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${getPriorityColor(ticket.priority)}`}>
                      {ticket.priority}
                    </span>
                    <span className={`px-2 py-1 rounded text-xs font-semibold text-white bg-gray-700`}>
                      {LIBELLES_STATUT[ticket.status] || ticket.status}
                    </span>
                    {ticket.archivedAt && (
                      <span className="px-2 py-1 rounded text-xs font-semibold bg-gray-900 text-gray-400">
                        {t('archivedBadge')}
                      </span>
                    )}
                  </div>
                  <p className="text-gray-400 text-sm mb-2">{ticket.description}</p>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    {ticket.organization && <span>{ticket.organization}</span>}
                    <span>{ticket.userEmail}</span>
                    <span className="flex items-center gap-1">
                      <Clock size={14} />
                      {new Date(ticket.createdAt).toLocaleDateString(locale === 'en' ? 'en-US' : 'fr-FR')}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare size={14} />
                      {ticket.messageCount} {t('messages')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-gray-700">
                <select
                  value={ticket.status}
                  onChange={(e) => handleUpdateStatus(ticket.id, e.target.value)}
                  className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {LIBELLES_STATUT[status] || status}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <select
                    value={ticket.priority}
                    onChange={(e) => handleUpdatePriority(ticket.id, e.target.value)}
                    className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                    title={t('ticketPriority')}
                  >
                    {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  {ticket.archivedAt && (
                    <button
                      onClick={() => rouvrir(ticket.id)}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded text-sm transition"
                    >
                      {t('reopen')}
                    </button>
                  )}
                  <button
                    onClick={() => setTicketOuvert(ticketOuvert === ticket.id ? null : ticket.id)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition"
                  >
                    {ticketOuvert === ticket.id ? t('collapse') : t('viewConversation')}
                  </button>
                </div>
              </div>

              {ticketOuvert === ticket.id && (
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <TicketConversation
                    basePath="/api/superowner/support-tickets"
                    ticketId={ticket.id}
                    viewerRole="ADMIN"
                    onSent={fetchTickets}
                  />
                </div>
              )}
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
            className="px-4 py-2 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 disabled:opacity-50"
          >
            {t('previous')}
          </button>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={offset + limit >= total}
            className="px-4 py-2 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 disabled:opacity-50"
          >
            {t('next')}
          </button>
        </div>
      </div>
    </div>
  );
}
