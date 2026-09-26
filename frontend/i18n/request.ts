import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { LANGUE_PAR_DEFAUT, NOM_COOKIE_LANGUE, estUneLangueSupportee } from "./langues";
import { ENTETE_REGION, trouverRegion } from "./regions";

/**
 * Pas de segment d'URL [locale] : trois domaines se partagent déjà le
 * routage (voir proxy.ts), et déplacer les 80 et quelques pages
 * existantes sous un tel segment aurait été un chantier à part entière, bien
 * plus risqué que la mise en place elle-même. La langue vit dans un cookie
 * simple, posé par le sélecteur de langue (voir LanguageSwitcher.tsx) et lu
 * ici à chaque rendu serveur.
 *
 * Exception : une page publique demandée sous un sous-répertoire de région
 * (/gb-en/…) prend la langue de cette région, que le proxy transmet par
 * un en-tête — l'adresse fait foi, même avant que le cookie ne suive.
 */
export default getRequestConfig(async () => {
  const magasinCookies = await cookies();
  const brute = magasinCookies.get(NOM_COOKIE_LANGUE)?.value;
  const regionAdresse = trouverRegion((await headers()).get(ENTETE_REGION) ?? undefined);
  const locale = regionAdresse?.langue ?? (estUneLangueSupportee(brute) ? brute : LANGUE_PAR_DEFAUT);

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
