'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Package,
  User,
  MapPin,
  Clock,
  FileText,
  StickyNote,
  Printer,
} from 'lucide-react';
import { useCurrentStore } from '@/lib/current-store';
import { euro } from '@/lib/format';
import { intituleDeLaLigne } from '@/lib/ligne-commande';

import { useTranslations } from 'next-intl';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface LigneCommande {
  id: string;
  quantity: number;
  price: number | string;
  total: number | string;
  product?: {
    name: string;
    sku?: string | null;
    variantLabel?: string | null;
    category?: { name: string } | null;
  } | null;
  /** La déclinaison préparée : pennes, grande taille. */
  variant?: { id: string; label: string; sku?: string | null } | null;
}

interface Commande {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryType: 'PICKUP' | 'DELIVERY';
  deliveryAddress?: string | null;
  deliveryCity?: string | null;
  deliveryPostal?: string | null;
  pickupTime?: string | null;
  status: string;
  paymentStatus: string;
  totalAmount: number | string;
  taxAmount: number | string;
  /** Le taux tel qu'il valait à la commande, et non celui réglé aujourd'hui. */
  taxRate?: number | string;
  feesAmount: number | string;
  notes?: string | null;
  createdAt: string;
  items?: LigneCommande[];
}

const STATUTS: { valeur: string; libelle: string }[] = [
  { valeur: 'PENDING', libelle: 'En attente' },
  { valeur: 'ACCEPTED', libelle: 'Acceptée' },
  { valeur: 'PREPARING', libelle: 'En préparation' },
  { valeur: 'READY', libelle: 'Prête' },
  { valeur: 'COMPLETED', libelle: 'Terminée' },
  { valeur: 'REJECTED', libelle: 'Refusée' },
];

const COULEURS: Record<string, string> = {
  PENDING: 'bg-orange-500/20 text-orange-400',
  ACCEPTED: 'bg-blue-500/20 text-blue-400',
  PREPARING: 'bg-amber-500/20 text-amber-400',
  READY: 'bg-purple-500/20 text-purple-400',
  COMPLETED: 'bg-green-500/20 text-green-400',
  REJECTED: 'bg-red-500/20 text-red-400',
};

