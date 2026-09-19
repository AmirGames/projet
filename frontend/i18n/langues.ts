/**
 * Les langues supportées, et celle qui s'applique quand rien n'a encore été
 * choisi. Toute la plateforme est en français aujourd'hui — l'anglais est le
 * premier ajout, les autres viendront à côté au même endroit.
 *
 * Ce fichier ne contient volontairement rien qui touche à next/headers : il
 * est importé à la fois par i18n/request.ts (serveur) et par
 * LanguageSwitcher.tsx (client), et un import serveur-only ferait échouer le
 * bundle client si les deux partageaient le même fichier.
 */
export const LANGUES_SUPPORTEES = ["fr", "en"] as const;
export type Langue = (typeof LANGUES_SUPPORTEES)[number];
export const LANGUE_PAR_DEFAUT: Langue = "fr";

export const NOM_COOKIE_LANGUE = "NEXT_LOCALE";

export function estUneLangueSupportee(valeur: string | undefined): valeur is Langue {
  return !!valeur && (LANGUES_SUPPORTEES as readonly string[]).includes(valeur);
}
