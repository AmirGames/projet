'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Layers, Save, Plus, X, Users } from 'lucide-react';

import { euro, parSemaine } from '@/lib/format';

/**
 * La grille tarifaire, réglable.
 *
 * Tarifs, quotas et arguments de vente étaient écrits dans le code : changer
 * un prix demandait une mise en production.
 */

interface Formule {
  code: 'FREE' | 'PREMIUM' | 'PRO';
  libelle: string;
  maxBoutiques: number;
  prixMensuel: number;
  /** Ce que la plateforme prélève sur les ventes, en pourcentage. */
  commission: number;
  /** Le taux quand la plateforme fournit le livreur. */
  commissionLivreursPlateforme: number;
  avantages: string[];
  ordre: number;
  abonnes: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function FormulesPage() {
  const t = useTranslations('superownerFormules');
  const [formules, setFormules] = useState<Formule[]>([]);
  const [brouillons, setBrouillons] = useState<Record<string, Formule>>({});
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const [enregistrement, setEnregistrement] = useState('');

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const jeton = localStorage.getItem('accessToken');
      const reponse = await fetch(`${API_URL}/api/superowner/plans`, {
        headers: { Authorization: `Bearer ${jeton}` },
      });

      const donnees = await reponse.json();

      if (!reponse.ok) {
        setErreur(donnees.error || t('loadError'));
        return;
      }

      const grille: Formule[] = donnees.data || [];
      setFormules(grille);
      setBrouillons(Object.fromEntries(grille.map((formule) => [formule.code, { ...formule }])));
      setErreur('');
    } catch {
      setErreur(t('serverUnreachable'));
    } finally {
      setChargement(false);
    }
  }, [t]);

  useEffect(() => {
    charger();
  }, [charger]);

  const modifier = (code: string, champs: Partial<Formule>) => {
    setBrouillons((precedent) => ({
      ...precedent,
      [code]: { ...precedent[code]!, ...champs },
    }));
  };

  const enregistrer = async (code: string) => {
    const brouillon = brouillons[code];
    if (!brouillon) return;

    setEnregistrement(code);
    setMessage('');
    setErreur('');

    try {
      const jeton = localStorage.getItem('accessToken');
      const reponse = await fetch(`${API_URL}/api/superowner/plans/${code}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jeton}`,
        },
        body: JSON.stringify({
          libelle: brouillon.libelle,
          maxBoutiques: Number(brouillon.maxBoutiques),
          prixMensuel: Number(brouillon.prixMensuel),
          commission: Number(brouillon.commission),
          commissionLivreursPlateforme: Number(brouillon.commissionLivreursPlateforme),
          // Les lignes vides du formulaire ne sont pas des arguments de vente.
          avantages: brouillon.avantages.map((ligne) => ligne.trim()).filter(Boolean),
        }),
      });

      const donnees = await reponse.json();

      if (!reponse.ok) {
        setErreur(donnees.error || t('saveError'));
        return;
      }

      setMessage(donnees.message || t('saved'));
      await charger();
    } catch {
      setErreur(t('serverUnreachable'));
    } finally {
      setEnregistrement('');
    }
  };

  const modifiee = (code: string) =>
    JSON.stringify(brouillons[code]) !== JSON.stringify(formules.find((f) => f.code === code));

  if (chargement) {
    return (
      <div className="p-8 text-gray-400">{t('loading')}</div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Layers size={28} className="text-red-500" />
        <div>
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="text-gray-400 text-sm">
            {t('subtitle')}
          </p>
        </div>
      </div>

      {erreur && (
        <div className="bg-red-900/30 border border-red-700 text-red-200 rounded-lg px-4 py-3">
          {erreur}
        </div>
      )}
      {message && (
        <div className="bg-green-900/30 border border-green-700 text-green-200 rounded-lg px-4 py-3">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {formules.map((formule) => {
          const brouillon = brouillons[formule.code]!;

          return (
            <section
              key={formule.code}
              className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4"
            >
              <div className="flex items-start justify-between">
                <span className="text-xs uppercase tracking-wide text-gray-500">
                  {formule.code}
                </span>
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <Users size={14} />
                  {t('subscribers', { count: formule.abonnes })}
                </span>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1" htmlFor={`nom-${formule.code}`}>
                    {t('displayName')}
                  </label>
                  <input
                    id={`nom-${formule.code}`}
                    value={brouillon.libelle}
                    onChange={(e) => modifier(formule.code, { libelle: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 focus:outline-none focus:border-red-500"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label
                      className="block text-sm text-gray-400 mb-1"
                      htmlFor={`prix-${formule.code}`}
                    >
                      {t('priceMonthly')}
                    </label>
                    <input
                      id={`prix-${formule.code}`}
                      type="number"
                      min={0}
                      step="0.01"
                      value={brouillon.prixMensuel}
                      onChange={(e) =>
                        modifier(formule.code, { prixMensuel: Number(e.target.value) })
                      }
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 focus:outline-none focus:border-red-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {t('priceWeekly', { price: euro(parSemaine(brouillon.prixMensuel)) })}
                    </p>
                  </div>

                  <div>
                    <label
                      className="block text-sm text-gray-400 mb-1"
                      htmlFor={`quota-${formule.code}`}
                    >
                      {t('stores')}
                    </label>
                    <input
                      id={`quota-${formule.code}`}
                      type="number"
                      min={1}
                      value={brouillon.maxBoutiques}
                      onChange={(e) =>
                        modifier(formule.code, { maxBoutiques: Number(e.target.value) })
                      }
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 focus:outline-none focus:border-red-500"
                    />
                  </div>

                  {/* La commission n'était réglable qu'en global : le même taux
                      pour tous, quel que soit l'abonnement payé. */}
                  <div>
                    <label
                      className="block text-sm text-gray-400 mb-1"
                      htmlFor={`commission-${formule.code}`}
                    >
                      {t('commission')}
                    </label>
                    <input
                      id={`commission-${formule.code}`}
                      type="number"
                      min={0}
                      max={100}
                      step="0.1"
                      value={brouillon.commission}
                      onChange={(e) =>
                        modifier(formule.code, { commission: Number(e.target.value) })
                      }
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>

                {/* Plus élevée que la précédente : la plateforme fournit le
                    livreur, et lui reverse les frais de livraison. */}
                <div>
                  <label
                    className="block text-sm text-gray-400 mb-1"
                    htmlFor={`commission-plateforme-${formule.code}`}
                  >
                    {t('platformCommission')}
                  </label>
                  <input
                    id={`commission-plateforme-${formule.code}`}
                    type="number"
                    min={brouillon.commission}
                    max={100}
                    step="0.1"
                    value={brouillon.commissionLivreursPlateforme}
                    onChange={(e) =>
                      modifier(formule.code, { commissionLivreursPlateforme: Number(e.target.value) })
                    }
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 focus:outline-none focus:border-red-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">{t('platformCommissionHelp')}</p>
                </div>

                <div>
                  <span className="block text-sm text-gray-400 mb-1">{t('sellingPoints')}</span>
                  <div className="space-y-2">
                    {brouillon.avantages.map((avantage, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          value={avantage}
                          aria-label={`Argument ${index + 1} de ${formule.code}`}
                          onChange={(e) => {
                            const copie = [...brouillon.avantages];
                            copie[index] = e.target.value;
                            modifier(formule.code, { avantages: copie });
                          }}
                          className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-red-500"
                        />
                        <button
                          type="button"
                          aria-label={t('removeArgument', { index: index + 1 })}
                          onClick={() =>
                            modifier(formule.code, {
                              avantages: brouillon.avantages.filter((_, i) => i !== index),
                            })
                          }
                          className="p-2 text-gray-400 hover:text-red-400 transition"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() =>
                        modifier(formule.code, { avantages: [...brouillon.avantages, ''] })
                      }
                      className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition"
                    >
                      <Plus size={16} /> {t('addLine')}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => enregistrer(formule.code)}
                disabled={!modifiee(formule.code) || enregistrement === formule.code}
                className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg font-semibold transition ${
                  modifiee(formule.code)
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                }`}
              >
                <Save size={18} />
                {enregistrement === formule.code ? t('saving') : t('save')}
              </button>

              <p className="text-xs text-gray-500">
                {t('merchantView', {
                  name: brouillon.libelle,
                  price: euro(brouillon.prixMensuel),
                  weeklyPrice: euro(parSemaine(brouillon.prixMensuel)),
                  stores: brouillon.maxBoutiques,
                  commission: brouillon.commission,
                  platformCommission: brouillon.commissionLivreursPlateforme,
                })}
              </p>
            </section>
          );
        })}
      </div>

      <p className="text-sm text-gray-500">
        {t('footerNote')}
      </p>
    </div>
  );
}
