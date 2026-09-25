import { estUneLangueSupportee, type Langue } from "./langues";

/**
 * Les régions : un pays et la langue dans laquelle on le parcourt. Le code
 * suit la forme pays-langue (be-fr, ch-fr…) parce que c'est celle que
 * prendront les sous-répertoires d'URL (/be-fr/, /ch-fr/…) à l'étape
 * suivante — un pays à plusieurs langues aura une entrée par langue.
 *
 * Seules les langues déjà traduites apparaissent : be-nl ou ch-de viendront
 * ici le jour où messages/nl.json et messages/de.json existeront.
 *
 * Comme langues.ts, ce fichier ne touche pas à next/headers : il est lu côté
 * client par le sélecteur de région.
 */
export interface Region {
  code: string;
  langue: Langue;
  /** Le nom de la langue, écrit dans cette langue. */
  nomLangue: string;
  /** Le nom du pays, écrit dans la langue de la région. */
  nomPays: string;
}

export const REGIONS: readonly Region[] = [
  { code: "fr-fr", langue: "fr", nomLangue: "Français", nomPays: "France" },
  { code: "be-fr", langue: "fr", nomLangue: "Français", nomPays: "Belgique" },
  { code: "ch-fr", langue: "fr", nomLangue: "Français", nomPays: "Suisse" },
  { code: "lu-fr", langue: "fr", nomLangue: "Français", nomPays: "Luxembourg" },
  { code: "ca-fr", langue: "fr", nomLangue: "Français", nomPays: "Canada" },
  { code: "be-en", langue: "en", nomLangue: "English", nomPays: "Belgium" },
  { code: "gb-en", langue: "en", nomLangue: "English", nomPays: "United Kingdom" },
  { code: "ie-en", langue: "en", nomLangue: "English", nomPays: "Ireland" },
  { code: "us-en", langue: "en", nomLangue: "English", nomPays: "United States" },
  { code: "ca-en", langue: "en", nomLangue: "English", nomPays: "Canada" },
];

/** La région retenue quand rien n'a encore été choisi, pour chaque langue. */
const REGION_PAR_LANGUE: Record<Langue, string> = {
  fr: "fr-fr",
  en: "gb-en",
};

export const NOM_COOKIE_REGION = "ZUPONE_REGION";

/**
 * En-tête posé par le middleware quand la page est demandée sous un
 * sous-répertoire de région : la langue et la région de l'adresse priment
 * sur les cookies pour ce rendu-là.
 */
export const ENTETE_REGION = "x-zupone-region";

export function trouverRegion(code: string | undefined): Region | undefined {
  return REGIONS.find((r) => r.code === code);
}

export function regionParDefaut(langue: Langue): Region {
  return trouverRegion(REGION_PAR_LANGUE[langue]) ?? REGIONS[0];
}

/** Le pays d'une région, « be » pour be-fr : ce que l'API filtre. */
export function paysDeLaRegion(region: Region): string {
  return region.code.split("-")[0];
}

/**
 * Le paramètre à ajouter à la liste des commerces pour n'en garder que ceux
 * du pays de la région (« ?pays=be »), vide sans région connue.
 */
export function filtrePays(region: Region | undefined): string {
  return region ? `?pays=${paysDeLaRegion(region)}` : "";
}

/** « fr-BE » pour l'attribut lang de la page. */
export function baliseLangue(region: Region): string {
  return `${region.langue}-${paysDeLaRegion(region).toUpperCase()}`;
}

/**
 * Devine la région d'un visiteur d'après ses langues préférées (en-tête
 * Accept-Language ou navigator.languages) : fr-BE → be-fr, en → gb-en.
 */
export function regionDesLangues(langues: readonly string[]): Region | undefined {
  for (const brute of langues) {
    const [langue, pays] = brute.trim().toLowerCase().split("-");
    const region =
      (pays && trouverRegion(`${pays}-${langue}`)) ||
      (estUneLangueSupportee(langue) ? regionParDefaut(langue) : undefined);
    if (region) return region;
  }
  return undefined;
}

/**
 * Les régions à proposer en tête : celle en cours, puis celles que trahissent
 * les langues du navigateur (fr-BE → be-fr, en-US → us-en, fr → fr-fr),
 * complétées par la France et le Royaume-Uni. Cinq au plus, sans doublon.
 */
export function regionsSuggerees(actuelle: Region, languesNavigateur: readonly string[]): Region[] {
  const codes: string[] = [actuelle.code];

  for (const brute of languesNavigateur) {
    const [langue, pays] = brute.toLowerCase().split("-");
    const code = pays ? `${pays}-${langue}` : REGION_PAR_LANGUE[langue as Langue];
    if (code && trouverRegion(code)) codes.push(code);
  }
  codes.push("fr-fr", "be-fr", "gb-en");

  return Array.from(new Set(codes))
    .slice(0, 5)
    .map((code) => trouverRegion(code)!);
}
