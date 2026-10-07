'use client';

/**
 * ZupDrive Admin — Support System
 * Gestion des tickets de support, messages, résolution.
 */

import { useState, useCallback } from 'react';
import { MessageSquare, AlertCircle, Loader2, CheckCircle, Clock } from 'lucide-react';

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

      const response = await fetch(`${API_URL}/api/zupdrive/admin/support/tickets?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });

      if (!response.ok) throw new Error('Erreur lors du chargement des tickets');
      const { tickets: data } = await response.json();
      setTickets(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter]);

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
        <h1 className="text-3xl font-bold text-gray-900">Système de Support</h1>
        <p className="text-gray-600 mt-2">Gérez les tickets de support des chauffeurs et passagers</p>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Statut</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">Tous les statuts</option>
              <option value="OUVERT">Ouvert</option>
              <option value="EN_COURS">En cours</option>
              <option value="RESOLU">Résolu</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Priorité</label>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">Toutes les priorités</option>
              <option value="CRITIQUE">Critique</option>
              <option value="HAUTE">Haute</option>
              <option value="MOYENNE">Moyenne</option>
              <option value="BASSE">Basse</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={loadTickets}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
              Charger
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <div>
            <h3 className="font-medium text-red-900">Erreur</h3>
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
          <p className="text-gray-500">Aucun ticket trouvé</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Ticket</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Sujet</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Statut</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Priorité</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Créé</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Action</th>
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
                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getStatusColor(ticket.status)}`}>
                      {ticket.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-lg">{getPriorityIcon(ticket.priority)} {ticket.priority}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {new Date(ticket.createdAt).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-6 py-4">
                    <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                      Voir détails
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
