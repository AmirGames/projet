import { trouverRegion, type Region } from "./regions";

/**
 * Les pages publiques servies sous un sous-répertoire de région
 * (/be-fr/restaurants, /fr-fr/store/…). Ce sont celles que les moteurs de
 * recherche indexent : l'accueil, les commerces, les pages légales et les
 * pages « devenir ». Les espaces derrière une connexion (commerçant,
 * livreur, plateforme, compte client) et le tunnel de commande restent sans
 * préfixe — le cookie de région y suffit.
 *
 * Aucune page n'est déplacée : le middleware retire le préfixe et réécrit la
 * requête vers la page d'origine (voir middleware.ts).
 *
 * Fichier sans dépendance serveur ni navigateur : il est lu par le
 * middleware (edge), par le layout et par les liens côté client.
 */
const SEGMENTS_REGIONAUX = [
  "restaurants",
  "restaurant",
  "store",
  "mentions-legales",
  "cgu",
  "cgv",
  "conditions-commercants",
  "conditions-livreurs",
  "confidentialite",
  "cookies",
  "devenir-commercant",
  "devenir-livreur",
  "devenir-chauffeur",
];

/** La création de boutique vit sous /store mais appartient au commerçant. */
const EXCEPTIONS = ["/store/new"];

export function estCheminRegional(chemin: string): boolean {
  if (chemin === "/") return true;
  if (EXCEPTIONS.some((e) => chemin === e || chemin.startsWith(`${e}/`))) return false;
  return SEGMENTS_REGIONAUX.includes(chemin.split("/")[1] || "");
}

/** Sépare /be-fr/restaurants en { region: be-fr, reste: /restaurants }. */
export function separerRegion(chemin: string): { region?: Region; reste: string } {
  const [, premier, ...suite] = chemin.split("/");
  const region = trouverRegion(premier?.toLowerCase());
  if (!region) return { reste: chemin };
  return { region, reste: `/${suite.join("/")}` };
}

/**
 * Préfixe un lien interne par la région s'il mène à une page régionale ;
 * les autres liens (et ceux qui portent déjà une région) passent tels quels.
 */
export function ajouterRegion(href: string, code: string): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;

  const coupure = href.search(/[?#]/);
  const chemin = coupure === -1 ? href : href.slice(0, coupure);
  const suite = coupure === -1 ? "" : href.slice(coupure);

  if (separerRegion(chemin).region || !estCheminRegional(chemin)) return href;
  return `/${code}${chemin === "/" ? "" : chemin}${suite}`;
}
