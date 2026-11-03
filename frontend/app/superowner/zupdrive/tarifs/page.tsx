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
const TARIF_PILOTE_NAMUR: Record<Champ, string> = {
  priseEnChargeCentimes: '0,00',
  parKmCentimes: '1,90',
  parMinuteCentimes: '0,00',
  minimumCentimes: '8,20',
};

interface Tarif extends Record<Champ, number> {
  region: string;
  categorie: 'STANDARD' | 'XL';
  actif: boolean;
}

const cleTarif = (tarif: Pick<Tarif, 'region' | 'categorie'>) => `${tarif.region}:${tarif.categorie}`;

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
            cleTarif(tarif),
            { ...Object.fromEntries(CHAMPS.map((c) => [c, tarif.region === 'WALLONIE' ? TARIF_PILOTE_NAMUR[c] : enEuros(tarif[c])])), actif: tarif.actif } as Record<Champ, string> & {
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

  const enregistrer = async (tarif: Tarif) => {
    const region = tarif.region;
    const cle = cleTarif(tarif);
    setErreur('');
    setMessage('');
    const saisie = saisies[cle];
    const valeurs: Record<string, number | boolean> = { actif: saisie.actif };
    for (const champ of CHAMPS) {
      const centimes = centimesDe(saisie[champ]);
      if (centimes === null) {
        setErreur(t('montantInvalide', { champ: t(`champ.${champ}`) }));
        return;
      }
      valeurs[champ] = centimes;
    }
    setEnvoi(cle);
    try {
      await appelerZupDrive(`/api/zupdrive/admin/tarifs/${region}${tarif.categorie === 'XL' ? '/XL' : ''}`, { method: 'PUT', corps: valeurs });
      setMessage(`${tarif.categorie} · ${t(`region.${region}`)} enregistré`);
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
          const cle = cleTarif(tarif);
          const saisie = saisies[cle];
          if (!saisie) return null;
          return (
            <section key={cle} className="space-y-3 rounded-lg border border-gray-200 bg-white p-5" data-region={tarif.region} data-categorie={tarif.categorie}>
              <h2 className="text-lg font-semibold text-gray-900">{t(`region.${tarif.region}`)} · {tarif.categorie} ({tarif.categorie === 'XL' ? '5–6 passagers' : '1–4 passagers'})</h2>
              {tarif.region === 'WALLONIE' && <p className="text-sm text-amber-800">{t('tarifReglementeNamur')}</p>}
              {CHAMPS.map((champ) => (
                <label key={champ} className="block text-sm">
                  <span className="text-gray-500">{t(`champ.${champ}`)}</span>
                  <input
                    name={`${cle}-${champ}`}
                    inputMode="decimal"
                    value={saisie[champ]}
                    readOnly={tarif.region === 'WALLONIE'}
                    onChange={(e) => setSaisies({ ...saisies, [cle]: { ...saisie, [champ]: e.target.value } })}
                    className={`mt-1 w-full rounded-sm border border-gray-300 px-3 py-2 text-gray-900 ${tarif.region === 'WALLONIE' ? 'bg-gray-100' : 'bg-white'}`}
                  />
                </label>
              ))}
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  name={`${cle}-actif`}
                  checked={saisie.actif}
                  onChange={(e) => setSaisies({ ...saisies, [cle]: { ...saisie, actif: e.target.checked } })}
                />
                {t('actif')}
              </label>
              <button
                type="button"
                onClick={() => enregistrer(tarif)}
                disabled={envoi !== null}
                className="w-full rounded-sm bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
              >
                {envoi === cle ? t('enregistrement') : t('enregistrer')}
              </button>
            </section>
          );
        })}
      </div>
    </div>
  );
}
