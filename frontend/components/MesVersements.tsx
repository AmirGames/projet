'use client';

/**
 * Ce qu'on doit au livreur, et ce qu'on lui a versé.
 *
 * Son écran de revenus annonçait un total gagné, sans jamais dire si l'argent
 * était arrivé. Trois montants remplacent ce chiffre unique : ce qui n'est pas
 * encore arrêté, ce qui l'est et attend le virement, ce qui est sur son compte.
 */

import { useCallback, useEffect, useState } from 'react';
import { Banknote, Clock, FileText, Hourglass } from 'lucide-react';

import { euro } from '@/lib/format';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Releve {
  id: string;
  periodStart: string;
  periodEnd: string;
  deliveryCount: number;
  amount: number;
  status: string;
  methodLibelle: string;
  reference: string | null;
  paidAt: string | null;
}

interface Situation {
  duNonArrete: number;
  enAttenteDeVersement: number;
  verse: number;
  coursesDues: number;
  releves: Releve[];
}

const jour = (date: string) => new Date(date).toLocaleDateString('fr-FR');

/** La période se lit « du 6 au 12 janvier », la borne de fin étant exclue. */
const periode = (releve: Releve) => {
  const fin = new Date(releve.periodEnd);
  fin.setDate(fin.getDate() - 1);

  return `du ${jour(releve.periodStart)} au ${fin.toLocaleDateString('fr-FR')}`;
};

export function MesVersements() {
  const [situation, setSituation] = useState<Situation | null>(null);

  const charger = useCallback(async () => {
    try {
      const token = localStorage.getItem('driverToken') || localStorage.getItem('accessToken');
      const reponse = await fetch(`${API_URL}/api/drivers/payouts`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (reponse.ok) {
        const lu = await reponse.json();
        setSituation(lu.data);
      }
    } catch {
      // Le reste de la page reste utile sans ce bloc.
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  if (!situation) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-400 text-sm">Pas encore arrêté</p>
            <Hourglass size={18} className="text-gray-500" />
          </div>
          <p className="text-3xl font-bold">{euro(situation.duNonArrete)}</p>
          <p className="text-xs text-gray-500 mt-1">
            {situation.coursesDues} course{situation.coursesDues > 1 ? 's' : ''} livrée
            {situation.coursesDues > 1 ? 's' : ''} en attente d&apos;arrêté
          </p>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-400 text-sm">En attente de versement</p>
            <Clock size={18} className="text-amber-500" />
          </div>
          <p className="text-3xl font-bold text-amber-300">
            {euro(situation.enAttenteDeVersement)}
          </p>
          <p className="text-xs text-gray-500 mt-1">Relevé arrêté, virement à venir</p>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-400 text-sm">Déjà versé</p>
            <Banknote size={18} className="text-green-500" />
          </div>
          <p className="text-3xl font-bold text-green-400">{euro(situation.verse)}</p>
          <p className="text-xs text-gray-500 mt-1">Sur votre compte</p>
        </div>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <FileText size={20} className="text-orange-500" />
          Vos relevés
        </h2>

        {situation.releves.length === 0 ? (
          <p className="text-gray-400 text-sm">
            Aucun relevé pour le moment. Vos courses livrées y seront regroupées par période.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-gray-400 border-b border-gray-700">
                <tr>
                  <th className="text-left py-2">Période</th>
                  <th className="text-right py-2">Courses</th>
                  <th className="text-right py-2">Montant</th>
                  <th className="text-left py-2 pl-4">État</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {situation.releves.map((releve) => (
                  <tr key={releve.id}>
                    <td className="py-3">{periode(releve)}</td>
                    <td className="py-3 text-right text-gray-400">{releve.deliveryCount}</td>
                    <td className="py-3 text-right font-bold">{euro(releve.amount)}</td>
                    <td className="py-3 pl-4">
                      {releve.status === 'PAID' ? (
                        <span className="text-green-400">
                          Versé le {jour(releve.paidAt as string)}
                          {releve.methodLibelle ? ` · ${releve.methodLibelle}` : ''}
                          {releve.reference ? ` · ${releve.reference}` : ''}
                        </span>
                      ) : (
                        <span className="text-amber-300">En attente de versement</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
