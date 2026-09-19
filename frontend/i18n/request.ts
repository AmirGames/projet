import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { LANGUE_PAR_DEFAUT, NOM_COOKIE_LANGUE, estUneLangueSupportee } from "./langues";

/**
 * Pas de segment d'URL [locale] : trois domaines se partagent déjà le
 * routage (voir middleware.ts), et déplacer les 80 et quelques pages
 * existantes sous un tel segment aurait été un chantier à part entière, bien
 * plus risqué que la mise en place elle-même. La langue vit dans un cookie
 * simple, posé par le sélecteur de langue (voir LanguageSwitcher.tsx) et lu
 * ici à chaque rendu serveur.
 */
export default getRequestConfig(async () => {
  const magasinCookies = await cookies();
  const brute = magasinCookies.get(NOM_COOKIE_LANGUE)?.value;
  const locale = estUneLangueSupportee(brute) ? brute : LANGUE_PAR_DEFAUT;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
