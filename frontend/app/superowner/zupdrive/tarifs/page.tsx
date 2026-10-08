'use client';

/**
 * ZupDrive — le tarif des courses, région par région.
 *
 * Saisis en euros (« 2,50 »), envoyés en centimes entiers : la conversion
 * découpe le texte, sans calcul à virgule flottante. Le serveur valide,
 * enregistre et journalise ; le prix d'une course est ensuite calculé par
 * lui seul.
 */

import { useCallback, useState } from 'react';
import { Euro } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useEffectChargement } from '@/lib/use-effect-chargement';
import { appelerZupDrive } from '@/lib/zupdrive';

const CHAMPS = ['priseEnChargeCentimes', 'parKmCentimes', 'parMinuteCentimes', 'minimumCentimes'] as const;
type Champ = (typeof CHAMPS)[number];

interface Tarif extends Record<Champ, number> {
  region: string;
  actif: boolean;
}

/** « 2,50 » → 250 ; null si ce n'est pas un montant (2 décimales au plus). */
function centimesDe(saisie: string): number | null {
  const texte = saisie.trim().replace(',', '.');
  const morceaux = /^(\d{1,4})(?:\.(\d{1,2}))?$/.exec(texte);
  if (!morceaux) return null;
  return Number(morceaux[1]) * 100 + Number((morceaux[2] || '').padEnd(2, '0'));
}

const enEuros = (centimes: number) => `${Math.floor(centimes / 100)},${String(centimes % 100).padStart(2, '0')}`;

export default function TarifsDrivePage() {
  const t = useTranslations('superownerTarifsDrive');
  const [tarifs, setTarifs] = useState<Tarif[]>([]);
  const [saisies, setSaisies] = useState<Record<string, Record<Champ, string> & { actif: boolean }>>({});
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const [envoi, setEnvoi] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const lus = await appelerZupDrive<Tarif[]>('/api/zupdrive/admin/tarifs');
      setTarifs(lus);
      setSaisies(
        Object.fromEntries(
          lus.map((tarif) => [
            tarif.region,
            { ...Object.fromEntries(CHAMPS.map((c) => [c, enEuros(tarif[c])])), actif: tarif.actif } as Record<Champ, string> & {
              actif: boolean;
            },
          ])
        )
      );
    } catch (err) {
      setErreur(err instanceof Error ? err.message : t('erreur'));
    }
  }, [t]);

  useEffectChargement(() => {
    charger();
  }, [charger]);

  const enregistrer = async (region: string) => {
    setErreur('');
    setMessage('');
    const saisie = saisies[region];
    const valeurs: Record<string, number | boolean> = { actif: saisie.actif };
    for (const champ of CHAMPS) {
      const centimes = centimesDe(saisie[champ]);
      if (centimes === null) {
        setErreur(t('montantInvalide', { champ: t(`champ.${champ}`) }));
        return;
      }
      valeurs[champ] = centimes;
    }
    setEnvoi(region);
    try {
      await appelerZupDrive(`/api/zupdrive/admin/tarifs/${region}`, { method: 'PUT', corps: valeurs });
      setMessage(t('enregistre', { region: t(`region.${region}`) }));
      await charger();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : t('erreur'));
    } finally {
      setEnvoi(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold text-gray-900">
          <Euro className="h-8 w-8" />
          {t('titre')}
        </h1>
        <p className="mt-2 text-gray-500">{t('sousTitre')}</p>
      </div>

      {erreur && <div role="alert" className="rounded-lg border border-red-500/20 bg-red-50 p-4 text-red-600">{erreur}</div>}
      {message && <div role="status" className="rounded-lg border border-green-500/20 bg-green-50 p-4 text-green-700">{message}</div>}

      <div className="grid gap-4 lg:grid-cols-3">
        {tarifs.map((tarif) => {
          const saisie = saisies[tarif.region];
          if (!saisie) return null;
          return (
            <section key={tarif.region} className="space-y-3 rounded-lg border border-gray-200 bg-white p-5" data-region={tarif.region}>
              <h2 className="text-lg font-semibold text-gray-900">{t(`region.${tarif.region}`)}</h2>
              {CHAMPS.map((champ) => (
                <label key={champ} className="block text-sm">
                  <span className="text-gray-500">{t(`champ.${champ}`)}</span>
                  <input
                    name={`${tarif.region}-${champ}`}
                    inputMode="decimal"
                    value={saisie[champ]}
                    onChange={(e) => setSaisies({ ...saisies, [tarif.region]: { ...saisie, [champ]: e.target.value } })}
                    className="mt-1 w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-gray-900"
                  />
                </label>
              ))}
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  name={`${tarif.region}-actif`}
                  checked={saisie.actif}
                  onChange={(e) => setSaisies({ ...saisies, [tarif.region]: { ...saisie, actif: e.target.checked } })}
                />
                {t('actif')}
              </label>
              <button
                type="button"
                onClick={() => enregistrer(tarif.region)}
                disabled={envoi !== null}
                className="w-full rounded-sm bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
              >
                {envoi === tarif.region ? t('enregistrement') : t('enregistrer')}
              </button>
            </section>
          );
        })}
      </div>
    </div>
  );
}
