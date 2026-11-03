'use client';

import { useLocale, useTranslations } from 'next-intl';

export interface RemboursementCommande {
  status: string;
  amountCents?: number;
  currency?: string;
}

export function EtatRemboursement({ operation }: { operation?: RemboursementCommande | null }) {
  const t = useTranslations('incidentsCommande');
  const locale = useLocale();
  if (!operation) return null;
  const montant = operation.amountCents !== undefined && operation.currency
    ? new Intl.NumberFormat(locale, { style: 'currency', currency: operation.currency }).format(operation.amountCents / 100) : '';
  return <p role="status" className="mt-2 text-sm font-semibold">
    {t(`remboursementStatuts.${operation.status}`)}{montant && ` · ${montant}`}
    {operation.status === 'SUCCEEDED' && <span className="block text-xs font-normal">{t('delaiBancaire')}</span>}
  </p>;
}
