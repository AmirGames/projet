/**
 * La règle d'un mot de passe, la même que celle du serveur
 * (`champMotDePasse`, backend/src/utils/validation.ts) : 8 caractères
 * minimum, dont un chiffre, une minuscule et une majuscule. Les caractères
 * spéciaux sont permis sans être exigés. Elle ne vaut qu'à la création : la
 * connexion accepte les anciens mots de passe.
 */
export const CRITERES_MOT_DE_PASSE = [
  { libelle: '8 caractères minimum', respecte: (mot: string) => mot.length >= 8 },
  { libelle: 'Au moins un chiffre', respecte: (mot: string) => /[0-9]/.test(mot) },
  { libelle: 'Au moins une lettre minuscule', respecte: (mot: string) => /[a-z]/.test(mot) },
  { libelle: 'Au moins une lettre majuscule', respecte: (mot: string) => /[A-Z]/.test(mot) },
];

export const MESSAGE_MOT_DE_PASSE =
  'Le mot de passe doit contenir 8 caractères minimum, dont un chiffre, une minuscule et une majuscule.';

export function motDePasseValide(mot: string) {
  return mot.length <= 128 && CRITERES_MOT_DE_PASSE.every(({ respecte }) => respecte(mot));
}
