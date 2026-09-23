'use client';

import { useMemo, useState } from 'react';

export interface Colonne {
  /** Libellé court sous la colonne (peut être vide pour alléger l'axe). */
  label: string;
  /** Libellé complet, pour l'infobulle et le tableau. */
  labelComplet: string;
  valeur: number;
  /** Lignes supplémentaires de l'infobulle. */
  details?: string[];
}

interface Props {
  titre: string;
  colonnes: Colonne[];
  format: (valeur: number) => string;
  /** Format des graduations, plus court que celui des valeurs (« 40 € »). */
  formatAxe?: (valeur: number) => string;
  /** Nom de la mesure, en-tête de la colonne du tableau. */
  mesure: string;
  hauteur?: number;
}

/** Un pas d'axe « rond » (1, 2, 5 × 10ⁿ) donnant environ quatre graduations. */
function pasRond(max: number) {
  if (max <= 0) return 1;
  const brut = max / 4;
  const puissance = 10 ** Math.floor(Math.log10(brut));
  const normalise = brut / puissance;
  const facteur = normalise <= 1 ? 1 : normalise <= 2 ? 2 : normalise <= 5 ? 5 : 10;
  return facteur * puissance;
}

// Une seule série : la couleur d'accent, validée sur la surface sombre
// (OKLCH L dans la bande 0,48–0,67, contraste ≥ 3:1 sur gray-800).
const ACCENT = '#ea580c';

/**
 * Histogramme en colonnes, une série.
 *
 * Colonnes fines à bout arrondi posées sur une ligne de base, grille discrète,
 * infobulle au survol ou au focus clavier, et une vue tableau pour qui ne
 * lit pas le graphique.
 */
export function GraphiqueColonnes({ titre, colonnes, format, formatAxe = format, mesure, hauteur = 180 }: Props) {
  const [survol, setSurvol] = useState<number | null>(null);
  const [tableau, setTableau] = useState(false);

  const { pas, plafond } = useMemo(() => {
    const max = Math.max(0, ...colonnes.map((c) => c.valeur));
    const p = pasRond(max);
    return { pas: p, plafond: Math.max(p, Math.ceil(max / p) * p) };
  }, [colonnes]);

  const graduations = Array.from({ length: Math.round(plafond / pas) + 1 }, (_, i) => i * pas);
  const vide = colonnes.every((c) => c.valeur === 0);

  return (
    <figure className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <figcaption className="flex items-center justify-between gap-2 mb-4">
        <span className="text-white font-semibold">{titre}</span>
        <button
          onClick={() => setTableau((t) => !t)}
          className="text-xs text-gray-400 hover:text-white underline"
          aria-pressed={tableau}
        >
          {tableau ? 'Voir le graphique' : 'Voir le tableau'}
        </button>
      </figcaption>

      {tableau ? (
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 text-left">
                <th className="font-medium py-1">Période</th>
                <th className="font-medium py-1 text-right">{mesure}</th>
              </tr>
            </thead>
            <tbody>
              {colonnes.map((c) => (
                <tr key={c.labelComplet} className="border-t border-gray-700">
                  <td className="py-1 text-gray-300">{c.labelComplet}</td>
                  <td className="py-1 text-right text-gray-100 tabular-nums">{format(c.valeur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex gap-2 pt-3">
          {/* Axe des valeurs */}
          <div className="relative w-12 flex-shrink-0 text-[11px] text-gray-500" style={{ height: hauteur }}>
            {graduations.map((g) => (
              <span
                key={g}
                className="absolute right-0 -translate-y-1/2 tabular-nums"
                style={{ bottom: `${(g / plafond) * 100}%` }}
              >
                {formatAxe(g)}
              </span>
            ))}
          </div>

          <div className="flex-1 min-w-0">
            <div className="relative" style={{ height: hauteur }}>
              {/* Grille : filets pleins d'un pixel, discrets */}
              {graduations.map((g) => (
                <div
                  key={g}
                  className="absolute left-0 right-0 border-t border-gray-700"
                  style={{ bottom: `${(g / plafond) * 100}%` }}
                />
              ))}

              {vide && (
                <p className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
                  Aucune course sur la période
                </p>
              )}

              <div className="absolute inset-0 flex items-end">
                {colonnes.map((c, i) => {
                  const h = plafond > 0 ? (c.valeur / plafond) * 100 : 0;
                  const actif = survol === i;
                  return (
                    <div
                      key={c.labelComplet}
                      // La zone de survol couvre toute la hauteur de la tranche,
                      // bien plus large que la colonne elle-même.
                      className="relative flex-1 h-full flex items-end justify-center outline-none"
                      tabIndex={0}
                      role="img"
                      aria-label={`${c.labelComplet} : ${format(c.valeur)}`}
                      onMouseEnter={() => setSurvol(i)}
                      onMouseLeave={() => setSurvol(null)}
                      onFocus={() => setSurvol(i)}
                      onBlur={() => setSurvol(null)}
                    >
                      {actif && <div className="absolute inset-y-0 w-full bg-white/5 rounded" />}
                      {c.valeur > 0 && (
                        <div
                          className="relative rounded-t"
                          style={{
                            height: `${h}%`,
                            width: 'min(24px, calc(100% - 2px))',
                            background: ACCENT,
                            opacity: survol == null || actif ? 1 : 0.55,
                          }}
                        />
                      )}

                      {actif && (
                        <div
                          className={`absolute z-10 top-0 min-w-[8rem] rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-xs shadow-lg pointer-events-none ${
                            i > colonnes.length / 2 ? 'right-0' : 'left-0'
                          }`}
                        >
                          <p className="text-gray-400">{c.labelComplet}</p>
                          <p className="text-white font-semibold text-sm flex items-center gap-1.5">
                            <span className="inline-block w-2 h-2 rounded-sm" style={{ background: ACCENT }} />
                            {format(c.valeur)}
                          </p>
                          {c.details?.map((d) => (
                            <p key={d} className="text-gray-300">
                              {d}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Axe des catégories : libellés allégés par l'appelant */}
            <div className="flex mt-1">
              {colonnes.map((c) => (
                // Libellé centré sur sa colonne, libre de déborder sur les
                // voisines vides : tronqué, « 25 sept. » devenait « 25 … ».
                <span key={c.labelComplet} className="relative flex-1 h-4">
                  {c.label && (
                    <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] text-gray-500">
                      {c.label}
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </figure>
  );
}
