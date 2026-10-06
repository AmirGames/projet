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
import { euro, montantCommercant } from '@/lib/format';
import { intituleDeLaLigne } from '@/lib/ligne-commande';
import { ReponseCommande } from '@/components/ReponseCommande';
import { EVENEMENT_COMMANDES_CHANGEES } from '@/lib/reponse-commande';
import { useDonneesModifiees } from '@/lib/temps-reel';

import { useLocale, useTranslations } from 'next-intl';
import { numeroCourt } from '@/lib/numero-commande';
import { useEffectChargement } from '@/lib/use-effect-chargement';
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
  /** Les suppléments payés, figés à la commande. */
  selectedOptions?: { supplements?: { label: string; price: number }[] } | null;
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
  /** Qui livre : le commerçant (OWN) ou un livreur de la plateforme (PLATFORM). */
  deliveryMode?: 'OWN' | 'PLATFORM' | null;
  /** Les frais de service payés par le client : ils sont à la plateforme. */
  serviceFeeAmount?: number | string;
  /** La remise du code promo : c'est le commerçant qui l'accorde. */
  discountAmount?: number | string;
  promoCode?: string | null;
  notes?: string | null;
  createdAt: string;
  items?: LigneCommande[];
  echeance?: string | null;
  estimatedReadyAt?: string | null;
  preparationMinutes?: number | null;
  rejectionReason?: string | null;
  rejectionNote?: string | null;
}

// Le libellé de chaque statut : `statuts.<valeur>` des traductions.
const STATUTS: { valeur: string }[] = [
  { valeur: 'PENDING' },
  { valeur: 'ACCEPTED' },
  { valeur: 'PREPARING' },
  { valeur: 'READY' },
  { valeur: 'COMPLETED' },
  { valeur: 'REJECTED' },
];

const COULEURS: Record<string, string> = {
  PENDING: 'bg-orange-100 text-orange-600',
  ACCEPTED: 'bg-blue-100 text-blue-600',
  PREPARING: 'bg-amber-100 text-amber-600',
  READY: 'bg-purple-100 text-purple-600',
  COMPLETED: 'bg-green-100 text-green-600',
  REJECTED: 'bg-red-100 text-red-600',
};

