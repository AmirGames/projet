import type { Metadata } from 'next';
import { headers } from 'next/headers';
import {
  ENTETE_CHEMIN,
  ENTETE_REGION,
  REGIONS,
  baliseLangue,
  paysDeLaRegion,
  trouverRegion,
  type Region,
} from '@/i18n/regions';

/**
 * Ce que les moteurs de recherche doivent savoir d'une page régionale.
 *
 * La même page existe sous plusieurs adresses (/be-fr/cgu, /fr-fr/cgu,
 * /gb-en/cgu…). Sans indication, Google y voit du contenu dupliqué et n'en
 * garde qu'une, au hasard. On lui dit donc :
 *
 * - `canonical` : l'adresse de référence de cette version-ci ;
 * - `hreflang` : toutes les versions régionales, chacune avec sa langue et
 *   son pays (fr-BE, en-GB…), pour qu'il montre la bonne à chacun ;
 * - `x-default` : l'adresse sans préfixe, qui envoie le visiteur vers sa
 *   région.
 */

/** L'adresse du site telle que le visiteur l'a demandée, pour les liens absolus. */
export async function baseDuSite(): Promise<URL> {
  const entetes = await headers();
  const hote = entetes.get('x-forwarded-host') || entetes.get('host') || 'localhost:3000';
  const protocole =
    entetes.get('x-forwarded-proto') ||
    (/^(localhost|127\.|\[::1\])/.test(hote) ? 'http' : 'https');
  return new URL(`${protocole}://${hote}`);
}

/** Les régions où une page existe : toutes, ou celles d'un pays. */
export function regionsDuPays(pays?: string | null): readonly Region[] {
  const duPays = pays ? REGIONS.filter((r) => paysDeLaRegion(r) === pays) : [];
  return duPays.length > 0 ? duPays : REGIONS;
}

const adresse = (region: Region, chemin: string) => `/${region.code}${chemin === '/' ? '' : chemin}`;

/**
 * Les balises canonical et hreflang de la page en cours, vides hors des
 * sous-répertoires de région.
 *
 * `pays` restreint les versions à un pays : la vitrine d'un commerce belge
 * n'existe, pour Google, que sous /be-fr/ et /be-en/. Ouverte sous /fr-fr/,
 * elle désigne comme référence sa version belge dans la même langue.
 */
export async function alternatesRegionales(pays?: string | null): Promise<Metadata['alternates']> {
  const entetes = await headers();
  const region = trouverRegion(entetes.get(ENTETE_REGION) ?? undefined);
  const chemin = entetes.get(ENTETE_CHEMIN);
  if (!region || !chemin) return undefined;

  const versions = regionsDuPays(pays);
  const reference =
    versions.find((r) => r.code === region.code) ??
    versions.find((r) => r.langue === region.langue) ??
    versions[0];

  return {
    canonical: adresse(reference, chemin),
    languages: {
      ...Object.fromEntries(versions.map((r) => [baliseLangue(r), adresse(r, chemin)])),
      'x-default': chemin,
    },
  };
}

/** Pour le sitemap : les adresses d'un chemin dans chacune de ses régions. */
export function adressesRegionales(chemin: string, pays?: string | null) {
  const versions = regionsDuPays(pays);
  return versions.map((r) => ({
    chemin: adresse(r, chemin),
    langues: Object.fromEntries(versions.map((v) => [baliseLangue(v), adresse(v, chemin)])),
  }));
}
