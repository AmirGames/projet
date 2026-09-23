'use client';


import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Trash2, Send, Plus, X } from 'lucide-react';
import Link from 'next/link';

import { useCurrentStore } from '@/lib/current-store';
import { useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Campaign {
  id: string;
  name: string;
  type: string;
  message: string;
  status: string;
  sentCount: number;
  openCount: number;
  clickCount: number;
  targetAudience: string;
  createdAt: string;
}

export default function MarketingPage() {
  const t = useTranslations('merchantmarketing');
  const { storeId } = useCurrentStore();
  const params = useParams();
  const router = useRouter();
  const orgId = params?.orgId as string;

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'DRAFT' | 'ACTIVE' | 'COMPLETED'>('ALL');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const itemsPerPage = 20;

  // La page annonçait « Créez et gérez vos campagnes » sans permettre d'en
  // créer une seule : seule la suppression existait.
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [message, setMessage] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [formulaire, setFormulaire] = useState({
    name: '',
    type: 'EMAIL',
    message: '',
    description: '',
    targetAudience: 'all',
  });

  // Lancer une campagne : le bouton « Envoyer » était purement décoratif.
  const changerStatut = async (campagne: Campaign, statut: string) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(
        `${API_URL}/api/marketing/${storeId}/${campagne.id}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status: statut }),
        }
      );

      const donnees = await response.json();

      if (!response.ok) {
        setMessage(`❌ ${donnees.error || 'Changement de statut impossible'}`);
        setModaleOuverte(true);
        return;
      }

      fetchCampaigns();
    } catch {
      setMessage('❌ Erreur de connexion au serveur');
      setModaleOuverte(true);
    }
  };

  const creerCampagne = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formulaire.name.trim().length < 2 || !formulaire.message.trim()) {
      setMessage('❌ Renseignez un nom et le contenu du message');
      return;
    }

    setEnvoi(true);
    setMessage('');

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/marketing/${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: formulaire.name.trim(),
          type: formulaire.type,
          message: formulaire.message.trim(),
          description: formulaire.description.trim() || undefined,
          targetAudience: formulaire.targetAudience,
        }),
      });

      const donnees = await response.json();

      if (!response.ok) {
        setMessage(`❌ ${donnees.error || {t('createKeyFailed')}}`);
        return;
      }

      setModaleOuverte(false);
      setFormulaire({ name: '', type: 'EMAIL', message: '', description: '', targetAudience: 'all' });
      fetchCampaigns();
    } catch {
      setMessage('❌ Erreur de connexion au serveur');
    } finally {
      setEnvoi(false);
    }
  };

  useEffect(() => {
    if (storeId) {
      fetchCampaigns();
    }
  }, [storeId, filter, page]);

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
      if (!token) {
        router.push('/login');
        return;
      }

      const skip = page * itemsPerPage;
      const query = new URLSearchParams({
        skip: skip.toString(),
        take: itemsPerPage.toString(),
        ...(filter !== 'ALL' && { status: filter }),
      });

      const response = await fetch(`${API_URL}/api/marketing/${storeId}?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch campaigns');

      const data = await response.json();
      setCampaigns(data.data || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCampaign = async (campaignId: string) => {
    try {
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/marketing/${storeId}/${campaignId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to delete campaign');
      setCampaigns(campaigns.filter(c => c.id !== campaignId));
    } catch (error) {
      console.error('Error deleting campaign:', error);
    }
  };

  const totalPages = Math.ceil(total / itemsPerPage);

  if (loading && campaigns.length === 0) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
              <p className="text-gray-400">Chargement des campagnes...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-bold">Campagnes Marketing</h1>
            <div className="flex items-center gap-4">
              <button
                onClick={() => { setMessage(''); setModaleOuverte(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg font-medium transition-colors"
              >
                <Plus size={18} /> Nouvelle campagne
              </button>
              <Link href={`/merchant/${orgId}/dashboard`} className="text-gray-400 hover:text-gray-300 text-sm">
                ← Retour
              </Link>
            </div>
          </div>
          <p className="text-gray-400">Créez et gérez vos campagnes marketing</p>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {(['ALL', 'DRAFT', 'ACTIVE', 'COMPLETED'] as const).map(s => (
            <button
              key={s}
              onClick={() => { setFilter(s); setPage(0); }}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === s
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700'
              }`}
            >
              {s === 'ALL' ? {t('all')} : s}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {campaigns.length === 0 ? (
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center text-gray-400">
              Aucune campagne trouvée
            </div>
          ) : (
            campaigns.map((campaign) => (
              <div key={campaign.id} className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold">{campaign.name}</h3>
                    <p className="text-sm text-gray-400">{campaign.type} · {campaign.targetAudience}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
                    campaign.status === 'ACTIVE' ? 'bg-green-600/20 text-green-400 border-green-600/50'
                    : campaign.status === 'DRAFT' ? 'bg-yellow-600/20 text-yellow-400 border-yellow-600/50'
                    : 'bg-gray-600/20 text-gray-400 border-gray-600/50'
                  }`}>
                    {campaign.status}
                  </span>
                </div>

                <p className="text-sm text-gray-300 mb-3">{campaign.message.substring(0, 100)}...</p>

                <div className="grid grid-cols-4 gap-2 mb-4 text-xs">
                  <div className="bg-gray-700/30 p-2 rounded">
                    <p className="text-gray-400">Envoyés</p>
                    <p className="font-bold">{campaign.sentCount}</p>
                  </div>
                  <div className="bg-gray-700/30 p-2 rounded">
                    <p className="text-gray-400">Ouverts</p>
                    <p className="font-bold">{campaign.openCount}</p>
                  </div>
                  <div className="bg-gray-700/30 p-2 rounded">
                    <p className="text-gray-400">Clics</p>
                    <p className="font-bold">{campaign.clickCount}</p>
                  </div>
                  <div className="bg-gray-700/30 p-2 rounded">
                    <p className="text-gray-400">Taux ouverture</p>
                    <p className="font-bold">{campaign.sentCount > 0 ? Math.round((campaign.openCount / campaign.sentCount) * 100) : 0}%</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  {campaign.status === 'ACTIVE' ? (
                    <button
                      onClick={() => changerStatut(campaign, 'COMPLETED')}
                      className="px-3 py-1 bg-green-600/20 text-green-400 rounded text-xs hover:bg-green-600/30 transition"
                    >
                      Terminer
                    </button>
                  ) : campaign.status === 'COMPLETED' ? (
                    <span className="px-3 py-1 text-gray-500 text-xs">Terminée</span>
                  ) : (
                    <button
                      onClick={() => changerStatut(campaign, 'ACTIVE')}
                      className="px-3 py-1 bg-blue-600/20 text-blue-400 rounded text-xs hover:bg-blue-600/30 transition"
                    >
                      <Send size={14} className="inline mr-1" />
                      Envoyer
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteCampaign(campaign.id)}
                    className="px-3 py-1 bg-red-600/20 text-red-400 rounded text-xs hover:bg-red-600/30 transition"
                  >
                    <Trash2 size={14} className="inline mr-1" />
                    Supprimer
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-8 px-6 py-4 bg-gray-800 border border-gray-700 rounded-lg">
            <p className="text-sm text-gray-400">Page {page + 1} sur {totalPages}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded"
              >
                Précédent
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page === totalPages - 1}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded"
              >
                Suivant
              </button>
            </div>
          </div>
        )}

        {modaleOuverte && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <form
              onSubmit={creerCampagne}
              className="bg-gray-800 border border-gray-700 rounded-lg p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">Nouvelle campagne</h2>
                <button
                  type="button"
                  onClick={() => setModaleOuverte(false)}
                  className="p-1 hover:bg-gray-700 rounded"
                >
                  <X size={20} />
                </button>
              </div>

              {message && <div className="bg-gray-700 rounded-lg p-3 text-sm">{message}</div>}

              <div>
                <label className="block text-sm text-gray-400 mb-1">Nom de la campagne</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  value={formulaire.name}
                  onChange={(e) => setFormulaire({ ...formulaire, name: e.target.value })}
                  placeholder="Ex : Offre de rentrée"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Canal</label>
                  <select
                    value={formulaire.type}
                    onChange={(e) => setFormulaire({ ...formulaire, type: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-red-500"
                  >
                    <option value="EMAIL">E-mail</option>
                    <option value="SMS">SMS</option>
                    <option value="PUSH">Notification push</option>
                    <option value="INAPP">Dans l&apos;application</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Destinataires</label>
                  <select
                    value={formulaire.targetAudience}
                    onChange={(e) =>
                      setFormulaire({ ...formulaire, targetAudience: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-red-500"
                  >
                    <option value="all">Tous les clients</option>
                    <option value="new">Nouveaux clients</option>
                    <option value="returning">Clients fidèles</option>
                    <option value="inactive">Clients inactifs</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Description <span className="text-gray-500">(interne, facultative)</span>
                </label>
                <input
                  type="text"
                  value={formulaire.description}
                  onChange={(e) => setFormulaire({ ...formulaire, description: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Message envoyé</label>
                <textarea
                  required
                  rows={5}
                  value={formulaire.message}
                  onChange={(e) => setFormulaire({ ...formulaire, message: e.target.value })}
                  placeholder="Bonjour, profitez de -10 % sur votre prochaine commande..."
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={envoi}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-40 rounded-lg font-medium transition-colors"
                >
                  {envoi ? {t('creating')} : 'Créer la campagne'}
                </button>
                <button
                  type="button"
                  onClick={() => setModaleOuverte(false)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
