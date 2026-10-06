'use client';

import { signalerErreur } from '@/lib/erreurs';
import { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { MessageCircle, Plus, Clock, CheckCircle, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { TicketConversation } from '@/components/TicketConversation';
import { useDonneesModifiees } from '@/lib/temps-reel';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import { useLocale, useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/** L'état du ticket, en français : la base le stocke en anglais. */
// Les libellés : `statuts.<statut>` des traductions.
const LIBELLES_STATUT = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

interface Ticket {
  id: string;
  title: string;
  description: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  category: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  archivedAt?: string | null;
  _count?: { messages: number };
}

export default function SupportPage() {
  const t = useTranslations('supportCommercant');
  const locale = useLocale();
  const params = useParams();
  const orgId = params.orgId as string;

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    subject: '',
    description: '',
    priority: 'MEDIUM',
  });
  const [submitting, setSubmitting] = useState(false);
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // silencieux : une relecture en direct garde la liste affichée — et la
  // conversation ouverte dedans.
  const fetchTickets = useCallback(async (silencieux = false) => {
    if (!silencieux) setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/support/tickets?orgId=${orgId}&archived=${showArchived}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setTickets(data.data || []);
      }
    } catch (error) {
      signalerErreur('Erreur:', error);
    } finally {
      setLoading(false);
    }
  }, [orgId, showArchived]);

  // Une réponse du support, un ticket clos ou rouvert : la liste suit.
  useDonneesModifiees('tickets', () => fetchTickets(true), { orgId });

  useEffectChargement(() => {
    fetchTickets();
  }, [orgId, showArchived, fetchTickets]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/support/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...formData,
          orgId,
        }),
      });

      if (response.ok) {
        setFormData({ subject: '', description: '', priority: 'MEDIUM' });
        setShowForm(false);
        fetchTickets();
      }
    } catch (error) {
      signalerErreur('Erreur:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'OPEN':
        return <AlertCircle size={16} className="text-orange-600" />;
      case 'IN_PROGRESS':
        return <Clock size={16} className="text-blue-600" />;
      case 'RESOLVED':
        return <CheckCircle size={16} className="text-green-600" />;
      default:
        return null;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'LOW':
        return 'bg-green-50 text-green-600';
      case 'MEDIUM':
        return 'bg-yellow-50 text-yellow-600';
      case 'HIGH':
        return 'bg-red-50 text-red-600';
      default:
        return '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <MessageCircle size={32} />
            {t('titre')}
          </h1>
          <p className="text-gray-500 mt-2">{t('sousTitre')}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setShowArchived(!showArchived);
              setOpenTicketId(null);
            }}
            className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-900 text-sm"
          >
            {showArchived ? t('voirActifs') : t('voirArchives')}
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg"
          >
            <Plus size={20} />
            {t('nouveau')}
          </button>
        </div>
      </div>

      {/* New Ticket Form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">{t('creer')}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('sujet')}
              </label>
              <input
                type="text"
                value={formData.subject}
                onChange={(e) =>
                  setFormData({ ...formData, subject: e.target.value })
                }
                required
                className="w-full bg-gray-100 border border-gray-300 rounded-lg px-4 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-orange-500"
                placeholder={t('sujetPlaceholder')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('description')}
              </label>
              <textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                required
                rows={4}
                className="w-full bg-gray-100 border border-gray-300 rounded-lg px-4 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-orange-500"
                placeholder={t('details')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('priorite')}
              </label>
              <select
                value={formData.priority}
                onChange={(e) =>
                  setFormData({ ...formData, priority: e.target.value })
                }
                className="w-full bg-gray-100 border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:border-orange-500"
              >
                <option value="LOW">{t('basse')}</option>
                <option value="MEDIUM">{t('moyenne')}</option>
                <option value="HIGH">{t('haute')}</option>
              </select>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold py-2 rounded-lg"
              >
                {submitting ? t('envoi') : t('soumettre')}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-900 font-bold py-2 rounded-lg"
              >
                {t('annuler')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tickets List */}
      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-500">{t('chargement')}</p>
        </div>
      ) : tickets.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <MessageCircle size={48} className="mx-auto text-gray-400 mb-4" />
          <p className="text-gray-500">{t('aucun')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <div
              key={ticket.id}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
            >
              <button
                onClick={() => setOpenTicketId(openTicketId === ticket.id ? null : ticket.id)}
                className="w-full text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {getStatusIcon(ticket.status)}
                      <h3 className="text-gray-900 font-semibold">{ticket.title}</h3>
                    </div>
                    <p className="text-gray-500 text-sm mb-2">{ticket.description}</p>
                    <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                      <span>{new Date(ticket.createdAt).toLocaleDateString(locale)}</span>
                      <span className={`px-2 py-1 rounded ${getPriorityColor(ticket.priority)}`}>
                        {t.has(`priorites.${ticket.priority}`) ? t(`priorites.${ticket.priority}`) : ticket.priority}
                      </span>
                      <span>{LIBELLES_STATUT.includes(ticket.status) ? t(`statuts.${ticket.status}`) : ticket.status}</span>
                      {/* Clos, le ticket est archivé : il n'accepte plus de
                          message, et le dire évite de chercher le champ. */}
                      {ticket.archivedAt && <span className="text-gray-500">{t('archive')}</span>}
                      {(ticket._count?.messages ?? 0) > 0 && (
                        <span className="flex items-center gap-1 text-blue-600">
                          <MessageCircle size={12} />
                          {ticket._count?.messages}
                        </span>
                      )}
                    </div>
                  </div>
                  {openTicketId === ticket.id ? (
                    <ChevronDown size={20} className="text-gray-500 flex-shrink-0" />
                  ) : (
                    <ChevronRight size={20} className="text-gray-500 flex-shrink-0" />
                  )}
                </div>
              </button>

              {openTicketId === ticket.id && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <TicketConversation
                    clair
                    basePath="/api/support/tickets"
                    ticketId={ticket.id}
                    viewerRole="MERCHANT"
                    readOnly={!!ticket.archivedAt}
                    onSent={fetchTickets}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
