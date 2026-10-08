'use client';



import { jetonAcces } from '@/lib/jeton-session';
/**
 * Les horaires d'ouverture de la boutique.
 *
 * Un jour n'avait qu'une plage : un restaurant qui sert à midi puis le soir
 * devait déclarer 11 h 30 – 22 h 00 et se dire ouvert tout l'après-midi. Et une
 * fermeture à 1 h du matin était refusée — alors que c'est l'horaire normal
 * d'un vendredi soir.
 *
 * La page était par ailleurs restée en anglais, seule de tout l'espace
 * commerçant.
 */

import { useCallback, useState } from 'react';
import { Plus, Trash2, Clock, Power } from 'lucide-react';
import { useCurrentStore } from '@/lib/current-store';
import { useTranslations } from 'next-intl';
import { useDonneesModifiees } from '@/lib/temps-reel';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Plage {
  open: string;
  close: string;
}

interface DayHours {
  closed: boolean;
  plages: Plage[];
  open: string;
  close: string;
}

interface CreneauRetrait {
  id?: string;
  start: string;
  end: string;
  maxOrders: number;
}

interface Horaires {
  operatingHours: Record<string, DayHours>;
  isOpen: boolean;
  pickupSlots: CreneauRetrait[];
  ouvertMaintenant?: boolean;
}

const JOURS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

// Le nom de chaque jour : `jours.<MON…SUN>` des traductions.

/** Une fermeture avant l'ouverture se lit « le lendemain ». */
const franchitMinuit = (plage: Plage) => plage.close <= plage.open;

