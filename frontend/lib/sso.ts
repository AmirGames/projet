'use client';

import {
  CLOISONNEMENT_ACTIF,
  DOMAINE_VITRINE,
  espaceDuDomaine,
  lienVersEspace,
  type EspaceHeberge,
} from '@/lib/domaines';

/**
 * Connexion unique entre les domaines, côté navigateur.
 *
 * zupone.com tient la session dans un cookie qu'il est seul à lire (voir
 * app/sso/…/route.ts et, côté API, sso.service.ts). Les autres domaines la
 * lui demandent par un aller-retour éclair, et reçoivent un code à usage
 * unique qu'ils échangent contre leurs jetons.
 *
 * Tout est facultatif : sans domaine de la vitrine configuré, ou si l'API a la
 * connexion unique éteinte, chaque domaine garde sa session comme avant.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/** La vérification auprès de zupone.com n'a lieu qu'une fois par onglet. */
const DEJA_VERIFIE = 'sso-verifie';

export const SSO_ACTIF = CLOISONNEMENT_ACTIF && !!DOMAINE_VITRINE;

/** Une page du domaine central (https://zupone.com/sso/…), port compris en développement. */
function pageCentrale(chemin: string): string {
  return lienVersEspace('vitrine', chemin);
}

function origineCentrale(): string {
  return new URL(pageCentrale('/'), window.location.href).origin;
}

function lire(cle: string, stockage: 'local' | 'session' = 'local'): string | null {
  try {
    return (stockage === 'local' ? localStorage : sessionStorage).getItem(cle);
  } catch {
    return null;
  }
}

function noter(cle: string, valeur: string) {
  try {
    sessionStorage.setItem(cle, valeur);
  } catch {
    // Stockage refusé : la vérification se refera, sans plus.
  }
}

/** Où arrive un utilisateur connecté, selon le domaine. */
const ACCUEIL_CONNECTE: Record<EspaceHeberge, string> = {
  pro: '/merchant',
  livreur: '/driver',
  groupe: '/superowner',
  public: '/client',
  vitrine: '/',
  drive: '/',
};

export function accueilConnecte(): string {
  const espace = espaceDuDomaine(window.location.host);
  return espace ? ACCUEIL_CONNECTE[espace] : '/dashboard';
}

/** Un chemin de ce domaine, et rien d'autre : ni //ailleurs.com, ni https://… */
export function cheminSur(suite: string | null | undefined, repli: string): string {
  if (!suite || !suite.startsWith('/') || suite.startsWith('//') || suite.startsWith('/\\')) return repli;
  return suite;
}

/**
 * Après une connexion réussie sur ce domaine : confier la session à zupone.com,
 * puis revenir à `destination`.
 *
 * Rend `true` si le navigateur part vers zupone.com — l'appelant n'a alors plus
 * rien à faire. `false` : pas de connexion unique ici, l'appelant enchaîne
 * comme avant.
 */
export async function confierSessionCentrale(accessToken: string, destination: string): Promise<boolean> {
  if (!SSO_ACTIF || !accessToken) return false;

  try {
    const reponse = await fetch(`${API_URL}/api/sso/code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ audience: origineCentrale() }),
    });
    if (!reponse.ok) return false;

    const { code } = await reponse.json();
    const retour = new URL(cheminSur(destination, accueilConnecte()), window.location.origin).toString();

    // Déjà connecté ici : inutile de redemander la session à zupone.com dans
    // cet onglet.
    noter(DEJA_VERIFIE, '1');
    // Vers zupone.com, un autre domaine : le routeur de Next n'y va pas.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(
      `${pageCentrale('/sso/etablir')}?code=${encodeURIComponent(code)}&retour=${encodeURIComponent(retour)}`,
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Sur une page de connexion, sans session sur ce domaine : demander à
 * zupone.com si l'utilisateur est déjà connecté ailleurs.
 *
 * Une seule fois par onglet : après un refus (personne de connecté), ou pour
 * un compte qui n'a pas accès à l'espace demandé, on reste sur le formulaire
 * au lieu de tourner en rond.
 *
 * Rend `true` si le navigateur part vers zupone.com.
 */
export function demanderSessionCentrale(suite: string): boolean {
  if (!SSO_ACTIF) return false;
  if (lire('accessToken') || lire('driverToken')) return false;
  if (lire(DEJA_VERIFIE, 'session')) return false;

  noter(DEJA_VERIFIE, '1');

  const arrivee = new URL('/sso/arrivee', window.location.origin);
  // Où aller si une session revient, et où revenir sinon : sans détour par
  // une page réservée qui renverrait aussitôt ici.
  arrivee.searchParams.set('suite', cheminSur(suite, accueilConnecte()));
  arrivee.searchParams.set('depart', window.location.pathname + window.location.search);
  window.location.replace(`${pageCentrale('/sso/verifier')}?retour=${encodeURIComponent(arrivee.toString())}`);
  return true;
}

/**
 * Se déconnecter partout : la session est fermée côté serveur, ses jetons
 * cessent de valoir sur tous les domaines, le cookie de zupone.com avec eux.
 *
 * Le stockage de ce domaine reste à vider par l'appelant, comme avant.
 */
export async function fermerSessionPartout(): Promise<void> {
  const jeton = lire('accessToken') || lire('driverToken');
  // Déconnecté à dessein : ne pas se faire reconnecter aussitôt par zupone.com.
  noter(DEJA_VERIFIE, '1');
  if (!jeton) return;

  try {
    await fetch(`${API_URL}/api/sso/deconnexion`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jeton}` },
    });
  } catch {
    // API injoignable : la session locale est effacée quand même, et celle du
    // serveur expirera.
  }
}
