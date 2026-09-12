'use client';

import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Ticket {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  category: string;
  createdAt: string;
  org: { id: string; name: string };
}

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('OPEN');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [newStatus, setNewStatus] = useState('');

  useEffect(() => {
    fetchTickets();
  }, [statusFilter]);

  const fetchTickets = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const url = new URL(`${API_URL}/api/admin/tickets`);
      url.searchParams.append('status', statusFilter);

      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch');

      const data = await response.json();
      setTickets(data.tickets || []);
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTicket = async () => {
    if (!selectedTicket || !newStatus) return;

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/admin/tickets/${selectedTicket.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) throw new Error('Failed to update');

      fetchTickets();
      setSelectedTicket(null);
      setNewStatus('');
    } catch (error) {
      console.error('Erreur:', error);
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
      <div>
        <h1 className="text-3xl font-bold">Support - Tickets</h1>
        <p className="text-gray-400 mt-1">{tickets.length} tickets</p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map(status => (
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

      {/* Tickets Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tickets List */}
        <div className="lg:col-span-2 space-y-4">
          {tickets.length > 0 ? (
            tickets.map((ticket) => (
              <div
                key={ticket.id}
                onClick={() => {
                  setSelectedTicket(ticket);
                  setNewStatus(ticket.status);
                }}
                className={`p-4 rounded-lg border transition-colors cursor-pointer ${
                  selectedTicket?.id === ticket.id
                    ? 'bg-gray-700 border-blue-500'
                    : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h3 className="font-bold">{ticket.title}</h3>
                    <p className="text-sm text-gray-400 mt-1">{ticket.org.name}</p>
                  </div>
                  <div className="flex gap-2 ml-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[ticket.status]}`}>
                      {ticket.status}
                    </span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${priorityColors[ticket.priority]}`}>
                      {ticket.priority}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-gray-400">{ticket.category}</p>
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-gray-400">Aucun ticket</div>
          )}
        </div>

        {/* Ticket Detail */}
        {selectedTicket && (
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 h-fit">
            <h2 className="text-lg font-bold mb-4">Détails du ticket</h2>

            <div className="space-y-4">
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
                  <p className="text-gray-400">Statut</p>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
                  >
                    <option value="OPEN">OPEN</option>
                    <option value="IN_PROGRESS">IN_PROGRESS</option>
                    <option value="RESOLVED">RESOLVED</option>
                    <option value="CLOSED">CLOSED</option>
                  </select>
                </div>

                <div>
                  <p className="text-gray-400">Priorité</p>
                  <p className="font-medium">{selectedTicket.priority}</p>
                </div>
              </div>

              <button
                onClick={handleUpdateTicket}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors font-medium text-sm"
              >
                Mettre à jour
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
