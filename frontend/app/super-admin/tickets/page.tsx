'use client';

import { useEffect, useState } from 'react';
import { Archive, ArchiveRestore, MessageCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { TicketConversation } from '@/components/TicketConversation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Ticket {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  category: string;
  createdAt: string;
  archivedAt?: string | null;
  org: { id: string; name: string };
  _count?: { messages: number };
}

const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export default function TicketsPage() {
  const t = useTranslations('superadminTickets');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('OPEN');
  const [showArchived, setShowArchived] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [newStatus, setNewStatus] = useState('');
  const [newPriority, setNewPriority] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchTickets();
  }, [statusFilter, showArchived]);

  const fetchTickets = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const url = new URL(`${API_URL}/api/admin/tickets`);
      if (!showArchived) url.searchParams.append('status', statusFilter);
      url.searchParams.append('archived', String(showArchived));

      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Chargement des tickets impossible');

      const data = await response.json();
      setTickets(data.tickets || []);

      // Garde la sélection cohérente avec la liste affichée
      setSelectedTicket((current) =>
        current ? (data.tickets || []).find((t: Ticket) => t.id === current.id) || null : null
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  const selectTicket = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setNewStatus(ticket.status);
    setNewPriority(ticket.priority);
    setError('');
  };

  const handleUpdateTicket = async () => {
    if (!selectedTicket) return;
    setSaving(true);

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/admin/tickets/${selectedTicket.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus, priority: newPriority }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Échec de la mise à jour');
      }

      setError('');
      await fetchTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de la mise à jour');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (archive: boolean) => {
    if (!selectedTicket) return;
    setSaving(true);

    try {
      const token = localStorage.getItem('accessToken');
      const action = archive ? 'archive' : 'unarchive';
      const response = await fetch(`${API_URL}/api/admin/tickets/${selectedTicket.id}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || t('archiveError'));
      }

      setError('');
      setSelectedTicket(null);
      await fetchTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('archiveError'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-center py-8">Chargement...</div>;

  const priorityColors: Record<string, string> = {
    LOW: 'bg-blue-500/20 text-blue-400',
    MEDIUM: 'bg-yellow-500/20 text-yellow-400',
    HIGH: 'bg-orange-500/20 text-orange-400',
    CRITICAL: 'bg-red-500/20 text-red-400',
  };

  const statusColors: Record<string, string> = {
    OPEN: 'bg-red-500/20 text-red-400',
    IN_PROGRESS: 'bg-yellow-500/20 text-yellow-400',
    RESOLVED: 'bg-green-500/20 text-green-400',
    CLOSED: 'bg-gray-500/20 text-gray-400',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Support - Tickets</h1>
          <p className="text-gray-400 mt-1">
            {tickets.length} {showArchived ? 'ticket(s) archivé(s)' : 'ticket(s)'}
          </p>
        </div>
        <button
          onClick={() => {
            setShowArchived(!showArchived);
            setSelectedTicket(null);
          }}
          className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors text-sm flex items-center gap-2"
        >
          <Archive size={16} />
          {showArchived ? 'Voir les tickets actifs' : 'Voir les archives'}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-400">
          {error}
        </div>
      )}

      {/* Filters */}
      {!showArchived && (
        <div className="flex gap-2 flex-wrap">
          {STATUSES.map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-lg transition-colors ${
                statusFilter === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      )}

      {/* Tickets Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tickets List */}
        <div className="lg:col-span-2 space-y-4">
          {tickets.length > 0 ? (
            tickets.map((ticket) => (
              <div
                key={ticket.id}
                onClick={() => selectTicket(ticket)}
                className={`p-4 rounded-lg border transition-colors cursor-pointer ${
                  selectedTicket?.id === ticket.id
                    ? 'bg-gray-700 border-blue-500'
                    : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                }`}
              >
                <div className="flex items-start justify-between mb-2 gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold truncate">{ticket.title}</h3>
                    <p className="text-sm text-gray-400 mt-1">{ticket.org.name}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[ticket.status]}`}>
                      {ticket.status}
                    </span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${priorityColors[ticket.priority]}`}>
                      {ticket.priority}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-400">
                  <span>{ticket.category}</span>
                  {(ticket._count?.messages ?? 0) > 0 && (
                    <span className="flex items-center gap-1 text-blue-400">
                      <MessageCircle size={14} />
                      {ticket._count?.messages}
                    </span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-gray-400">Aucun ticket</div>
          )}
        </div>

        {/* Ticket Detail */}
        {selectedTicket && (
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 h-fit space-y-4">
            <h2 className="text-lg font-bold">Détails du ticket</h2>

            <div>
              <p className="text-sm text-gray-400">Titre</p>
              <p className="font-medium">{selectedTicket.title}</p>
            </div>

            <div>
              <p className="text-sm text-gray-400">Description</p>
              <p className="text-sm">{selectedTicket.description}</p>
            </div>

            <div>
              <p className="text-sm text-gray-400">Commerçant</p>
              <p className="font-medium">{selectedTicket.org.name}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-gray-400 mb-1">Statut</p>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  disabled={!!selectedTicket.archivedAt}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm disabled:opacity-50"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <p className="text-gray-400 mb-1">Priorité</p>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value)}
                  disabled={!!selectedTicket.archivedAt}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm disabled:opacity-50"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {!selectedTicket.archivedAt && (
              <button
                onClick={handleUpdateTicket}
                disabled={saving}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors font-medium text-sm"
              >
                {saving ? 'Enregistrement...' : 'Mettre à jour'}
              </button>
            )}

            {selectedTicket.archivedAt ? (
              <button
                onClick={() => handleArchive(false)}
                disabled={saving}
                className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg transition-colors font-medium text-sm flex items-center justify-center gap-2"
              >
                <ArchiveRestore size={16} />
                Désarchiver
              </button>
            ) : (
              selectedTicket.status === 'CLOSED' && (
                <button
                  onClick={() => handleArchive(true)}
                  disabled={saving}
                  className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg transition-colors font-medium text-sm flex items-center justify-center gap-2"
                >
                  <Archive size={16} />
                  Archiver ce ticket
                </button>
              )
            )}

            <div className="pt-4 border-t border-gray-700">
              <h3 className="font-bold mb-3 flex items-center gap-2">
                <MessageCircle size={18} />
                Conversation
              </h3>
              <TicketConversation
                basePath="/api/admin/tickets"
                ticketId={selectedTicket.id}
                viewerRole="ADMIN"
                readOnly={!!selectedTicket.archivedAt}
                onSent={fetchTickets}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
