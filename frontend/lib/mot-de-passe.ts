/**
 * La règle d'un mot de passe, la même que celle du serveur
 * (`champMotDePasse`, backend/src/utils/validation.ts).
 *
 * Six caractères quelconques suffisaient. Il en faut désormais 8, dont un
 * chiffre, une minuscule et une majuscule ; les caractères spéciaux sont
 * permis sans être exigés. Elle ne s'applique qu'à la création ou au
 * changement d'un mot de passe : la connexion accepte les anciens.
 */
export type CritereMotDePasse = "longueur" | "chiffre" | "minuscule" | "majuscule";

const CRITERES: { cle: CritereMotDePasse; respecte: (mot: string) => boolean }[] = [
  { cle: "longueur", respecte: (mot) => mot.length >= 8 },
  { cle: "chiffre", respecte: (mot) => /[0-9]/.test(mot) },
  { cle: "minuscule", respecte: (mot) => /[a-z]/.test(mot) },
  { cle: "majuscule", respecte: (mot) => /[A-Z]/.test(mot) },
];

/** Chaque critère, et s'il est respecté. */
export function criteresMotDePasse(mot: string) {
  return CRITERES.map(({ cle, respecte }) => ({ cle, ok: respecte(mot) }));
}

export function motDePasseValide(mot: string) {
  return mot.length <= 128 && CRITERES.every(({ respecte }) => respecte(mot));
}
