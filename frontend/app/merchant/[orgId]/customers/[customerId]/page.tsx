'use client';

import { useCallback, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  ShoppingBag,
  Wallet,
  Ban,
  Save,
} from 'lucide-react';
import { useCurrentStore } from '@/lib/current-store';
import { euro } from '@/lib/format';
import { useTranslations } from 'next-intl';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface CommandeClient {
  id: string;
  totalAmount: number | string;
  status: string;
  createdAt: string;
}

interface Client {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  notes?: string | null;
  status: string;
  createdAt: string;
  orders?: CommandeClient[];
}

const COULEURS: Record<string, string> = {
  PENDING: 'bg-orange-500/20 text-orange-400',
  ACCEPTED: 'bg-blue-500/20 text-blue-400',
  READY: 'bg-purple-500/20 text-purple-400',
  COMPLETED: 'bg-green-500/20 text-green-400',
  REJECTED: 'bg-red-500/20 text-red-400',
};

export default function FicheClientPage() {
  const t = useTranslations('merchantcustomers');
  const params = useParams();
  const orgId = params?.orgId as string;
  const customerId = params?.customerId as string;
  const { storeId, loading: boutiqueEnCours } = useCurrentStore();

  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);

  const charger = useCallback(async () => {
    if (!storeId || !customerId) return;

    setLoading(true);
    setErreur('');

    try {
      const token = localStorage.getItem('accessToken');
      const reponse = await fetch(`${API_URL}/customers/${storeId}/${customerId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const donnees = await reponse.json();

      if (!reponse.ok) {
        // Un client n'est visible que s'il a commandé dans cette boutique.
        setErreur(donnees.error || "Ce client n'a pas commandé dans la boutique sélectionnée");
        setClient(null);
        return;
      }

      setClient(donnees);
      setNote(donnees.notes || '');
    } catch {
      setErreur('Impossible de charger la fiche client');
    } finally {
      setLoading(false);
    }
  }, [storeId, customerId]);

  useEffectChargement(() => {
    if (!boutiqueEnCours) charger();
  }, [boutiqueEnCours, charger]);

  const enregistrerNote = async () => {
    setEnregistrement(true);
    setMessage('');

    try {
      const token = localStorage.getItem('accessToken');
      const reponse = await fetch(`${API_URL}/customers/${storeId}/${customerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ notes: note }),
      });

      const donnees = await reponse.json();

      if (!reponse.ok) {
        setMessage(`❌ ${donnees.error || "Impossible d'enregistrer la note"}`);
        return;
      }

      setMessage('✅ Note enregistrée');
    } catch {
      setMessage(t('connectionErrorFinal'));
    } finally {
      setEnregistrement(false);
    }
  };

  const basculerBlocage = async () => {
    const bloque = client?.status === 'BLOCKED';
    setEnregistrement(true);
    setMessage('');

    try {
      const token = localStorage.getItem('accessToken');
      const reponse = bloque
        ? await fetch(`${API_URL}/customers/${storeId}/${customerId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ status: 'ACTIVE' }),
          })
        : await fetch(`${API_URL}/customers/${storeId}/${customerId}/block`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          });

      const donnees = await reponse.json();

      if (!reponse.ok) {
        setMessage(`❌ ${donnees.error || 'Opération impossible'}`);
        return;
      }

      setMessage(bloque ? '✅ Client débloqué' : '✅ Client bloqué');
      await charger();
    } catch {
      setMessage(t('connectionErrorFinal'));
    } finally {
      setEnregistrement(false);
    }
  };

  if (loading) return <div className="text-center py-8 text-gray-400">Chargement...</div>;

  if (erreur || !client) {
    return (
      <div className="space-y-4">
        <Link
          href={`/merchant/${orgId}/customers`}
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white"
        >
          <ArrowLeft size={18} /> Retour aux clients
        </Link>
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-400">
          {erreur || 'Client introuvable'}
        </div>
      </div>
    );
  }

  const commandes = client.orders || [];
  const totalDepense = commandes.reduce((somme, c) => somme + Number(c.totalAmount || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            href={`/merchant/${orgId}/customers`}
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-2"
          >
            <ArrowLeft size={16} /> Retour aux clients
          </Link>
          <h1 className="text-3xl font-bold">{client.name}</h1>
          <p className="text-gray-400 mt-1">
            Client depuis le {new Date(client.createdAt).toLocaleDateString('fr-FR')}
          </p>
        </div>
        <span
          className={`px-4 py-2 rounded-full text-sm font-medium ${
            client.status === 'BLOCKED'
              ? 'bg-red-500/20 text-red-400'
              : 'bg-green-500/20 text-green-400'
          }`}
        >
          {client.status === 'BLOCKED' ? 'Bloqué' : t('active')}
        </span>
      </div>

      {message && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm">{message}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-400 text-sm">Commandes dans cette boutique</p>
            <ShoppingBag size={20} className="text-blue-500" />
          </div>
          <p className="text-3xl font-bold">{commandes.length}</p>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-400 text-sm">Total dépensé ici</p>
            <Wallet size={20} className="text-green-500" />
          </div>
          <p className="text-3xl font-bold">{euro(totalDepense)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <h2 className="text-lg font-bold mb-4">Coordonnées</h2>
          <div className="space-y-3 text-sm">
            <p className="flex items-start gap-2 text-gray-300">
              <Mail size={16} className="text-gray-500 mt-0.5 flex-shrink-0" />
              <span className="break-all">{client.email}</span>
            </p>
            <p className="flex items-center gap-2 text-gray-300">
              <Phone size={16} className="text-gray-500 flex-shrink-0" />
              {client.phone || 'Non renseigné'}
            </p>
            <p className="flex items-start gap-2 text-gray-300">
              <MapPin size={16} className="text-gray-500 mt-0.5 flex-shrink-0" />
              <span>
                {client.address || 'Adresse non renseignée'}
                {(client.postalCode || client.city) && (
                  <>
                    <br />
                    {[client.postalCode, client.city].filter(Boolean).join(' ')}
                  </>
                )}
              </span>
            </p>
          </div>

          <button
            onClick={basculerBlocage}
            disabled={enregistrement}
            className={`mt-6 w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors disabled:opacity-40 ${
              client.status === 'BLOCKED'
                ? 'bg-green-600 hover:bg-green-500'
                : 'bg-red-600/80 hover:bg-red-600'
            }`}
          >
            <Ban size={16} />
            {client.status === 'BLOCKED' ? 'Débloquer ce client' : 'Bloquer ce client'}
          </button>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 lg:col-span-2">
          <h2 className="text-lg font-bold mb-4">Dernières commandes</h2>
          {commandes.length === 0 ? (
            <p className="text-gray-400">Aucune commande dans cette boutique</p>
          ) : (
            <div className="space-y-2">
              {commandes.map((commande) => (
                <Link
                  key={commande.id}
                  href={`/merchant/${orgId}/orders/${commande.id}`}
                  className="flex items-center justify-between gap-4 p-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{commande.id.slice(-8).toUpperCase()}</p>
                    <p className="text-sm text-gray-400">
                      {new Date(commande.createdAt).toLocaleString('fr-FR')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        COULEURS[commande.status] || 'bg-gray-500/20 text-gray-400'
                      }`}
                    >
                      {commande.status}
                    </span>
                    <span className="font-bold text-green-400">{euro(commande.totalAmount)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <h2 className="text-lg font-bold mb-4">Note interne</h2>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Préférences, allergies, remarques — visible uniquement par votre équipe"
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-orange-500"
        />
        <button
          onClick={enregistrerNote}
          disabled={enregistrement}
          className="mt-3 flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 rounded-lg font-medium transition-colors"
        >
          <Save size={16} /> Enregistrer
        </button>
      </div>
    </div>
  );
}
