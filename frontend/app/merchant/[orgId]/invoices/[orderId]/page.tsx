'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Printer } from 'lucide-react';
import { useCurrentStore } from '@/lib/current-store';
import { euro } from '@/lib/format';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface LigneFacture {
  description: string;
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
    city?: string | null;
  };
  customerInfo: { name: string; email: string; phone: string };
  items: LigneFacture[];
  subtotal: number;
  tax: number;
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
      const reponse = await fetch(`${API_URL}/api/invoices/${storeId}/${orderId}`, {
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

  useEffect(() => {
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
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-lg font-medium transition-colors"
        >
          <Printer size={18} /> Imprimer / PDF
        </button>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 space-y-8 print:bg-white print:text-black">
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
            <p className="font-bold">{facture.storeInfo.name}</p>
            {facture.storeInfo.address && <p>{facture.storeInfo.address}</p>}
            {facture.storeInfo.city && <p>{facture.storeInfo.city}</p>}
            {facture.storeInfo.phone && <p>{facture.storeInfo.phone}</p>}
            {facture.storeInfo.email && <p className="break-all">{facture.storeInfo.email}</p>}
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
                      {ligne.description}
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
            <div className="flex justify-between text-gray-400 print:text-gray-700">
              <span>TVA</span>
              <span>{euro(facture.tax)}</span>
            </div>
            <div className="flex justify-between text-gray-400 print:text-gray-700">
              <span>Frais</span>
              <span>{euro(facture.fees)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-700 print:border-gray-300">
              <span>Total</span>
              <span className="text-green-400 print:text-black">{euro(facture.total)}</span>
            </div>
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
