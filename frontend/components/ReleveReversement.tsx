import { euro } from '@/lib/format';
import { useLocale, useTranslations } from 'next-intl';

export interface Releve {
  id: string;
  organization: string;
  periodStart: string;
  periodEnd: string;
  orderCount: number;
  amount: number;
  status: string;
  paidAt?: string | null;
  reference?: string | null;
  ibanFin?: string | null;
  lines: { code: string; libelle: string; montant: number; nombre?: number }[];
  legend: { code: string; explication: string }[];
}

/** Les états d'un relevé qui ont un libellé (`etats.*` des traductions). */
const ETATS = ['PENDING', 'PAID', 'CARRIED', 'CANCELLED'];

/**
 * Un relevé de reversement, comme une fiche de paie : chaque ligne avec son
 * code, le net, puis l'explication des codes en bas.
 */
export default function ReleveReversement({ releve }: { releve: Releve }) {
  const t = useTranslations('releveReversement');
  const locale = useLocale();
  const veille = new Date(new Date(releve.periodEnd).getTime() - 1);

  return (
    <div className="bg-white text-gray-900 rounded-lg p-6 font-mono text-sm">
      <div className="flex flex-wrap justify-between gap-2 border-b border-gray-300 pb-3 mb-3">
        <div>
          <p className="font-bold text-base font-sans">{t('titre')}</p>
          <p className="font-sans">{releve.organization}</p>
        </div>
        <div className="text-right font-sans text-xs text-gray-600">
          <p>
            {t('periode', { debut: new Date(releve.periodStart).toLocaleDateString(locale), fin: veille.toLocaleDateString(locale) })}
          </p>
          <p>{t('commandes', { n: releve.orderCount })}</p>
        </div>
      </div>

      <table className="w-full">
        <tbody>
          {releve.lines.map((l) => (
            <tr key={l.code}>
              <td className="py-1 pr-3 text-gray-500 w-12">{l.code}</td>
              <td className="py-1">
                {l.libelle}
                {l.nombre ? <span className="text-gray-500"> ({l.nombre})</span> : null}
              </td>
              <td className={`py-1 text-right whitespace-nowrap ${l.montant < 0 ? 'text-red-700' : ''}`}>
                {euro(l.montant)}
              </td>
            </tr>
          ))}
          <tr className="border-t-2 border-gray-900 font-bold">
            <td className="pt-2" />
            <td className="pt-2">{t('net')}</td>
            <td className={`pt-2 text-right whitespace-nowrap ${releve.amount < 0 ? 'text-red-700' : ''}`}>
              {euro(releve.amount)}
            </td>
          </tr>
        </tbody>
      </table>

      <p className="mt-3 font-sans text-xs text-gray-600">
        {ETATS.includes(releve.status) ? t(`etats.${releve.status}`) : releve.status}
        {releve.paidAt ? t('le', { date: new Date(releve.paidAt).toLocaleDateString(locale) }) : ''}
        {releve.ibanFin ? t('compte', { fin: releve.ibanFin }) : ''}
      </p>

      {releve.legend.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-300 space-y-1 text-xs">
          <p className="font-sans font-semibold">{t('explication')}</p>
          {releve.legend.map((l) => (
            <p key={l.code}>
              <span className="text-gray-500">{l.code}</span> <span className="font-sans">{l.explication}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
