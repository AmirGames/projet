'use client';


import { jetonAcces } from '@/lib/jeton-session';
import { useCallback, useState } from 'react';
import { ChevronDown, ChevronUp, Layers, Plus, Save, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { euro } from '@/lib/format';
import { useEffectChargement } from '@/lib/use-effect-chargement';

/**
 * Les déclinaisons d'un plat, côté commerçant.
 *
 * « Pâtes 4 fromages » se commande en penne, spaghetti ou tagliatelle. Le
 * modèle existait en base depuis le début sans aucun écran : rien ne permettait
 * d'en créer.
 */

interface Declinaison {
  id: string;
  label: string;
  /** Vide : la déclinaison est au prix du plat. */
  price: number | null;
  prixEffectif: number;
  isAvailable: boolean;
  displayOrder: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export function DeclinaisonsProduit({
  productId,
  prixDuPlat,
}: {
  productId: string;
  prixDuPlat: number;
}) {
  const t = useTranslations('declinaisonsProduit');
  const [ouvert, setOuvert] = useState(false);
  const [declinaisons, setDeclinaisons] = useState<Declinaison[]>([]);
  const [libelleDuChoix, setLibelleDuChoix] = useState('');
  const [libelleEnregistre, setLibelleEnregistre] = useState('');
  const [nouveauNom, setNouveauNom] = useState('');
  const [nouveauPrix, setNouveauPrix] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);

  const jeton = () => jetonAcces();

  const charger = useCallback(async () => {
    try {
      const reponse = await fetch(`${API_URL}/api/products/${productId}/variants`);
      if (!reponse.ok) return;

      const donnees = await reponse.json();
      setDeclinaisons(donnees.data?.variantes || []);
      setLibelleDuChoix(donnees.data?.libelleDuChoix || '');
      setLibelleEnregistre(donnees.data?.libelleDuChoix || '');
    } catch {
      // Le compteur restera à zéro : ce n'est pas bloquant.
    }
  }, [productId]);

  useEffectChargement(() => {
    charger();
  }, [charger]);

  const appeler = async (chemin: string, options: RequestInit) => {
    setErreur('');
    setChargement(true);

    try {
      const reponse = await fetch(API_URL + chemin, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jeton()}`,
        },
      });

      const donnees = await reponse.json().catch(() => null);

      if (!reponse.ok) {
        setErreur(donnees?.error || t('actionRefused'));
        return false;
      }

      await charger();
      return true;
    } catch {
      setErreur(t('serverError'));
      return false;
    } finally {
      setChargement(false);
    }
  };

  const ajouter = async () => {
    const nom = nouveauNom.trim();
    if (!nom) return;

    const prix = nouveauPrix.trim() === '' ? null : Number(nouveauPrix);

    const fait = await appeler(`/api/products/${productId}/variants`, {
      method: 'POST',
      body: JSON.stringify({ label: nom, price: prix }),
    });

    if (fait) {
      setNouveauNom('');
      setNouveauPrix('');
    }
  };

  const enregistrerLibelle = () =>
    appeler(`/api/products/${productId}/variant-label`, {
      method: 'PUT',
      body: JSON.stringify({ libelle: libelleDuChoix.trim() || null }),
    });

  const renommer = (declinaison: Declinaison, nom: string) =>
    appeler(`/api/products/variants/${declinaison.id}`, {
      method: 'PUT',
      body: JSON.stringify({ label: nom }),
    });

  const retarifer = (declinaison: Declinaison, valeur: string) =>
    appeler(`/api/products/variants/${declinaison.id}`, {
      method: 'PUT',
      body: JSON.stringify({ price: valeur.trim() === '' ? null : Number(valeur) }),
    });

  const basculer = (declinaison: Declinaison) =>
    appeler(`/api/products/variants/${declinaison.id}/availability`, {
      method: 'PATCH',
      body: JSON.stringify({ isAvailable: !declinaison.isAvailable }),
    });

  const supprimer = (declinaison: Declinaison) =>
    appeler(`/api/products/variants/${declinaison.id}`, { method: 'DELETE' });

  /** Monter ou descendre d'un cran, sans glisser-déposer imbriqué. */
  const deplacer = (index: number, sens: -1 | 1) => {
    const cible = index + sens;
    if (cible < 0 || cible >= declinaisons.length) return;

    const ordre = [...declinaisons];
    const [retiree] = ordre.splice(index, 1);
    ordre.splice(cible, 0, retiree!);

    return appeler(`/api/products/${productId}/variants/reorder`, {
      method: 'POST',
      body: JSON.stringify({
        ordering: ordre.map((declinaison, rang) => ({ id: declinaison.id, displayOrder: rang })),
      }),
    });
  };

  return (
    <div className="mt-4 pt-4 border-t border-gray-200">
      <button
        type="button"
        onClick={() => setOuvert(!ouvert)}
        aria-expanded={ouvert}
        className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900 transition"
      >
        <Layers size={16} />
        <span>
          {t('title')}
          {declinaisons.length > 0 && ` (${declinaisons.length})`}
        </span>
        {ouvert ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {!ouvert && declinaisons.length > 0 && (
        <p className="text-xs text-gray-500 mt-1">
          {libelleEnregistre ? `${libelleEnregistre} : ` : ''}
          {declinaisons.map((declinaison) => declinaison.label).join(', ')}
        </p>
      )}

      {ouvert && (
        <div className="mt-4 space-y-4">
          {erreur && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-sm px-3 py-2">
              {erreur}
            </p>
          )}

          <div>
            <label
              htmlFor={`choix-${productId}`}
              className="block text-sm text-gray-500 mb-1"
            >
              {t('questionLabel')}
            </label>
            <div className="flex gap-2">
              <input
                id={`choix-${productId}`}
                value={libelleDuChoix}
                onChange={(e) => setLibelleDuChoix(e.target.value)}
                placeholder={t('questionPlaceholder')}
                className="flex-1 bg-gray-100 border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-hidden focus:border-orange-500"
              />
              <button
                type="button"
                aria-label={t('enregistrerIntitule')}
                onClick={enregistrerLibelle}
                disabled={chargement || libelleDuChoix === libelleEnregistre}
                className={`px-3 rounded transition ${
                  libelleDuChoix === libelleEnregistre
                    ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                    : 'bg-orange-600 hover:bg-orange-700 text-white'
                }`}
                title={t('enregistrerIntitule')}
              >
                <Save size={16} />
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {t('sansElle')}
            </p>
          </div>

          {declinaisons.length > 0 && (
            <ul className="space-y-2">
              {declinaisons.map((declinaison, index) => (
                <li
                  key={declinaison.id}
                  className="flex items-center gap-2 bg-gray-50 rounded-sm px-2 py-2 flex-wrap"
                >
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => deplacer(index, -1)}
                      disabled={index === 0}
                      aria-label={t('monter', { nom: declinaison.label })}
                      className="text-gray-500 hover:text-gray-900 disabled:opacity-30"
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => deplacer(index, 1)}
                      disabled={index === declinaisons.length - 1}
                      aria-label={t('descendre', { nom: declinaison.label })}
                      className="text-gray-500 hover:text-gray-900 disabled:opacity-30"
                    >
                      <ChevronDown size={14} />
                    </button>
                  </div>

                  <input
                    defaultValue={declinaison.label}
                    aria-label={t('nomDe', { nom: declinaison.label })}
                    onBlur={(e) => {
                      if (e.target.value.trim() !== declinaison.label) {
                        renommer(declinaison, e.target.value.trim());
                      }
                    }}
                    className="flex-1 min-w-32 bg-gray-100 border border-gray-300 rounded-sm px-2 py-1 text-sm focus:outline-hidden focus:border-orange-500"
                  />

                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    defaultValue={declinaison.price ?? ''}
                    placeholder={String(prixDuPlat)}
                    aria-label={t('prixDe', { nom: declinaison.label })}
                    onBlur={(e) => {
                      const valeur = e.target.value;
                      const actuel = declinaison.price === null ? '' : String(declinaison.price);
                      if (valeur !== actuel) retarifer(declinaison, valeur);
                    }}
                    className="w-24 bg-gray-100 border border-gray-300 rounded-sm px-2 py-1 text-sm focus:outline-hidden focus:border-orange-500"
                  />

                  <span className="text-xs text-gray-500 w-20">
                    {euro(declinaison.prixEffectif)}
                  </span>

                  <button
                    type="button"
                    onClick={() => basculer(declinaison)}
                    className={`px-2 py-1 rounded text-xs font-medium transition ${
                      declinaison.isAvailable
                        ? 'bg-orange-50 text-orange-700 hover:bg-orange-100'
                        : 'bg-green-50 text-green-700 hover:bg-green-100'
                    }`}
                  >
                    {declinaison.isAvailable ? t('depleted') : t('restore')}
                  </button>

                  <button
                    type="button"
                    onClick={() => supprimer(declinaison)}
                    aria-label={t('supprimerNom', { nom: declinaison.label })}
                    className="p-1 text-gray-500 hover:text-red-600 transition"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-2 items-end flex-wrap">
            <div className="flex-1 min-w-32">
              <label htmlFor={`nom-${productId}`} className="block text-xs text-gray-500 mb-1">
                {t('newVariantLabel')}
              </label>
              <input
                id={`nom-${productId}`}
                value={nouveauNom}
                onChange={(e) => setNouveauNom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') ajouter();
                }}
                placeholder={t('newVariantPlaceholder')}
                className="w-full bg-gray-100 border border-gray-300 rounded-sm px-2 py-1.5 text-sm focus:outline-hidden focus:border-orange-500"
              />
            </div>

            <div>
              <label htmlFor={`prix-${productId}`} className="block text-xs text-gray-500 mb-1">
                {t('priceLabel')}
              </label>
              <input
                id={`prix-${productId}`}
                type="number"
                step="0.01"
                min={0}
                value={nouveauPrix}
                onChange={(e) => setNouveauPrix(e.target.value)}
                placeholder={String(prixDuPlat)}
                className="w-24 bg-gray-100 border border-gray-300 rounded-sm px-2 py-1.5 text-sm focus:outline-hidden focus:border-orange-500"
              />
            </div>

            <button
              type="button"
              onClick={ajouter}
              aria-label={t('addLabel')}
              disabled={chargement || !nouveauNom.trim()}
              className={`flex items-center gap-1 px-3 py-1.5 rounded text-sm font-semibold transition ${
                nouveauNom.trim()
                  ? 'bg-orange-600 hover:bg-orange-700'
                  : 'bg-gray-100 text-gray-500 cursor-not-allowed'
              }`}
            >
              <Plus size={16} /> {t('addButton')}
            </button>
          </div>

          <p className="text-xs text-gray-500">
            {t('prixVide', { prix: euro(prixDuPlat) })}
          </p>

          <button
            type="button"
            onClick={() => setOuvert(false)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 transition"
          >
            <X size={14} /> {t('replier')}
          </button>
        </div>
      )}
    </div>
  );
}

