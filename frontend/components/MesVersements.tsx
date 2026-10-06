'use client';

/**
 * Ce qu'on doit au livreur, et ce qu'on lui a versé.
 *
 * Son écran de revenus annonçait un total gagné, sans jamais dire si l'argent
 * était arrivé. Trois montants remplacent ce chiffre unique : ce qui n'est pas
 * encore arrêté, ce qui l'est et attend le virement, ce qui est sur son compte.
 */

import { useCallback, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Banknote, Clock, FileText, Hourglass } from 'lucide-react';

import { euro } from '@/lib/format';
import { useDonneesModifiees } from '@/lib/temps-reel';
import { useEffectChargement } from '@/lib/use-effect-chargement';

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

const jour = (date: string | Date, locale: string) => new Date(date).toLocaleDateString(locale);

/** La période se lit « du 6 au 12 janvier », la borne de fin étant exclue. */
const bornesDuReleve = (releve: Releve, locale: string) => {
  const fin = new Date(releve.periodEnd);
  fin.setDate(fin.getDate() - 1);

  return { debut: jour(releve.periodStart, locale), fin: jour(fin, locale) };
};

export function MesVersements() {
  const t = useTranslations('mesVersements');
  const locale = useLocale();
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

  useEffectChargement(() => {
    charger();
  }, [charger]);

  // La plateforme verse ou annule : le livreur le voit sans recharger.
  useDonneesModifiees(['payouts', 'drivers'], charger);

  if (!situation) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-500 text-sm">{t('notYetStopped')}</p>
            <Hourglass size={18} className="text-gray-500" />
          </div>
          <p className="text-3xl font-bold">{euro(situation.duNonArrete)}</p>
          <p className="text-xs text-gray-500 mt-1">
            {situation.coursesDues} {t('course', { count: situation.coursesDues })} {t('pendingStop')}
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-500 text-sm">{t('pendingPayout')}</p>
            <Clock size={18} className="text-amber-500" />
          </div>
          <p className="text-3xl font-bold text-amber-700">
            {euro(situation.enAttenteDeVersement)}
          </p>
          <p className="text-xs text-gray-500 mt-1">{t('reportStoppedTransferComing')}</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-500 text-sm">{t('alreadyPaid')}</p>
            <Banknote size={18} className="text-green-500" />
          </div>
          <p className="text-3xl font-bold text-green-600">{euro(situation.verse)}</p>
          <p className="text-xs text-gray-500 mt-1">{t('onYourAccount')}</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <FileText size={20} className="text-orange-500" />
          {t('yourReports')}
        </h2>

        {situation.releves.length === 0 ? (
          <p className="text-gray-500 text-sm">
            {t('noReportsYet')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-gray-500 border-b border-gray-200">
                <tr>
                  <th className="text-left py-2">{t('period')}</th>
                  <th className="text-right py-2">{t('deliveries')}</th>
                  <th className="text-right py-2">{t('amount')}</th>
                  <th className="text-left py-2 pl-4">{t('status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {situation.releves.map((releve) => (
                  <tr key={releve.id}>
                    <td className="py-3">{t('periode', bornesDuReleve(releve, locale))}</td>
                    <td className="py-3 text-right text-gray-500">{releve.deliveryCount}</td>
                    <td className="py-3 text-right font-bold">{euro(releve.amount)}</td>
                    <td className="py-3 pl-4">
                      {releve.status === 'PAID' ? (
                        <span className="text-green-600">
                          {t('paidOn')} {jour(releve.paidAt as string, locale)}
                          {releve.methodLibelle ? ` · ${releve.methodLibelle}` : ''}
                          {releve.reference ? ` · ${releve.reference}` : ''}
                        </span>
                      ) : (
                        <span className="text-amber-700">{t('pendingPayout')}</span>
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
