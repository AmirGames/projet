'use client';


import { useCallback, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Printer } from 'lucide-react';
import { useCurrentStore } from '@/lib/current-store';
import { euro } from '@/lib/format';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface LigneFacture {
  description: string;
  /** La catégorie du plat, en surtitre : « 4 fromages » ne dit pas lequel. */
  category?: string | null;
  /** La déclinaison facturée : pennes, grande taille. */
  variant?: string | null;
  sku?: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface Facture {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  storeInfo: {
    name: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    postalCode?: string | null;
    city?: string | null;
    /** Les mentions légales de l'émetteur : sans TVA, ce n'est pas une facture. */
    legalName?: string | null;
    vatNumber?: string | null;
    registrationNumber?: string | null;
    billingAddress?: string | null;
    billingPostalCode?: string | null;
    billingCity?: string | null;
    billingCountry?: string | null;
  };
  customerInfo: { name: string; email: string; phone: string };
  items: LigneFacture[];
  subtotal: number;
  tax: number;
  taxRate: number | null;
  taxDetail?: { taux: number; base: number; taxe: number }[];
  taxIncluded: boolean;
  fees: number;
  total: number;
  paymentStatus: string;
  orderStatus: string;
  deliveryType: string;
  notes?: string | null;
}

export default function FacturePage() {
  const params = useParams();
  const orgId = params?.orgId as string;
  const orderId = params?.orderId as string;
  const { storeId, loading: boutiqueEnCours } = useCurrentStore();

  const [facture, setFacture] = useState<Facture | null>(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState('');

  const charger = useCallback(async () => {
    if (!storeId || !orderId) return;

    setLoading(true);
    setErreur('');

    try {
      const token = localStorage.getItem('accessToken');
      const reponse = await fetch(`${API_URL}/invoices/${storeId}/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const donnees = await reponse.json();

      if (!reponse.ok) {
        setErreur(donnees.error || 'Facture introuvable pour la boutique sélectionnée');
        setFacture(null);
        return;
      }

      setFacture(donnees);
    } catch {
      setErreur('Impossible de charger la facture');
    } finally {
      setLoading(false);
    }
  }, [storeId, orderId]);

  useEffectChargement(() => {
    if (!boutiqueEnCours) charger();
  }, [boutiqueEnCours, charger]);

  if (loading) return <div className="text-center py-8 text-gray-400">Chargement...</div>;

  if (erreur || !facture) {
    return (
      <div className="space-y-4">
        <Link
          href={`/merchant/${orgId}/invoices`}
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white"
        >
          <ArrowLeft size={18} /> Retour aux factures
        </Link>
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-400">
          {erreur || 'Facture introuvable'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Barre d'action masquée à l'impression. */}
      <div className="flex items-center justify-between gap-4 flex-wrap print:hidden">
        <Link
          href={`/merchant/${orgId}/invoices`}
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm"
        >
          <ArrowLeft size={16} /> Retour aux factures
        </Link>
        <div className="flex items-center gap-2">
          {/* L'impression passe par une page dédiée, hors de l'espace
              commerçant : imprimer d'ici emportait la barre latérale, le menu
              et quelques pages blanches. */}
          <button
            onClick={() =>
              window.open(
                `/impression/commande/${orderId}?storeId=${storeId}&format=a4`,
                '_blank',
                'width=900,height=1000'
              )
            }
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-lg font-medium transition-colors"
          >
            <Printer size={18} /> Imprimer la facture (A4)
          </button>
          <button
            onClick={() =>
              window.open(
                `/impression/commande/${orderId}?storeId=${storeId}&format=ticket`,
                '_blank',
                'width=460,height=820'
              )
            }
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
          >
            <Printer size={18} /> Ticket 80 mm
          </button>
        </div>
      </div>

      {/* `zone-impression` : à l'impression, tout le reste du site disparaît. */}
      <div className="zone-impression bg-gray-800 border border-gray-700 rounded-lg p-8 space-y-8 print:bg-white print:text-black">
        <div className="flex justify-between items-start gap-6 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Facture {facture.invoiceNumber}</h1>
            <p className="text-gray-400 print:text-gray-700 text-sm mt-1">
              Émise le {new Date(facture.invoiceDate).toLocaleDateString('fr-FR')}
            </p>
            <p className="text-gray-400 print:text-gray-700 text-sm">
              Échéance le {new Date(facture.dueDate).toLocaleDateString('fr-FR')}
            </p>
          </div>
          <span
            className={`px-4 py-2 rounded-full text-sm font-medium ${
              facture.paymentStatus === 'PAID'
                ? 'bg-green-500/20 text-green-400'
                : 'bg-orange-500/20 text-orange-400'
            }`}
          >
            {facture.paymentStatus === 'PAID' ? 'Payée' : 'En attente de paiement'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
          <div>
            <p className="text-gray-400 print:text-gray-700 uppercase text-xs mb-2">Émetteur</p>
            <p className="font-bold">{facture.storeInfo.legalName || facture.storeInfo.name}</p>
            {facture.storeInfo.legalName && facture.storeInfo.legalName !== facture.storeInfo.name && (
              <p className="text-gray-400 print:text-gray-700">
                Enseigne : {facture.storeInfo.name}
              </p>
            )}
            {facture.storeInfo.address && <p>{facture.storeInfo.address}</p>}
            {(facture.storeInfo.postalCode || facture.storeInfo.city) && (
              <p>{[facture.storeInfo.postalCode, facture.storeInfo.city].filter(Boolean).join(' ')}</p>
            )}
            {facture.storeInfo.phone && <p>{facture.storeInfo.phone}</p>}
            {facture.storeInfo.email && <p className="break-all">{facture.storeInfo.email}</p>}

            {/* Une facture sans numéro de TVA n'en est pas une : elle ne permet
                ni de récupérer la taxe, ni de justifier la dépense. */}
            {facture.storeInfo.vatNumber ? (
              <p className="mt-2">
                <span className="text-gray-400 print:text-gray-700">N° TVA : </span>
                {facture.storeInfo.vatNumber}
              </p>
            ) : (
              <p className="mt-2 text-amber-400 print:hidden text-xs">
                Aucun numéro de TVA : renseignez-le dans{' '}
                <Link href="/merchant/profil" className="underline">
                  votre profil
                </Link>{' '}
                — une facture sans ce numéro n&apos;est pas valable.
              </p>
            )}
            {facture.storeInfo.registrationNumber && (
              <p>
                <span className="text-gray-400 print:text-gray-700">SIRET / BCE : </span>
                {facture.storeInfo.registrationNumber}
              </p>
            )}
          </div>
          <div>
            <p className="text-gray-400 print:text-gray-700 uppercase text-xs mb-2">Client</p>
            <p className="font-bold">{facture.customerInfo.name}</p>
            <p className="break-all">{facture.customerInfo.email}</p>
            <p>{facture.customerInfo.phone}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-700 print:border-gray-300 text-gray-400 print:text-gray-700">
              <tr>
                <th className="text-left py-2">Désignation</th>
                <th className="text-center py-2">Qté</th>
                <th className="text-right py-2">Prix unitaire</th>
                <th className="text-right py-2">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700 print:divide-gray-300">
              {facture.items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-4 text-gray-400 print:text-gray-700">
                    Aucune ligne sur cette facture
                  </td>
                </tr>
              ) : (
                facture.items.map((ligne, index) => (
                  <tr key={`${ligne.description}-${index}`}>
                    <td className="py-3">
                      {ligne.category && (
                        <span className="text-gray-500 print:text-gray-600 text-xs block">
                          {ligne.category}
                        </span>
                      )}
                      {ligne.description}
                      {ligne.variant && <span className="text-gray-400"> — {ligne.variant}</span>}
                      {ligne.sku && (
                        <span className="text-gray-500 text-xs block">Réf. {ligne.sku}</span>
                      )}
                    </td>
                    <td className="py-3 text-center">{ligne.quantity}</td>
                    <td className="py-3 text-right">{euro(ligne.unitPrice)}</td>
                    <td className="py-3 text-right font-medium">{euro(ligne.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          <div className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex justify-between text-gray-400 print:text-gray-700">
              <span>Sous-total</span>
              <span>{euro(facture.subtotal)}</span>
            </div>
            {facture.fees > 0 && (
              <div className="flex justify-between text-gray-400 print:text-gray-700">
                <span>Frais de livraison</span>
                <span>{euro(facture.fees)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-700 print:border-gray-300">
              <span>Total{facture.taxIncluded ? ' TTC' : ''}</span>
              <span className="text-green-400 print:text-black">{euro(facture.total)}</span>
            </div>

            {/* Récapitulatif TVA — multi-taux si la commande en a plusieurs. */}
            {facture.tax > 0 ? (() => {
              const lignes = facture.taxDetail && facture.taxDetail.length > 0
                ? facture.taxDetail
                : [{ taux: facture.taxRate ?? 0, base: facture.total - facture.tax, taxe: facture.tax }];
              return (
                <div className="pt-2 border-t border-gray-700 print:border-gray-300 space-y-1 text-sm text-gray-400 print:text-gray-700">
                  {lignes.map((l) => (
                    <div key={l.taux} className="space-y-0.5">
                      <div className="flex justify-between">
                        <span>Base HT {l.taux} %</span>
                        <span>{euro(l.base - l.taxe)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>TVA {l.taux} %</span>
                        <span>{euro(l.taxe)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })() : (
              <p className="pt-2 text-xs text-gray-500 print:hidden">
                Aucune TVA sur cette commande. Réglez votre taux dans les taxes de la boutique : il
                s&apos;appliquera aux commandes suivantes.
              </p>
            )}
          </div>
        </div>

        {facture.notes && (
          <div className="pt-4 border-t border-gray-700 print:border-gray-300">
            <p className="text-gray-400 print:text-gray-700 uppercase text-xs mb-2">Note</p>
            <p className="text-sm whitespace-pre-wrap">{facture.notes}</p>
          </div>
        )}
      </div>

      <div className="print:hidden">
        <Link
          href={`/merchant/${orgId}/orders/${orderId}`}
          className="text-sm text-gray-400 hover:text-white"
        >
          Voir la commande associée
        </Link>
      </div>
    </div>
  );
}