export default function DetailCommandePage() {
  const t = useTranslations('merchantOrderDetail');
  const params = useParams();
  const orgId = params?.orgId as string;
  const orderId = params?.orderId as string;
  const { storeId, loading: boutiqueEnCours } = useCurrentStore();

  const [commande, setCommande] = useState<Commande | null>(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);

  const charger = useCallback(async () => {
    if (!storeId || !orderId) return;

    setLoading(true);
    setErreur('');

    try {
      const token = localStorage.getItem('accessToken');
      const reponse = await fetch(`${API_URL}/api/order-management/${storeId}/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const donnees = await reponse.json();

      if (!reponse.ok) {
        // Une commande d'une autre boutique renvoie 404 : c'est le cas
        // classique après un changement de boutique dans l'en-tête.
        setErreur(donnees.error || "Cette commande est introuvable dans la boutique sélectionnée");
        setCommande(null);
        return;
      }

      setCommande(donnees.order || donnees);
    } catch {
      setErreur('Impossible de charger la commande');
    } finally {
      setLoading(false);
    }
  }, [storeId, orderId]);

  useEffect(() => {
    if (!boutiqueEnCours) charger();
  }, [boutiqueEnCours, charger]);

  const changerStatut = async (statut: string) => {
    setEnregistrement(true);
    setMessage('');

    try {
      const token = localStorage.getItem('accessToken');
      const reponse = await fetch(`${API_URL}/api/order-management/${storeId}/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: statut }),
      });

      const donnees = await reponse.json();

      if (!reponse.ok) {
        setMessage(`❌ ${donnees.error || 'Changement de statut impossible'}`);
        return;
      }

      setMessage('✅ Statut mis à jour');
      await charger();
    } catch {
      setMessage('❌ Erreur de connexion');
    } finally {
      setEnregistrement(false);
    }
  };

  const ajouterNote = async () => {
    if (!note.trim()) return;

    setEnregistrement(true);
    setMessage('');

    try {
      const token = localStorage.getItem('accessToken');
      const reponse = await fetch(`${API_URL}/api/order-management/${storeId}/${orderId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ notes: note }),
      });

      const donnees = await reponse.json();

      if (!reponse.ok) {
        setMessage(`❌ ${donnees.error || "Impossible d'enregistrer la note"}`);
        return;
      }

      setMessage('✅ Note enregistrée');
      setNote('');
      await charger();
    } catch {
      setMessage('❌ Erreur de connexion');
    } finally {
      setEnregistrement(false);
    }
  };

  if (loading) return <div className="text-center py-8 text-gray-400">Chargement...</div>;

  if (erreur || !commande) {
    return (
      <div className="space-y-4">
        <Link
          href={`/merchant/${orgId}/orders`}
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white"
        >
          <ArrowLeft size={18} /> Retour aux commandes
        </Link>
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-400">
          {erreur || 'Commande introuvable'}
        </div>
      </div>
    );
  }

  const lignes = commande.items || [];
  const sousTotal = lignes.reduce((somme, l) => somme + Number(l.total || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            href={`/merchant/${orgId}/orders`}
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-2"
          >
            <ArrowLeft size={16} /> Retour aux commandes
          </Link>
          <h1 className="text-3xl font-bold">
            Commande {commande.id.slice(-8).toUpperCase()}
          </h1>
          <p className="text-gray-400 mt-1 flex items-center gap-2">
            <Clock size={16} />
            {new Date(commande.createdAt).toLocaleString('fr-FR')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Le ticket s'imprime depuis une page à part : imprimer d'ici
              sortirait la barre latérale et le menu avec lui. */}
          <button
            onClick={() =>
              window.open(
                `/impression/commande/${orderId}?storeId=${storeId}&format=ticket`,
                '_blank',
                'width=460,height=820'
              )
            }
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-lg text-sm font-medium transition-colors"
          >
            <Printer size={16} /> Imprimer le ticket
          </button>
          <span
            className={`px-4 py-2 rounded-full text-sm font-medium ${
              COULEURS[commande.status] || 'bg-gray-500/20 text-gray-400'
            }`}
          >
            {STATUTS.find((s) => s.valeur === commande.status)?.libelle || commande.status}
          </span>
        </div>
      </div>

      {message && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm">{message}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 lg:col-span-2">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Package size={20} className="text-blue-500" />
            Articles ({lignes.length})
          </h2>

          {lignes.length === 0 ? (
            <p className="text-gray-400">Aucun article enregistré sur cette commande</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-gray-400 border-b border-gray-700">
                  <tr>
                    <th className="text-left py-2">Produit</th>
                    <th className="text-center py-2">Qté</th>
                    <th className="text-right py-2">Prix unitaire</th>
                    <th className="text-right py-2">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {lignes.map((ligne) => (
                    <tr key={ligne.id}>
                      <td className="py-3">
                        {/* La catégorie en surtitre : « 4 fromages » seul ne
                            dit pas s'il s'agit des pâtes ou de la pizza. */}
                        {intituleDeLaLigne(ligne).categorie && (
                          <span className="block text-xs text-gray-500">
                            {intituleDeLaLigne(ligne).categorie}
                          </span>
                        )}
                        {intituleDeLaLigne(ligne).plat}
                        {intituleDeLaLigne(ligne).declinaison && (
                          <span className="text-orange-400">
                            {' '}
                            — {intituleDeLaLigne(ligne).declinaison}
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-center">{ligne.quantity}</td>
                      <td className="py-3 text-right">{euro(ligne.price)}</td>
                      <td className="py-3 text-right font-medium">{euro(ligne.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-gray-700 space-y-2 text-sm">
            <div className="flex justify-between text-gray-400">
              <span>Sous-total</span>
              <span>{euro(sousTotal)}</span>
            </div>
            {Number(commande.feesAmount) > 0 && (
              <div className="flex justify-between text-gray-400">
                <span>Frais de livraison</span>
                <span>{euro(commande.feesAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-700">
              <span>Total TTC</span>
              <span className="text-green-400">{euro(commande.totalAmount)}</span>
            </div>

            {/* La TVA est comprise dans le prix : elle s'extrait du total, elle
                ne s'y ajoute pas. Elle valait zéro sur toute commande, faute
                d'être calculée au serveur — le taux réglé ne servait à rien. */}
            {Number(commande.taxAmount) > 0 ? (
              <div className="pt-2 border-t border-gray-700 space-y-1 text-gray-400">
                <div className="flex justify-between">
                  <span>Total HT</span>
                  <span>{euro(Number(commande.totalAmount) - Number(commande.taxAmount))}</span>
                </div>
                <div className="flex justify-between">
                  <span>
                    dont TVA
                    {Number(commande.taxRate) > 0 ? ` ${Number(commande.taxRate)} %` : ''}
                  </span>
                  <span>{euro(commande.taxAmount)}</span>
                </div>
              </div>
            ) : (
              <p className="pt-2 text-xs text-gray-500">
                Aucune TVA sur cette commande.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <User size={20} className="text-purple-500" />
              Client
            </h2>
            <p className="font-medium">{commande.customerName}</p>
            <p className="text-sm text-gray-400 break-all">{commande.customerEmail}</p>
            <p className="text-sm text-gray-400">{commande.customerPhone}</p>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <MapPin size={20} className="text-orange-500" />
              {commande.deliveryType === 'DELIVERY' ? 'Livraison' : 'Retrait'}
            </h2>
            {commande.deliveryType === 'DELIVERY' ? (
              <div className="text-sm text-gray-300 space-y-1">
                <p>{commande.deliveryAddress || 'Adresse non renseignée'}</p>
                <p>
                  {[commande.deliveryPostal, commande.deliveryCity].filter(Boolean).join(' ') ||
                    'Ville non renseignée'}
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-300">
                {commande.pickupTime
                  ? new Date(commande.pickupTime).toLocaleString('fr-FR')
                  : 'Heure de retrait non précisée'}
              </p>
            )}
            <p className="text-sm text-gray-400 mt-3">
              Paiement : <span className="text-gray-200">{commande.paymentStatus}</span>
            </p>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
            <h2 className="text-lg font-bold mb-4">Changer le statut</h2>
            <div className="grid grid-cols-2 gap-2">
              {STATUTS.map((statut) => (
                <button
                  key={statut.valeur}
                  onClick={() => changerStatut(statut.valeur)}
                  disabled={enregistrement || commande.status === statut.valeur}
                  className={`px-3 py-2 rounded-lg text-sm transition-colors disabled:opacity-40 ${
                    commande.status === statut.valeur
                      ? 'bg-gray-600 text-white'
                      : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  {statut.libelle}
                </button>
              ))}
            </div>
          </div>

          <Link
            href={`/merchant/${orgId}/invoices/${commande.id}`}
            className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
          >
            <FileText size={18} /> Voir la facture
          </Link>
        </div>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <StickyNote size={20} className="text-yellow-500" />
          Note interne
        </h2>
        {commande.notes && (
          <p className="text-sm text-gray-300 bg-gray-700 rounded-lg p-3 mb-3 whitespace-pre-wrap">
            {commande.notes}
          </p>
        )}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Ajouter une note visible uniquement par votre équipe"
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-orange-500"
        />
        <button
          onClick={ajouterNote}
          disabled={enregistrement || !note.trim()}
          className="mt-3 px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 rounded-lg font-medium transition-colors"
        >
          Enregistrer la note
        </button>
      </div>
    </div>
  );
}
