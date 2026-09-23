'use client';


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

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Clock, Power } from 'lucide-react';
import { useCurrentStore } from '@/lib/current-store';
import { useTranslations } from 'next-intl';

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

const NOM_DU_JOUR: Record<string, string> = {
  MON: 'Lundi',
  TUE: 'Mardi',
  WED: 'Mercredi',
  THU: 'Jeudi',
  FRI: 'Vendredi',
  SAT: 'Samedi',
  SUN: 'Dimanche',
};

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
      const token = localStorage.getItem('accessToken');
      const reponse = await fetch(`${API_URL}/api/store-hours/${storeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!reponse.ok) {
        setErreur('Horaires indisponibles');
        return;
      }

      setData(await reponse.json());
      setErreur('');
    } catch {
      setErreur(t('serverError'));
    } finally {
      setChargement(false);
    }
  }, [storeId]);

  useEffect(() => {
    charger();
  }, [charger]);

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
      const token = localStorage.getItem('accessToken');
      const reponse = await fetch(`${API_URL}/api/store-hours/${storeId}/day/${jour}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ closed: horaires.closed, plages: horaires.plages }),
      });

      const lu = await reponse.json().catch(() => null);

      // Un refus muet laissait croire que l'horaire était enregistré.
      if (!reponse.ok) {
        setErreur(lu?.error || 'Horaires refusés');
        return;
      }

      await charger();
      setJourEdite(null);
      setBrouillon(null);
      setMessage(`${NOM_DU_JOUR[jour]} enregistré`);
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
      const token = localStorage.getItem('accessToken');
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
      const token = localStorage.getItem('accessToken');
      const reponse = await fetch(`${API_URL}/api/store-hours/${storeId}/pickup-slots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(nouveauCreneau),
      });

      const lu = await reponse.json().catch(() => null);

      if (!reponse.ok) {
        setErreur(lu?.error || 'Créneau refusé');
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
      const token = localStorage.getItem('accessToken');
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
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-900 p-8">
        <p role="status" className="text-slate-400">
          {erreur || 'Horaires indisponibles'}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <Clock className="text-amber-500" />
              Horaires et disponibilité
            </h1>
            <p className="text-slate-400 mt-2">
              Vos horaires d&apos;ouverture, et les créneaux de retrait proposés au client.
            </p>
          </div>

          <button
            onClick={basculerLaBoutique}
            disabled={envoi}
            title={
              data.isOpen
                ? 'Fermer la boutique immédiatement'
                : 'Rouvrir la boutique immédiatement'
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
          <p role="status" className="mb-4 text-sm text-green-400">
            {message}
          </p>
        )}
        {erreur && (
          <p role="status" className="mb-4 text-sm text-red-400">
            {erreur}
          </p>
        )}

        {/* Les horaires de la semaine */}
        <div className="bg-slate-800 rounded-lg p-6 mb-8 border border-slate-700">
          <h2 className="text-xl font-bold text-white mb-2">Horaires d&apos;ouverture</h2>
          {/* Le service du midi et celui du soir tiennent dans la même journée. */}
          <p className="text-sm text-slate-400 mb-6">
            Une journée peut compter plusieurs services — midi et soir, par exemple. Une
            fermeture après minuit se saisit telle quelle : 17h30 – 01h00.
          </p>

          <div className="space-y-3">
            {JOURS.map((jour) => {
              const horaires = data.operatingHours[jour];
              const enEdition = jourEdite === jour;

              if (!enEdition) {
                return (
                  <div
                    key={jour}
                    className="flex items-center justify-between bg-slate-700 p-4 rounded-lg border border-slate-600"
                  >
                    <p className="text-white font-medium flex-1">{NOM_DU_JOUR[jour]}</p>

                    <div className="flex items-center gap-4">
                      {horaires?.closed ? (
                        <span className="text-sm text-red-400">Fermé</span>
                      ) : (
                        <span className="text-sm text-green-400">
                          {(horaires?.plages || []).map((plage, index) => (
                            <span key={index} className="ml-3 first:ml-0">
                              {plage.open} – {plage.close}
                              {franchitMinuit(plage) && (
                                <span className="text-slate-400 text-xs"> (le lendemain)</span>
                              )}
                            </span>
                          ))}
                        </span>
                      )}

                      {/* Sept boutons « Modifier » identiques ne se
                          distinguent ni à la lecture d'écran, ni autrement. */}
                      <button
                        onClick={() => ouvrirLEdition(jour)}
                        aria-label={`Modifier ${NOM_DU_JOUR[jour]}`}
                        className="px-3 py-1 bg-amber-600 text-white rounded hover:bg-amber-700 transition text-sm"
                      >
                        Modifier
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={jour}
                  className="bg-slate-700 p-4 rounded-lg border border-amber-600/60 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-white font-medium">{NOM_DU_JOUR[jour]}</p>

                    <label className="flex items-center gap-2 text-slate-300 text-sm">
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
                      Fermé ce jour-là
                    </label>
                  </div>

                  {!brouillon?.closed && (
                    <div className="space-y-2">
                      {(brouillon?.plages || []).map((plage, index) => (
                        <div key={index} className="flex items-center gap-2 flex-wrap">
                          <input
                            type="time"
                            aria-label={`Ouverture ${index + 1} — ${NOM_DU_JOUR[jour]}`}
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
                            className="px-2 py-1 bg-slate-600 text-white rounded text-sm"
                          />
                          <span className="text-slate-400">à</span>
                          <input
                            type="time"
                            aria-label={`Fermeture ${index + 1} — ${NOM_DU_JOUR[jour]}`}
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
                            className="px-2 py-1 bg-slate-600 text-white rounded text-sm"
                          />

                          {franchitMinuit(plage) && (
                            <span className="text-xs text-slate-400">jusqu&apos;au lendemain</span>
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
                              title="Retirer ce service"
                              className="p-1 text-red-400 hover:text-red-300 transition"
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
                          className="flex items-center gap-1 text-sm text-amber-400 hover:text-amber-300 transition"
                        >
                          <Plus size={16} />
                          Ajouter un service
                        </button>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => brouillon && enregistrerLeJour(jour, brouillon)}
                      disabled={envoi}
                      aria-label={`Enregistrer ${NOM_DU_JOUR[jour]}`}
                      className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition text-sm disabled:opacity-50"
                    >
                      Enregistrer
                    </button>
                    <button
                      onClick={() => {
                        setJourEdite(null);
                        setBrouillon(null);
                      }}
                      className="px-3 py-1 bg-slate-600 text-white rounded hover:bg-slate-500 transition text-sm"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Les créneaux de retrait */}
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">Créneaux de retrait</h2>

            {!formulaireCreneau && (
              <button
                onClick={() => setFormulaireCreneau(true)}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition"
              >
                <Plus size={20} />
                Ajouter un créneau
              </button>
            )}
          </div>

          {formulaireCreneau && (
            <div className="bg-slate-700 p-4 rounded-lg mb-4 border border-slate-600">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div>
                  <label htmlFor="creneau-debut" className="text-slate-300 text-sm">
                    Début
                  </label>
                  <input
                    id="creneau-debut"
                    type="time"
                    value={nouveauCreneau.start}
                    onChange={(e) => setNouveauCreneau({ ...nouveauCreneau, start: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-600 text-white rounded text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="creneau-fin" className="text-slate-300 text-sm">
                    Fin
                  </label>
                  <input
                    id="creneau-fin"
                    type="time"
                    value={nouveauCreneau.end}
                    onChange={(e) => setNouveauCreneau({ ...nouveauCreneau, end: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-600 text-white rounded text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="creneau-max" className="text-slate-300 text-sm">
                    Commandes maximum
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
                    className="w-full px-3 py-2 bg-slate-600 text-white rounded text-sm"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={ajouterUnCreneau}
                  disabled={envoi}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition disabled:opacity-50"
                >
                  Ajouter
                </button>
                <button
                  onClick={() => setFormulaireCreneau(false)}
                  className="px-4 py-2 bg-slate-600 text-white rounded hover:bg-slate-500 transition"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {data.pickupSlots.length > 0 ? (
            <div className="space-y-3">
              {data.pickupSlots.map((creneau) => (
                <div
                  key={creneau.id}
                  className="flex items-center justify-between bg-slate-700 p-4 rounded-lg border border-slate-600"
                >
                  <div className="flex-1">
                    <p className="text-white font-medium">
                      {creneau.start} – {creneau.end}
                    </p>
                    <p className="text-slate-400 text-sm">
                      {creneau.maxOrders} commande{creneau.maxOrders > 1 ? 's' : ''} au maximum
                    </p>
                  </div>

                  <button
                    onClick={() => retirerUnCreneau(creneau.id)}
                    disabled={envoi}
                    title="Retirer ce créneau"
                    className="p-2 bg-red-600 text-white rounded hover:bg-red-700 transition disabled:opacity-50"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-400 text-center py-8">
              Aucun créneau de retrait. Le client se voit alors proposer les heures
              d&apos;ouverture ci-dessus.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