export default function DetailCommandePage() {
  const t = useTranslations('merchantOrderDetail');
  const locale = useLocale();
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

    // Pas de « Chargement… » à la relecture : la page ne doit pas clignoter à
    // chaque commande qui arrive.
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
        setErreur(donnees.error || t('introuvableBoutique'));
        setCommande(null);
        return;
      }

      setCommande(donnees.order || donnees);
    } catch {
      setErreur(t('chargementCommande'));
    } finally {
      setLoading(false);
    }
  }, [storeId, orderId, t]);

  useEffectChargement(() => {
    if (!boutiqueEnCours) charger();
  }, [boutiqueEnCours, charger]);

  // Un collègue a répondu, ou le délai de réponse a expiré : on relit.
  useEffect(() => {
    window.addEventListener(EVENEMENT_COMMANDES_CHANGEES, charger);
    return () => window.removeEventListener(EVENEMENT_COMMANDES_CHANGEES, charger);
  }, [charger]);

  // Le livreur la récupère, le client l'annule, un collègue ajoute une note :
  // la fiche suit.
  useDonneesModifiees('orders', charger, { id: orderId, actif: Boolean(storeId && orderId) });

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

      setMessage(t('noteEnregistree'));
      setNote('');
      await charger();
    } catch {
      setMessage(t('connectionErrorFinal'));
    } finally {
      setEnregistrement(false);
    }
  };

  if (loading) return <div className="text-center py-8 text-gray-500">{t('chargement')}</div>;

  if (erreur || !commande) {
    return (
      <div className="space-y-4">
        <Link
          href={`/merchant/${orgId}/orders`}
          className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft size={18} /> {t('retour')}
        </Link>
        <div className="bg-red-100 border border-red-500/50 rounded-lg p-4 text-red-600">
          {erreur || t('introuvable')}
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
            className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-900 text-sm mb-2"
          >
            <ArrowLeft size={16} /> {t('retour')}
          </Link>
          <h1 className="text-3xl font-bold">
            {t('commandeNumero', { numero: numeroCourt(commande.id) })}
          </h1>
          <p className="text-gray-500 mt-1 flex items-center gap-2">
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
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white hover:bg-orange-500 rounded-lg text-sm font-medium transition-colors"
          >
            <Printer size={16} /> {t('imprimerTicket')}
          </button>
          <span
            className={`px-4 py-2 rounded-full text-sm font-medium ${
              COULEURS[commande.status] || 'bg-gray-500/20 text-gray-500'
            }`}
          >
            {STATUTS.some((s) => s.valeur === commande.status) ? t(`statuts.${commande.status}`) : commande.status}
          </span>
        </div>
      </div>

      {message && (
        <div className="bg-white border border-gray-200 rounded-lg p-3 text-sm">{message}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-6 lg:col-span-2">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Package size={20} className="text-blue-500" />
            {t('articles', { n: lignes.length })}
          </h2>

          {lignes.length === 0 ? (
            <p className="text-gray-500">{t('aucunArticle')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-gray-500 border-b border-gray-200">
                  <tr>
                    <th className="text-left py-2">{t('produit')}</th>
                    <th className="text-center py-2">{t('qte')}</th>
                    <th className="text-right py-2">{t('prixUnitaire')}</th>
                    <th className="text-right py-2">{t('total')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
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
                          <span className="text-orange-600">
                            {' '}
                            — {intituleDeLaLigne(ligne).declinaison}
                          </span>
                        )}
                        {intituleDeLaLigne(ligne).supplements && (
                          <span className="block text-xs text-gray-500">
                            + {intituleDeLaLigne(ligne).supplements}
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

          <div className="mt-4 pt-4 border-t border-gray-200 space-y-2 text-sm">
            <div className="flex justify-between text-gray-500">
              <span>{t('sousTotal')}</span>
              <span>{euro(sousTotal)}</span>
            </div>
            {Number(commande.discountAmount) > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>{commande.promoCode ? t('remiseCode', { code: commande.promoCode }) : t('remise')}</span>
                <span>−{euro(commande.discountAmount)}</span>
              </div>
            )}
            {/* Ce que la commande lui rapporte : ses articles, remise déduite.
                Le total payé par le client (livraison et frais de service
                compris) passait pour son montant : 15 € d'articles
                s'affichaient 20,25 €. */}
            <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-200">
              <span>{t('montant')}</span>
              <span className="text-green-600">{euro(montantCommercant(commande))}</span>
            </div>
            {/* Il livre lui-même : la livraison est à lui, sur sa propre ligne. */}
            {commande.deliveryMode !== 'PLATFORM' && Number(commande.feesAmount) > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>{t('fraisLivraison')}</span>
                <span>{euro(commande.feesAmount)}</span>
              </div>
            )}

            {/* Ce qui ne lui revient pas : pour information seulement. */}
            {(Number(commande.serviceFeeAmount) > 0 ||
              (commande.deliveryMode === 'PLATFORM' && Number(commande.feesAmount) > 0)) && (
              <div className="pt-2 border-t border-gray-200 space-y-1 text-xs text-gray-500">
                <div className="flex justify-between">
                  <span>{t('payeClient')}</span>
                  <span>{euro(commande.totalAmount)}</span>
                </div>
                {commande.deliveryMode === 'PLATFORM' && Number(commande.feesAmount) > 0 && (
                  <div className="flex justify-between">
                    <span>{t('dontLivraison')}</span>
                    <span>{euro(commande.feesAmount)}</span>
                  </div>
                )}
                {Number(commande.serviceFeeAmount) > 0 && (
                  <div className="flex justify-between">
                    <span>{t('dontService')}</span>
                    <span>{euro(commande.serviceFeeAmount)}</span>
                  </div>
                )}
                <p className="text-amber-700">
                  {t('sommesPasAVous')}
                </p>
              </div>
            )}

            {/* La TVA est comprise dans le prix : elle s'extrait du total, elle
                ne s'y ajoute pas. Elle valait zéro sur toute commande, faute
                d'être calculée au serveur — le taux réglé ne servait à rien. */}
            {Number(commande.taxAmount) > 0 ? (
              <div className="pt-2 border-t border-gray-200 space-y-1 text-gray-500">
                <div className="flex justify-between">
                  <span>{t('totalHt')}</span>
                  <span>{euro(montantCommercant(commande) - Number(commande.taxAmount))}</span>
                </div>
                <div className="flex justify-between">
                  <span>
                    {Number(commande.taxRate) > 0 ? t('dontTvaTaux', { taux: Number(commande.taxRate) }) : t('dontTva')}
                  </span>
                  <span>{euro(commande.taxAmount)}</span>
                </div>
              </div>
            ) : (
              <p className="pt-2 text-xs text-gray-500">
                {t('aucuneTva')}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <User size={20} className="text-purple-500" />
              {t('client')}
            </h2>
            <p className="font-medium">{commande.customerName}</p>
            <p className="text-sm text-gray-500 break-all">{commande.customerEmail}</p>
            <p className="text-sm text-gray-500">{commande.customerPhone}</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <MapPin size={20} className="text-orange-500" />
              {commande.deliveryType === 'DELIVERY' ? t('delivery') : 'Retrait'}
            </h2>
            {commande.deliveryType === 'DELIVERY' ? (
              <div className="text-sm text-gray-700 space-y-1">
                <p>{commande.deliveryAddress || t('adresseNonRenseignee')}</p>
                <p>
                  {[commande.deliveryPostal, commande.deliveryCity].filter(Boolean).join(' ') ||
                    t('cityUnknown')}
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-700">
                {commande.pickupTime
                  ? new Date(commande.pickupTime).toLocaleString(locale)
                  : t('heureNonPrecisee')}
              </p>
            )}
            <p className="text-sm text-gray-500 mt-3">
              {t('paiement')} <span className="text-gray-800">{t.has(`paiements.${commande.paymentStatus}`) ? t(`paiements.${commande.paymentStatus}`) : commande.paymentStatus}</span>
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-lg font-bold mb-4">
              {commande.status === 'PENDING' ? t('accepterRefuser') : t('suivi')}
            </h2>
            {storeId && (
              <ReponseCommande storeId={storeId} commande={commande} surChangement={charger} />
            )}
          </div>

          <Link
            href={`/merchant/${orgId}/invoices/${commande.id}`}
            className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <FileText size={18} /> {t('voirFacture')}
          </Link>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <StickyNote size={20} className="text-yellow-500" />
          {t('noteInterne')}
        </h2>
        {commande.notes && (
          <p className="text-sm text-gray-700 bg-gray-100 rounded-lg p-3 mb-3 whitespace-pre-wrap">
            {commande.notes}
          </p>
        )}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder={t('notePlaceholder')}
          className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-orange-500"
        />
        <button
          onClick={ajouterNote}
          disabled={enregistrement || !note.trim()}
          className="mt-3 px-4 py-2 bg-orange-600 text-white hover:bg-orange-500 disabled:opacity-40 rounded-lg font-medium transition-colors"
        >
          {t('enregistrerNote')}
        </button>
      </div>
    </div>
  );
}
