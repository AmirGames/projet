'use client';

/**
 * ZupDrive — la commission de la plateforme.
 *
 * C'est la seule valeur lue par les paiements (PlatformSettingsDrive) : le serveur l'applique à chaque
 * paiement créé et la fige sur ce paiement, un changement ne touche donc jamais un paiement existant. Les tarifs
 * des courses se règlent région par région, sur leur page.
 */

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Loader2, Percent } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useEffectChargement } from '@/lib/use-effect-chargement';
import { appelerZupDrive } from '@/lib/zupdrive';

/** Un entier de 0 à 100, comme le serveur l'exige ; null sinon. */
function pourcentageDe(saisie: string): number | null {
  if (!/^\d{1,3}$/.test(saisie.trim())) return null;
  const valeur = Number(saisie);
  return valeur >= 0 && valeur <= 100 ? valeur : null;
}

export default function ConfigurationDrivePage() {
  const t = useTranslations('superownerConfigDrive');
  const [enVigueur, setEnVigueur] = useState<number | null>(null);
  const [saisie, setSaisie] = useState('');
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(async () => {
    try {
      const lu = await appelerZupDrive<{ commissionPercentage: number }>('/api/zupdrive/finance/admin/settings/commission');
      setEnVigueur(lu.commissionPercentage);
      setSaisie(String(lu.commissionPercentage));
    } catch (err) {
      setErreur(err instanceof Error ? err.message : t('erreur'));
    }
  }, [t]);

  useEffectChargement(() => {
    void charger();
  }, [charger]);

  const enregistrer = async () => {
    setErreur('');
    setMessage('');
    const valeur = pourcentageDe(saisie);
    if (valeur === null) {
      setErreur(t('pourcentageInvalide'));
      return;
    }
    setEnvoi(true);
    try {
      await appelerZupDrive('/api/zupdrive/finance/admin/settings/commission', {
        method: 'POST',
        corps: { commissionPercentage: valeur },
      });
      setEnVigueur(valeur);
      setMessage(t('enregistree', { valeur }));
    } catch (err) {
      setErreur(err instanceof Error ? err.message : t('erreur'));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">{t('titre')}</h1>
        <p className="mt-2 text-gray-600">{t('sousTitre')}</p>
      </div>

      {erreur && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {erreur}
        </p>
      )}
      {message && (
        <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {message}
        </p>
      )}

      <section className="rounded-2xl bg-white p-6 shadow-xs ring-1 ring-gray-200" data-commission={enVigueur ?? ''}>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          <Percent className="h-5 w-5 text-blue-600" />
          {t('commission')}
        </h2>
        <p className="mt-1 text-sm text-gray-600">{t('commissionAide')}</p>
        {enVigueur === null && !erreur ? (
          <Loader2 className="mt-4 h-5 w-5 animate-spin" />
        ) : (
          <div className="mt-4 flex items-end gap-3">
            <label className="text-sm text-gray-700">
              {t('pourcentage')}
              <input
                inputMode="numeric"
                value={saisie}
                onChange={(e) => setSaisie(e.target.value)}
                className="mt-1 block w-28 rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
              />
            </label>
            <button
              type="button"
              onClick={enregistrer}
              disabled={envoi || enVigueur === null}
              className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {envoi ? t('enregistrement') : t('enregistrer')}
            </button>
          </div>
        )}
        <p className="mt-3 text-xs text-gray-500">{t('paiementsExistants')}</p>
      </section>

      <p className="text-sm text-gray-600">
        {t('tarifsAide')}{' '}
        <Link href="/superowner/zupdrive/tarifs" className="font-medium text-blue-600 hover:underline">
          {t('versTarifs')}
        </Link>
      </p>
    </div>
  );
}
