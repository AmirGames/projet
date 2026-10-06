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
import { euro, montantCommercant } from '@/lib/format';
import { useLocale, useTranslations } from 'next-intl';
import { numeroCourt } from '@/lib/numero-commande';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface CommandeClient {
  id: string;
  totalAmount: number | string;
  feesAmount?: number | string;
  serviceFeeAmount?: number | string;
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
  PENDING: 'bg-orange-100 text-orange-600',
  ACCEPTED: 'bg-blue-100 text-blue-600',
  READY: 'bg-purple-100 text-purple-600',
  COMPLETED: 'bg-green-100 text-green-600',
  REJECTED: 'bg-red-100 text-red-600',
};

export default function FicheClientPage() {
  const t = useTranslations('merchantcustomers');
  const tStatut = useTranslations('merchantOrderDetail');
  const locale = useLocale();
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
      const reponse = await fetch(`${API_URL}/api/customers/${storeId}/${customerId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const donnees = await reponse.json();

      if (!reponse.ok) {
        // Un client n'est visible que s'il a commandé dans cette boutique.
        setErreur(donnees.error || t('pasCommande'));
        setClient(null);
        return;
      }

      setClient(donnees);
      setNote(donnees.notes || '');
    } catch {
      setErreur(t('chargementFiche'));
    } finally {
      setLoading(false);
    }
  }, [storeId, customerId, t]);

  useEffectChargement(() => {
    if (!boutiqueEnCours) charger();
  }, [boutiqueEnCours, charger]);

  const enregistrerNote = async () => {
    setEnregistrement(true);
    setMessage('');

    try {
      const token = localStorage.getItem('accessToken');
      const reponse = await fetch(`${API_URL}/api/customers/${storeId}/${customerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ notes: note }),
      });

      const donnees = await reponse.json();

      if (!reponse.ok) {
        setMessage(`❌ ${donnees.error || t('noteImpossible')}`);
        return;
      }

      setMessage(t('noteEnregistree'));
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
        ? await fetch(`${API_URL}/api/customers/${storeId}/${customerId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ status: 'ACTIVE' }),
          })
        : await fetch(`${API_URL}/api/customers/${storeId}/${customerId}/block`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          });

      const donnees = await reponse.json();

      if (!reponse.ok) {
        setMessage(`❌ ${donnees.error || t('operationImpossible')}`);
        return;
      }

      setMessage(bloque ? t('debloque') : t('bloque'));
      await charger();
    } catch {
      setMessage(t('connectionErrorFinal'));
    } finally {
      setEnregistrement(false);
    }
  };

  if (loading) return <div className="text-center py-8 text-gray-500">{t('chargement')}</div>;

  if (erreur || !client) {
    return (
      <div className="space-y-4">
        <Link
          href={`/merchant/${orgId}/customers`}
          className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft size={18} /> {t('retourClients')}
        </Link>
        <div className="bg-red-100 border border-red-500/50 rounded-lg p-4 text-red-600">
          {erreur || t('introuvable')}
        </div>
      </div>
    );
  }

  const commandes = client.orders || [];
  const totalDepense = commandes.reduce((somme, c) => somme + montantCommercant(c), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            href={`/merchant/${orgId}/customers`}
            className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-900 text-sm mb-2"
          >
            <ArrowLeft size={16} /> {t('retourClients')}
          </Link>
          <h1 className="text-3xl font-bold">{client.name}</h1>
          <p className="text-gray-500 mt-1">
            {t('clientDepuis', { date: new Date(client.createdAt).toLocaleDateString(locale) })}
          </p>
        </div>
        <span
          className={`px-4 py-2 rounded-full text-sm font-medium ${
            client.status === 'BLOCKED'
              ? 'bg-red-100 text-red-600'
              : 'bg-green-100 text-green-600'
          }`}
        >
          {client.status === 'BLOCKED' ? t('statutBloque') : t('active')}
        </span>
      </div>

      {message && (
        <div className="bg-white border border-gray-200 rounded-lg p-3 text-sm">{message}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-500 text-sm">{t('commandesIci')}</p>
            <ShoppingBag size={20} className="text-blue-500" />
          </div>
          <p className="text-3xl font-bold">{commandes.length}</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-500 text-sm">{t('totalIci')}</p>
            <Wallet size={20} className="text-green-500" />
          </div>
          <p className="text-3xl font-bold">{euro(totalDepense)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-bold mb-4">{t('coordonnees')}</h2>
          <div className="space-y-3 text-sm">
            <p className="flex items-start gap-2 text-gray-700">
              <Mail size={16} className="text-gray-500 mt-0.5 flex-shrink-0" />
              <span className="break-all">{client.email}</span>
            </p>
            <p className="flex items-center gap-2 text-gray-700">
              <Phone size={16} className="text-gray-500 flex-shrink-0" />
              {client.phone || t('nonRenseigne')}
            </p>
            <p className="flex items-start gap-2 text-gray-700">
              <MapPin size={16} className="text-gray-500 mt-0.5 flex-shrink-0" />
              <span>
                {client.address || t('adresseNonRenseignee')}
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
                ? 'bg-green-600 text-white hover:bg-green-500'
                : 'bg-red-600/80 text-white hover:bg-red-600'
            }`}
          >
            <Ban size={16} />
            {client.status === 'BLOCKED' ? t('debloquer') : t('bloquer')}
          </button>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6 lg:col-span-2">
          <h2 className="text-lg font-bold mb-4">{t('dernieres')}</h2>
          {commandes.length === 0 ? (
            <p className="text-gray-500">{t('aucuneCommande')}</p>
          ) : (
            <div className="space-y-2">
              {commandes.map((commande) => (
                <Link
                  key={commande.id}
                  href={`/merchant/${orgId}/orders/${commande.id}`}
                  className="flex items-center justify-between gap-4 p-3 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{numeroCourt(commande.id)}</p>
                    <p className="text-sm text-gray-500">
                      {new Date(commande.createdAt).toLocaleString(locale)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        COULEURS[commande.status] || 'bg-gray-500/20 text-gray-500'
                      }`}
                    >
                      {tStatut.has(`statuts.${commande.status}`) ? tStatut(`statuts.${commande.status}`) : commande.status}
                    </span>
                    <span className="font-bold text-green-600">{euro(montantCommercant(commande))}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-bold mb-4">{t('noteInterne')}</h2>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder={t('notePlaceholder')}
          className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-orange-500"
        />
        <button
          onClick={enregistrerNote}
          disabled={enregistrement}
          className="mt-3 flex items-center gap-2 px-4 py-2 bg-orange-600 text-white hover:bg-orange-500 disabled:opacity-40 rounded-lg font-medium transition-colors"
        >
          <Save size={16} /> {t('enregistrer')}
        </button>
      </div>
    </div>
  );
}
