'use client';

import { useCallback, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, PlusCircle, Save, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { euro } from '@/lib/format';
import { useEffectChargement } from '@/lib/use-effect-chargement';

/**
 * Les suppléments payants d'un plat, côté commerçant.
 *
 * Des groupes (« Suppléments », « Sauce ») de choix à prix fixe : bacon
 * +1,50 €, cheddar +1 €, sauce offerte. Un groupe peut être obligatoire et
 * plafonné (« une sauce au choix »). Le prix se saisit comme celui du plat ;
 * le serveur le recalcule à chaque commande.
 *
 * Tout s'édite ici puis part d'un seul envoi : les identifiants des choix
 * existants sont gardés, un panier qui les désigne reste valable.
 */

interface Choix {
  id?: string;
  label: string;
  /** Texte saisi, converti à l'envoi. */
  price: string;
  isAvailable: boolean;
}

interface Groupe {
  name: string;
  isRequired: boolean;
  /** Vide : sans limite. */
  maxChoices: string;
  choices: Choix[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const groupeVide = (nom: string): Groupe => ({
  name: nom,
  isRequired: false,
  maxChoices: '',
  choices: [{ label: '', price: '', isAvailable: true }],
});

export function SupplementsProduit({ productId }: { productId: string }) {
  const t = useTranslations('supplementsProduit');
  const [ouvert, setOuvert] = useState(false);
  const [groupes, setGroupes] = useState<Groupe[]>([]);
  const [enregistres, setEnregistres] = useState('[]');
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const [chargement, setChargement] = useState(false);

  const lire = (donnees: any[]): Groupe[] =>
    (donnees || []).map((g) => ({
      name: g.name,
      isRequired: Boolean(g.isRequired),
      maxChoices: g.maxChoices == null ? '' : String(g.maxChoices),
      choices: (g.choices || []).map((c: any) => ({
        id: c.id,
        label: c.label,
        price: String(c.price ?? 0),
        isAvailable: c.isAvailable !== false,
      })),
    }));

  const charger = useCallback(async () => {
    try {
      const reponse = await fetch(`${API_URL}/api/products/${productId}/supplements`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
      });
      if (!reponse.ok) return;
      const lus = lire((await reponse.json()).data);
      setGroupes(lus);
      setEnregistres(JSON.stringify(lus));
    } catch {
      // Le compteur restera à zéro : ce n'est pas bloquant.
    }
  }, [productId]);

  useEffectChargement(() => {
    charger();
  }, [charger]);

  const modifie = JSON.stringify(groupes) !== enregistres;

  const changerGroupe = (index: number, champ: Partial<Groupe>) =>
    setGroupes((actuels) => actuels.map((g, i) => (i === index ? { ...g, ...champ } : g)));

  const changerChoix = (gi: number, ci: number, champ: Partial<Choix>) =>
    setGroupes((actuels) =>
      actuels.map((g, i) =>
        i === gi ? { ...g, choices: g.choices.map((c, j) => (j === ci ? { ...c, ...champ } : c)) } : g,
      ),
    );

  const enregistrer = async () => {
    setErreur('');
    setMessage('');

    // Les lignes laissées vides ne partent pas : un groupe ajouté par erreur
    // ne bloque pas l'enregistrement du reste.
    const aEnvoyer = groupes
      .map((g) => ({
        name: g.name.trim(),
        isRequired: g.isRequired,
        maxChoices: g.maxChoices.trim() === '' ? null : Number(g.maxChoices),
        choices: g.choices
          .filter((c) => c.label.trim() !== '')
          .map((c) => ({
            ...(c.id ? { id: c.id } : {}),
            label: c.label.trim(),
            price: c.price.trim() === '' ? 0 : Number(c.price.replace(',', '.')),
            isAvailable: c.isAvailable,
          })),
      }))
      .filter((g) => g.name !== '' || g.choices.length > 0);

    if (aEnvoyer.some((g) => g.choices.some((c) => !Number.isFinite(c.price)))) {
      setErreur(t('invalidPrice'));
      return;
    }

    setChargement(true);
    try {
      const reponse = await fetch(`${API_URL}/api/products/${productId}/supplements`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify({ groupes: aEnvoyer }),
      });
      const donnees = await reponse.json().catch(() => null);

      if (!reponse.ok) {
        setErreur(donnees?.error || t('actionRefused'));
        return;
      }

      const lus = lire(donnees.data);
      setGroupes(lus);
      setEnregistres(JSON.stringify(lus));
      setMessage(t('saved'));
    } catch {
      setErreur(t('serverError'));
    } finally {
      setChargement(false);
    }
  };

  const nombreDeChoix = groupes.reduce((n, g) => n + g.choices.length, 0);

  return (
    <div className="mt-4 pt-4 border-t border-gray-700">
      <button
        type="button"
        onClick={() => setOuvert(!ouvert)}
        aria-expanded={ouvert}
        className="flex items-center gap-2 text-sm text-gray-300 hover:text-white transition"
      >
        <PlusCircle size={16} />
        <span>
          {t('title')}
          {nombreDeChoix > 0 && ` (${nombreDeChoix})`}
        </span>
        {ouvert ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {!ouvert && groupes.length > 0 && (
        <p className="text-xs text-gray-500 mt-1">
          {groupes
            .map((g) => `${g.name} : ${g.choices.map((c) => c.label).join(', ')}`)
            .join(' · ')}
        </p>
      )}

      {ouvert && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-gray-500">{t('help')}</p>

          {groupes.map((groupe, gi) => (
            <fieldset key={gi} className="bg-gray-700/40 rounded-lg p-3 space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[10rem]">
                  <label htmlFor={`groupe-${productId}-${gi}`} className="block text-xs text-gray-400 mb-1">
                    {t('groupName')}
                  </label>
                  <input
                    id={`groupe-${productId}-${gi}`}
                    value={groupe.name}
                    onChange={(e) => changerGroupe(gi, { name: e.target.value })}
                    placeholder={t('groupPlaceholder')}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label htmlFor={`max-${productId}-${gi}`} className="block text-xs text-gray-400 mb-1">
                    {t('maxChoices')}
                  </label>
                  <input
                    id={`max-${productId}-${gi}`}
                    type="number"
                    min={1}
                    value={groupe.maxChoices}
                    onChange={(e) => changerGroupe(gi, { maxChoices: e.target.value })}
                    placeholder={t('unlimited')}
                    className="w-24 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-orange-500"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-300 py-1.5">
                  <input
                    type="checkbox"
                    checked={groupe.isRequired}
                    onChange={(e) => changerGroupe(gi, { isRequired: e.target.checked })}
                    className="accent-orange-500"
                  />
                  {t('required')}
                </label>
                <button
                  type="button"
                  onClick={() => setGroupes((actuels) => actuels.filter((_, i) => i !== gi))}
                  aria-label={t('removeGroup', { nom: groupe.name || '…' })}
                  className="p-1.5 text-gray-400 hover:text-red-400 transition"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <ul className="space-y-2">
                {groupe.choices.map((choix, ci) => (
                  <li key={choix.id || `nouveau-${ci}`} className="flex flex-wrap items-center gap-2">
                    <input
                      value={choix.label}
                      onChange={(e) => changerChoix(gi, ci, { label: e.target.value })}
                      placeholder={t('choicePlaceholder')}
                      aria-label={t('choiceName')}
                      className="flex-1 min-w-[8rem] bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm focus:outline-none focus:border-orange-500"
                    />
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={choix.price}
                      onChange={(e) => changerChoix(gi, ci, { price: e.target.value })}
                      placeholder="0"
                      aria-label={t('choicePrice', { nom: choix.label || '…' })}
                      className="w-24 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm focus:outline-none focus:border-orange-500"
                    />
                    <span className="text-xs text-gray-500 w-20">
                      {Number(choix.price) > 0 ? `+ ${euro(Number(choix.price))}` : t('free')}
                    </span>
                    <button
                      type="button"
                      onClick={() => changerChoix(gi, ci, { isAvailable: !choix.isAvailable })}
                      className={`px-2 py-1 rounded text-xs font-medium transition ${
                        choix.isAvailable
                          ? 'bg-orange-600/20 text-orange-300 hover:bg-orange-600/30'
                          : 'bg-green-600/20 text-green-300 hover:bg-green-600/30'
                      }`}
                    >
                      {choix.isAvailable ? t('depleted') : t('restore')}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        changerGroupe(gi, { choices: groupe.choices.filter((_, j) => j !== ci) })
                      }
                      aria-label={t('removeChoice', { nom: choix.label || '…' })}
                      className="p-1 text-gray-400 hover:text-red-400 transition"
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() =>
                  changerGroupe(gi, {
                    choices: [...groupe.choices, { label: '', price: '', isAvailable: true }],
                  })
                }
                className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300"
              >
                <Plus size={14} />
                {t('addChoice')}
              </button>
            </fieldset>
          ))}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setGroupes((actuels) => [...actuels, groupeVide(actuels.length === 0 ? t('defaultGroup') : '')])}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-sm transition"
            >
              <Plus size={14} />
              {t('addGroup')}
            </button>
            <button
              type="button"
              onClick={enregistrer}
              disabled={chargement || !modifie}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 disabled:text-gray-500 text-sm font-medium transition"
            >
              <Save size={14} />
              {t('save')}
            </button>
            {message && !modifie && <span className="text-xs text-green-400">{message}</span>}
          </div>

          {erreur && (
            <p className="text-sm text-red-300 bg-red-900/20 border border-red-700/40 rounded px-3 py-2">
              {erreur}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
