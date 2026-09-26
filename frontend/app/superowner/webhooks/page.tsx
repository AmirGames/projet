'use client';

/**
 * Les webhooks : prévenir un système extérieur de ce qui se passe ici.
 *
 * Cette page listait dix événements écrits en dur, dont neuf n'existaient pas
 * côté serveur : on s'abonnait à `payment.processed` et on attendait un envoi
 * qui ne viendrait jamais. Elle jetait aussi le secret rendu à la création —
 * sans lui, le destinataire ne peut vérifier aucune signature, et il n'est
 * récupérable nulle part ensuite.
 *
 * La liste des événements vient maintenant du serveur, le secret est montré une
 * fois avec l'avertissement qui va avec, et chaque abonnement dit ce que ses
 * derniers envois ont donné.
 */

import { useCallback, useState } from 'react';
import {
  AlertCircle,
  Copy,
  History,
  Pause,
  Play,
  Plus,
  Send,
  Trash2,
  Webhook as WebhookIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Abonnement {
  id: string;
  url: string;
  events: string[];
  status: 'ACTIVE' | 'INACTIVE' | 'FAILED';
  lastTriggered: string | null;
  createdAt: string;
  retryCount: number;
}

interface Evenement {
  nom: string;
  description: string;
}

interface Envoi {
  id: string;
  event: string;
  statusCode: number | null;
  success: boolean;
  error: string | null;
  attempt: number;
  nextAttemptAt: string | null;
  abandonedAt: string | null;
  createdAt: string;
}

const COULEUR_ETAT: Record<string, string> = {
  ACTIVE: 'bg-green-500/20 text-green-400',
  INACTIVE: 'bg-gray-500/20 text-gray-300',
  FAILED: 'bg-red-500/20 text-red-400',
};

const jeton = () => localStorage.getItem('accessToken');

export default function WebhooksPage() {
  const t = useTranslations('superownerWebhooks');
  const tCommon = useTranslations('common');
  const [abonnements, setAbonnements] = useState<Abonnement[]>([]);
  const [evenements, setEvenements] = useState<Evenement[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');

  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [formulaire, setFormulaire] = useState({ url: '', events: [] as string[] });
  const [envoiEnCours, setEnvoiEnCours] = useState(false);

  // Rendu une seule fois, à la création : la page le gardait pour elle.
  const [secret, setSecret] = useState<{ url: string; valeur: string } | null>(null);

  const [historiqueDe, setHistoriqueDe] = useState<string | null>(null);
  const [historique, setHistorique] = useState<Envoi[]>([]);

  const charger = useCallback(async () => {
    setChargement(true);

    try {
      const reponse = await fetch(`${API_URL}/api/superowner/webhooks?limit=50`, {
        headers: { Authorization: `Bearer ${jeton()}` },
      });

      const lu = await reponse.json();

      if (!reponse.ok) {
        setErreur(lu?.error || t('loadError'));
        return;
      }

      setAbonnements(lu.webhooks || []);
      // La liste des événements est celle du serveur, et d'aucun autre endroit.
      setEvenements(lu.availableEvents || []);
      setErreur('');
    } catch {
      setErreur(t('connectionError'));
    } finally {
      setChargement(false);
    }
  }, [t]);

  useEffectChargement(() => {
    charger();
  }, [charger]);

  const creer = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formulaire.events.length === 0) {
      setMessage(t('no_events'));
      return;
    }

    setEnvoiEnCours(true);
    setMessage('');

    try {
      const reponse = await fetch(`${API_URL}/api/superowner/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton()}` },
        body: JSON.stringify(formulaire),
      });

      const lu = await reponse.json();

      if (!reponse.ok) {
        setMessage(lu?.error || t('createError'));
        return;
      }

      // Le secret ne sera plus jamais rendu : il est montré maintenant ou perdu.
      setSecret({ url: lu.webhook.url, valeur: lu.webhook.secret });
      setFormulaire({ url: '', events: [] });
      setFormulaireOuvert(false);
      setMessage('');
      await charger();
    } catch {
      setMessage(t('connectionError'));
    } finally {
      setEnvoiEnCours(false);
    }
  };

  const supprimer = async (id: string, url: string) => {
    if (!confirm(t('delete_confirm', { url }))) return;

    try {
      const reponse = await fetch(`${API_URL}/api/superowner/webhooks/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${jeton()}` },
      });

      if (!reponse.ok) {
        const lu = await reponse.json().catch(() => null);
        setMessage(lu?.error || t('deleteError'));
        return;
      }

      setMessage(t('deleteSuccess'));
      await charger();
    } catch {
      setMessage(t('connectionError'));
    }
  };

  const changerLEtat = async (id: string, status: 'ACTIVE' | 'INACTIVE') => {
    try {
      const reponse = await fetch(`${API_URL}/api/superowner/webhooks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton()}` },
        body: JSON.stringify({ status }),
      });

      const lu = await reponse.json();

      if (!reponse.ok) {
        setMessage(lu?.error || t('changeStateError'));
        return;
      }

      setMessage(lu.message);
      await charger();
    } catch {
      setMessage(t('connectionError'));
    }
  };

  const essayer = async (id: string) => {
    setMessage(t('testSending'));

    try {
      const reponse = await fetch(`${API_URL}/api/superowner/webhooks/${id}/essai`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jeton()}` },
      });

      const lu = await reponse.json();

      if (!reponse.ok) {
        setMessage(lu?.error || t('testError'));
        return;
      }

      setMessage(lu.message);

      if (historiqueDe === id) await voirLHistorique(id);
      await charger();
    } catch {
      setMessage(t('connectionError'));
    }
  };

  const voirLHistorique = async (id: string) => {
    if (historiqueDe === id) {
      setHistoriqueDe(null);
      return;
    }

    try {
      const reponse = await fetch(`${API_URL}/api/superowner/webhooks/${id}/deliveries`, {
        headers: { Authorization: `Bearer ${jeton()}` },
      });

      const lu = await reponse.json();

      if (!reponse.ok) {
        setMessage(lu?.error || t('historyUnavailable'));
        return;
      }

      setHistorique(lu.deliveries || []);
      setHistoriqueDe(id);
    } catch {
      setMessage(t('connectionError'));
    }
  };

  const basculerEvenement = (nom: string) => {
    setFormulaire((f) => ({
      ...f,
      events: f.events.includes(nom) ? f.events.filter((e) => e !== nom) : [...f.events, nom],
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            <WebhookIcon className="w-8 h-8" />
            {t('title')}
          </h1>
          <p className="text-gray-400 mt-2">
            {t('subtitle')}
          </p>
        </div>

        <button
          onClick={() => setFormulaireOuvert(!formulaireOuvert)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition"
        >
          <Plus size={16} />
          {t('new_webhook')}
        </button>
      </div>

      {erreur && (
        <div className="p-4 bg-red-900/20 text-red-400 rounded-lg border border-red-500/20">
          {erreur}
        </div>
      )}

      {message && (
        <div className="p-4 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white">
          {message}
        </div>
      )}

      {/* ---- Le secret, montré une fois ---- */}
      {secret && (
        <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg space-y-3">
          <div className="flex items-start gap-2">
            <AlertCircle size={18} className="text-green-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-green-400 font-semibold">
                {t('secret_warning')}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                {t('secret_explanation', { url: secret.url })}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <code
              data-secret-webhook
              className="flex-1 px-3 py-2 bg-gray-900 rounded text-green-300 text-sm break-all"
            >
              {secret.valeur}
            </code>
            <button
              onClick={() => navigator.clipboard?.writeText(secret.valeur)}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white transition"
              title="Copier"
            >
              <Copy size={16} />
            </button>
            <button
              onClick={() => setSecret(null)}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-sm transition"
            >
              {t('secret_copied')}
            </button>
          </div>
        </div>
      )}

      {/* ---- Nouvel abonnement ---- */}
      {formulaireOuvert && (
        <form
          onSubmit={creer}
          className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-6 space-y-4"
        >
          <div>
            <label className="block text-sm text-gray-400 mb-2">{t('url')}</label>
            <input
              type="url"
              required
              id="champ-url"
              value={formulaire.url}
              onChange={(e) => setFormulaire({ ...formulaire, url: e.target.value })}
              placeholder="https://mon-serveur.fr/zupone"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">
              {t('events', { count: formulaire.events.length })}
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {evenements.map((evenement) => (
                <label
                  key={evenement.nom}
                  className="flex items-start gap-3 p-3 bg-gray-700/40 border border-gray-700 rounded-lg cursor-pointer hover:border-gray-600"
                >
                  <input
                    type="checkbox"
                    checked={formulaire.events.includes(evenement.nom)}
                    onChange={() => basculerEvenement(evenement.nom)}
                    className="w-4 h-4 mt-0.5 accent-blue-500"
                  />
                  <span>
                    <code className="text-sm text-white">{evenement.nom}</code>
                    <span className="block text-xs text-gray-400 mt-0.5">
                      {evenement.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={envoiEnCours}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg font-medium transition"
            >
              {envoiEnCours ? t('creating') : t('create_button')}
            </button>
            <button
              type="button"
              onClick={() => setFormulaireOuvert(false)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition"
            >
              {tCommon('cancel')}
            </button>
          </div>
        </form>
      )}

      {/* ---- Les abonnements ---- */}
      {chargement ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      ) : abonnements.length === 0 ? (
        <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-8 text-center">
          <p className="text-gray-400">{t('empty')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {abonnements.map((abonnement) => (
            <div
              key={abonnement.id}
              data-abonnement={abonnement.id}
              className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-4 space-y-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-white font-medium break-all">{abonnement.url}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {abonnement.events.map((evenement) => (
                      <code
                        key={evenement}
                        className="px-2 py-0.5 bg-gray-700 rounded text-xs text-gray-300"
                      >
                        {evenement}
                      </code>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className={`px-2 py-1 rounded text-xs font-semibold ${COULEUR_ETAT[abonnement.status]}`}
                  >
                    {t(abonnement.status.toLowerCase())}
                  </span>

                  <button
                    onClick={() => essayer(abonnement.id)}
                    aria-label={t('test_send_label', { url: abonnement.url })}
                    className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white transition"
                    title={t('test_send')}
                  >
                    <Send size={14} />
                  </button>

                  <button
                    onClick={() => voirLHistorique(abonnement.id)}
                    aria-label={t('history_label', { url: abonnement.url })}
                    className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white transition"
                    title={t('history')}
                  >
                    <History size={14} />
                  </button>

                  {abonnement.status === 'ACTIVE' ? (
                    <button
                      onClick={() => changerLEtat(abonnement.id, 'INACTIVE')}
                      aria-label={t('pause_label', { url: abonnement.url })}
                      className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white transition"
                      title={t('pause')}
                    >
                      <Pause size={14} />
                    </button>
                  ) : (
                    <button
                      onClick={() => changerLEtat(abonnement.id, 'ACTIVE')}
                      aria-label={t('resume_label', { url: abonnement.url })}
                      className="p-2 bg-green-600/80 hover:bg-green-600 rounded-lg text-white transition"
                      title={t('resume')}
                    >
                      <Play size={14} />
                    </button>
                  )}

                  <button
                    onClick={() => supprimer(abonnement.id, abonnement.url)}
                    aria-label={t('delete_label', { url: abonnement.url })}
                    className="p-2 bg-red-600/80 hover:bg-red-600 rounded-lg text-white transition"
                    title={t('delete')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <p className="text-xs text-gray-500">
                {abonnement.lastTriggered
                  ? t('lastSent', { date: new Date(abonnement.lastTriggered).toLocaleString('fr-FR') })
                  : t('noSent')}
                {abonnement.retryCount > 0 &&
                  ` · ${t('abandonedAttempts', { count: abonnement.retryCount })}`}
              </p>

              {/* Un abonnement coupé ne dit pas de lui-même comment repartir. */}
              {abonnement.status === 'FAILED' && (
                <p className="text-xs text-red-400 flex items-start gap-2">
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                  {t('failedWarning')}
                </p>
              )}

              {historiqueDe === abonnement.id && (
                <div className="border-t border-gray-700 pt-3">
                  {historique.length === 0 ? (
                    <p className="text-sm text-gray-500">{t('noDeliveries')}</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 text-xs">
                          <th className="pb-2">{t('history_event')}</th>
                          <th className="pb-2">{t('history_response')}</th>
                          <th className="pb-2">{t('history_attempts')}</th>
                          <th className="pb-2">{t('history_when')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-700/50">
                        {historique.map((envoi) => (
                          <tr key={envoi.id}>
                            <td className="py-2">
                              <code className="text-xs text-gray-300">{envoi.event}</code>
                            </td>
                            <td className="py-2">
                              {envoi.success ? (
                                <span className="text-green-400">{envoi.statusCode}</span>
                              ) : (
                                <span className="text-red-400">
                                  {envoi.statusCode || envoi.error || 'échec'}
                                </span>
                              )}
                            </td>
                            <td className="py-2 text-gray-400">
                              {envoi.attempt}
                              {envoi.nextAttemptAt && !envoi.success && (
                                <span className="text-amber-400">
                                  {' '}
                                  · {t('retryAt', { time: new Date(envoi.nextAttemptAt).toLocaleTimeString('fr-FR') })}
                                </span>
                              )}
                              {envoi.abandonedAt && (
                                <span className="text-red-400"> · {t('abandoned')}</span>
                              )}
                            </td>
                            <td className="py-2 text-gray-500 text-xs">
                              {new Date(envoi.createdAt).toLocaleString('fr-FR')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