export default function HorairesPage() {
  const t = useTranslations('merchantstorehours');
  const { storeId } = useCurrentStore();

  const [data, setData] = useState<Horaires | null>(null);
  const [chargement, setChargement] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');

  const [jourEdite, setJourEdite] = useState<string | null>(null);
  const [brouillon, setBrouillon] = useState<DayHours | null>(null);

  const [nouveauCreneau, setNouveauCreneau] = useState<CreneauRetrait>({
    start: '11:00',
    end: '13:00',
    maxOrders: 10,
  });
  const [formulaireCreneau, setFormulaireCreneau] = useState(false);

  const charger = useCallback(async () => {
    if (!storeId) return;

    try {
      const token = jetonAcces();
      const reponse = await fetch(`${API_URL}/api/store-hours/${storeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!reponse.ok) {
        setErreur(t('indisponibles'));
        return;
      }

      setData(await reponse.json());
      setErreur('');
    } catch {
      setErreur(t('serverError'));
    } finally {
      setChargement(false);
    }
  }, [storeId, t]);

  useEffectChargement(() => {
    charger();
  }, [charger]);

  // Les horaires changés par un collègue, la boutique fermée par la
  // plateforme : la page suit.
  useDonneesModifiees(['store-hours', 'stores'], charger, { storeId, actif: Boolean(storeId) });

  const ouvrirLEdition = (jour: string) => {
    const actuel = data?.operatingHours[jour];

    setJourEdite(jour);
    setErreur('');
    setBrouillon({
      closed: !!actuel?.closed,
      plages: actuel?.plages?.length ? [...actuel.plages] : [{ open: '09:00', close: '22:00' }],
      open: actuel?.open || '09:00',
      close: actuel?.close || '22:00',
    });
  };

  const enregistrerLeJour = async (jour: string, horaires: DayHours) => {
    setEnvoi(true);
    setErreur('');
    setMessage('');

    try {
      const token = jetonAcces();
      const reponse = await fetch(`${API_URL}/api/store-hours/${storeId}/day/${jour}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ closed: horaires.closed, plages: horaires.plages }),
      });

      const lu = await reponse.json().catch(() => null);

      // Un refus muet laissait croire que l'horaire était enregistré.
      if (!reponse.ok) {
        setErreur(lu?.error || t('horairesRefuses'));
        return;
      }

      await charger();
      setJourEdite(null);
      setBrouillon(null);
      setMessage(t('jourEnregistre', { jour: t(`jours.${jour}`) }));
    } catch {
      setErreur(t('serverError'));
    } finally {
      setEnvoi(false);
    }
  };

  const basculerLaBoutique = async () => {
    if (!data) return;
    setEnvoi(true);

    try {
      const token = jetonAcces();
      const reponse = await fetch(`${API_URL}/api/store-hours/${storeId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isOpen: !data.isOpen }),
      });

      // Un refus — commerce pas encore validé — doit se lire à l'écran : le
      // bouton qui ne fait rien laisserait croire à une panne.
      if (!reponse.ok) {
        const lu = await reponse.json().catch(() => null);
        setErreur(lu?.error || t('serverError'));
        return;
      }

      setErreur('');
      await charger();
    } catch {
      setErreur(t('serverError'));
    } finally {
      setEnvoi(false);
    }
  };

  const ajouterUnCreneau = async () => {
    setEnvoi(true);
    setErreur('');

    try {
      const token = jetonAcces();
      const reponse = await fetch(`${API_URL}/api/store-hours/${storeId}/pickup-slots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(nouveauCreneau),
      });

      const lu = await reponse.json().catch(() => null);

      if (!reponse.ok) {
        setErreur(lu?.error || t('creneauRefuse'));
        return;
      }

      await charger();
      setNouveauCreneau({ start: '11:00', end: '13:00', maxOrders: 10 });
      setFormulaireCreneau(false);
    } catch {
      setErreur(t('serverError'));
    } finally {
      setEnvoi(false);
    }
  };

  const retirerUnCreneau = async (creneauId: string | undefined) => {
    if (!creneauId) return;
    setEnvoi(true);

    try {
      const token = jetonAcces();
      await fetch(`${API_URL}/api/store-hours/${storeId}/pickup-slots/${creneauId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      await charger();
    } catch {
      setErreur(t('serverError'));
    } finally {
      setEnvoi(false);
    }
  };

  if (chargement) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-gray-900">
        <p role="status" className="text-gray-500">
          {erreur || t('indisponibles')}
        </p>
      </div>
    );
  }

  return (
    <div className="text-gray-900">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Clock className="text-amber-500" />
              {t('titre')}
            </h1>
            <p className="text-gray-500 mt-2">
              {t('sousTitre')}
            </p>
          </div>

          <button
            onClick={basculerLaBoutique}
            disabled={envoi}
            title={
              data.isOpen
                ? t('fermerMaintenant')
                : t('rouvrirMaintenant')
            }
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${
              data.isOpen
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-red-600 text-white hover:bg-red-700'
            } disabled:opacity-50`}
          >
            <Power size={20} />
            {data.isOpen ? t('open') : t('closed')}
          </button>
        </div>

        {message && (
          <p role="status" className="mb-4 text-sm text-green-600">
            {message}
          </p>
        )}
        {erreur && (
          <p role="status" className="mb-4 text-sm text-red-600">
            {erreur}
          </p>
        )}

        {/* Les horaires de la semaine */}
        <div className="bg-white rounded-lg p-6 mb-8 border border-gray-200">
          <h2 className="text-xl font-bold text-gray-900 mb-2">{t('horairesOuverture')}</h2>
          {/* Le service du midi et celui du soir tiennent dans la même journée. */}
          <p className="text-sm text-gray-500 mb-6">
            {t('horairesAide')}
          </p>

          <div className="space-y-3">
            {JOURS.map((jour) => {
              const horaires = data.operatingHours[jour];
              const enEdition = jourEdite === jour;

              if (!enEdition) {
                return (
                  <div
                    key={jour}
                    className="flex items-center justify-between bg-gray-100 p-4 rounded-lg border border-gray-300"
                  >
                    <p className="text-gray-900 font-medium flex-1">{t(`jours.${jour}`)}</p>

                    <div className="flex items-center gap-4">
                      {horaires?.closed ? (
                        <span className="text-sm text-red-600">{t('ferme')}</span>
                      ) : (
                        <span className="text-sm text-green-600">
                          {(horaires?.plages || []).map((plage, index) => (
                            <span key={index} className="ml-3 first:ml-0">
                              {plage.open} – {plage.close}
                              {franchitMinuit(plage) && (
                                <span className="text-gray-500 text-xs"> {t('lendemain')}</span>
                              )}
                            </span>
                          ))}
                        </span>
                      )}

                      {/* Sept boutons « Modifier » identiques ne se
                          distinguent ni à la lecture d'écran, ni autrement. */}
                      <button
                        onClick={() => ouvrirLEdition(jour)}
                        aria-label={t('modifierJour', { jour: t(`jours.${jour}`) })}
                        className="bg-orange-600 text-white hover:bg-orange-700 px-3 py-1 rounded-sm transition text-sm"
                      >
                        {t('modifier')}
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={jour}
                  className="bg-gray-100 p-4 rounded-lg border border-amber-200 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-gray-900 font-medium">{t(`jours.${jour}`)}</p>

                    <label className="flex items-center gap-2 text-gray-700 text-sm">
                      <input
                        type="checkbox"
                        checked={brouillon?.closed || false}
                        onChange={(e) =>
                          setBrouillon((actuel) =>
                            actuel ? { ...actuel, closed: e.target.checked } : actuel
                          )
                        }
                        className="w-4 h-4"
                      />
                      {t('fermeCeJour')}
                    </label>
                  </div>

                  {!brouillon?.closed && (
                    <div className="space-y-2">
                      {(brouillon?.plages || []).map((plage, index) => (
                        <div key={index} className="flex items-center gap-2 flex-wrap">
                          <input
                            type="time"
                            aria-label={t('ouverture', { n: index + 1, jour: t(`jours.${jour}`) })}
                            value={plage.open}
                            onChange={(e) =>
                              setBrouillon((actuel) =>
                                actuel
                                  ? {
                                      ...actuel,
                                      plages: actuel.plages.map((p, i) =>
                                        i === index ? { ...p, open: e.target.value } : p
                                      ),
                                    }
                                  : actuel
                              )
                            }
                            className="px-2 py-1 bg-gray-200 text-gray-900 rounded-sm text-sm"
                          />
                          <span className="text-gray-500">à</span>
                          <input
                            type="time"
                            aria-label={t('fermeture', { n: index + 1, jour: t(`jours.${jour}`) })}
                            value={plage.close}
                            onChange={(e) =>
                              setBrouillon((actuel) =>
                                actuel
                                  ? {
                                      ...actuel,
                                      plages: actuel.plages.map((p, i) =>
                                        i === index ? { ...p, close: e.target.value } : p
                                      ),
                                    }
                                  : actuel
                              )
                            }
                            className="px-2 py-1 bg-gray-200 text-gray-900 rounded-sm text-sm"
                          />

                          {franchitMinuit(plage) && (
                            <span className="text-xs text-gray-500">{t('jusquauLendemain')}</span>
                          )}

                          {(brouillon?.plages.length || 0) > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setBrouillon((actuel) =>
                                  actuel
                                    ? {
                                        ...actuel,
                                        plages: actuel.plages.filter((_, i) => i !== index),
                                      }
                                    : actuel
                                )
                              }
                              title={t('retirerService')}
                              className="p-1 text-red-600 hover:text-red-700 transition"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      ))}

                      {(brouillon?.plages.length || 0) < 4 && (
                        <button
                          type="button"
                          onClick={() =>
                            setBrouillon((actuel) =>
                              actuel
                                ? {
                                    ...actuel,
                                    plages: [...actuel.plages, { open: '17:30', close: '22:00' }],
                                  }
                                : actuel
                            )
                          }
                          className="flex items-center gap-1 text-sm text-amber-600 hover:text-amber-700 transition"
                        >
                          <Plus size={16} />
                          {t('ajouterService')}
                        </button>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => brouillon && enregistrerLeJour(jour, brouillon)}
                      disabled={envoi}
                      aria-label={t('enregistrerJour', { jour: t(`jours.${jour}`) })}
                      className="bg-orange-600 text-white hover:bg-orange-700 px-3 py-1 rounded-sm transition text-sm disabled:opacity-50"
                    >
                      {t('enregistrer')}
                    </button>
                    <button
                      onClick={() => {
                        setJourEdite(null);
                        setBrouillon(null);
                      }}
                      className="px-3 py-1 bg-gray-200 text-gray-900 rounded-sm hover:bg-gray-300 transition text-sm"
                    >
                      {t('annuler')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Les créneaux de retrait */}
        <div className="bg-white rounded-lg p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">{t('creneaux')}</h2>

            {!formulaireCreneau && (
              <button
                onClick={() => setFormulaireCreneau(true)}
                className="bg-orange-600 text-white hover:bg-orange-700 flex items-center gap-2 px-4 py-2 rounded-lg transition"
              >
                <Plus size={20} />
                {t('ajouterCreneau')}
              </button>
            )}
          </div>

          {formulaireCreneau && (
            <div className="bg-gray-100 p-4 rounded-lg mb-4 border border-gray-300">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div>
                  <label htmlFor="creneau-debut" className="text-gray-700 text-sm">
                    {t('debut')}
                  </label>
                  <input
                    id="creneau-debut"
                    type="time"
                    value={nouveauCreneau.start}
                    onChange={(e) => setNouveauCreneau({ ...nouveauCreneau, start: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-200 text-gray-900 rounded-sm text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="creneau-fin" className="text-gray-700 text-sm">
                    {t('fin')}
                  </label>
                  <input
                    id="creneau-fin"
                    type="time"
                    value={nouveauCreneau.end}
                    onChange={(e) => setNouveauCreneau({ ...nouveauCreneau, end: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-200 text-gray-900 rounded-sm text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="creneau-max" className="text-gray-700 text-sm">
                    {t('commandesMax')}
                  </label>
                  <input
                    id="creneau-max"
                    type="number"
                    min="1"
                    value={nouveauCreneau.maxOrders}
                    onChange={(e) =>
                      setNouveauCreneau({
                        ...nouveauCreneau,
                        maxOrders: parseInt(e.target.value, 10) || 1,
                      })
                    }
                    className="w-full px-3 py-2 bg-gray-200 text-gray-900 rounded-sm text-sm"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={ajouterUnCreneau}
                  disabled={envoi}
                  className="bg-orange-600 text-white hover:bg-orange-700 px-4 py-2 rounded-sm transition disabled:opacity-50"
                >
                  {t('ajouter')}
                </button>
                <button
                  onClick={() => setFormulaireCreneau(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-900 rounded-sm hover:bg-gray-300 transition"
                >
                  {t('annuler')}
                </button>
              </div>
            </div>
          )}

          {data.pickupSlots.length > 0 ? (
            <div className="space-y-3">
              {data.pickupSlots.map((creneau) => (
                <div
                  key={creneau.id}
                  className="flex items-center justify-between bg-gray-100 p-4 rounded-lg border border-gray-300"
                >
                  <div className="flex-1">
                    <p className="text-gray-900 font-medium">
                      {creneau.start} – {creneau.end}
                    </p>
                    <p className="text-gray-500 text-sm">
                      {t('commandesAuMaximum', { n: creneau.maxOrders })}
                    </p>
                  </div>

                  <button
                    onClick={() => retirerUnCreneau(creneau.id)}
                    disabled={envoi}
                    title={t('retirerCreneau')}
                    className="p-2 bg-red-600 text-white rounded-sm hover:bg-red-700 transition disabled:opacity-50"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">
              {t('aucunCreneau')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
