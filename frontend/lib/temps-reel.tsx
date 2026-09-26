'use client';

import { useEffect, useState } from 'react';
import { useDerniereValeur } from '@/lib/use-derniere-valeur';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from '@/lib/auth-context';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Une seule connexion en direct pour tout l'onglet.
 *
 * Chaque composant ouvrait la sienne : la cloche, la sonnerie des commandes,
 * le statut du compte, le suivi… jusqu'à cinq connexions pour une même page,
 * chacune avec sa poignée de main et sa reconnexion. Elles passent désormais
 * toutes par celle-ci.
 */
let socket: Socket | null = null;

/** Les salons suivis, et combien d'écrans les suivent. */
const salons = new Map<string, number>();

/** Au-delà, on retente moins souvent. */
const ATTENTE_MAX_MS = 60000;
let attente = 2000;
let relance: ReturnType<typeof setTimeout> | undefined;

function jeton(): string | null {
  try {
    // L'espace livreur a longtemps rangé sa session sous sa propre clé : une
    // inscription de livreur ne remplit parfois que celle-là.
    return localStorage.getItem('accessToken') || localStorage.getItem('driverToken');
  } catch {
    return null;
  }
}

/** Le compte porté par un jeton, lu sans le vérifier : c'est l'affaire du serveur. */
function identiteDuJeton(valeur: string | null): string | null {
  if (!valeur) return null;
  try {
    const charge = valeur.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(charge)).userId ?? null;
  } catch {
    return null;
  }
}

/** Le compte sous lequel la connexion a été ouverte. */
let identiteConnectee: string | null = null;

function rejoindreTout(connexion: Socket) {
  for (const cle of salons.keys()) {
    const [type, id] = cle.split(':');
    connexion.emit(`join-${type}`, id);
  }
}

/** La connexion de l'onglet, ouverte à la première demande. */
export function connexionTempsReel(): Socket {
  if (socket) {
    // Une connexion ou une déconnexion faite ailleurs (autre onglet, page de
    // connexion du livreur) : le serveur nous range encore sous l'ancien
    // compte, et nos salons nominatifs ne sont plus les bons.
    if (identiteDuJeton(jeton()) !== identiteConnectee) reconnecterTempsReel();
    return socket;
  }

  // Retenu dès maintenant : la poignée de main ne lit le jeton qu'un peu plus
  // tard, et l'écran suivant croirait sinon à un changement de compte.
  identiteConnectee = identiteDuJeton(jeton());

  socket = io(API_URL, {
    // Relu à chaque (re)connexion : un jeton renouvelé est pris en compte
    // sans rien avoir à refaire. Sans jeton, la connexion est anonyme — la
    // vitrine est publique.
    auth: (rappel) => {
      const valeur = jeton();
      identiteConnectee = identiteDuJeton(valeur);
      rappel(valeur ? { token: valeur } : {});
    },
    transports: ['websocket', 'polling'],
  });

  // Les salons se perdent à chaque coupure : le serveur ne les garde pas.
  socket.on('connect', () => {
    attente = 2000;
    rejoindreTout(socket!);
  });

  // Un refus du serveur (jeton expiré) n'est pas retenté par Socket.IO : on
  // le fait nous-mêmes, le jeton ayant pu être renouvelé entre-temps.
  socket.on('connect_error', () => {
    if (socket?.active) return;
    clearTimeout(relance);
    relance = setTimeout(() => socket?.connect(), attente);
    attente = Math.min(attente * 2, ATTENTE_MAX_MS);
  });

  return socket;
}

/**
 * Reprend la connexion sous l'identité actuelle.
 *
 * À appeler après une connexion ou une déconnexion : le serveur range chaque
 * connexion dans les salons de son compte au moment de la poignée de main.
 */
export function reconnecterTempsReel() {
  if (!socket) return;
  identiteConnectee = identiteDuJeton(jeton());
  clearTimeout(relance);
  attente = 2000;
  socket.disconnect().connect();
}

/**
 * Suit un salon (une boutique, une commande) tant que l'écran est ouvert.
 *
 * Plusieurs écrans peuvent suivre le même : on ne le quitte qu'au départ du
 * dernier. Rend la fonction qui le quitte.
 */
export function suivreSalon(type: 'store' | 'order', id: string): () => void {
  const connexion = connexionTempsReel();
  const cle = `${type}:${id}`;
  const nombre = salons.get(cle) || 0;

  salons.set(cle, nombre + 1);
  if (nombre === 0 && connexion.connected) connexion.emit(`join-${type}`, id);

  let quitte = false;

  return () => {
    if (quitte) return;
    quitte = true;

    const restant = (salons.get(cle) || 1) - 1;
    if (restant > 0) {
      salons.set(cle, restant);
      return;
    }

    salons.delete(cle);
    if (connexion.connected) connexion.emit(`leave-${type}`, id);
  };
}

/**
 * Écoute un événement du serveur tant que l'écran est ouvert.
 *
 * Le rappel est relu à chaque événement plutôt que capturé à l'ouverture :
 * sinon il garderait l'état d'origine de l'écran.
 */
export function useTempsReel<T = any>(
  evenement: string,
  rappel: (donnees: T) => void,
  actif = true
) {
  const rappelRef = useDerniereValeur(rappel);

  useEffect(() => {
    if (!actif) return;

    const connexion = connexionTempsReel();
    const ecouteur = (donnees: T) => rappelRef.current(donnees);

    connexion.on(evenement, ecouteur);
    return () => {
      connexion.off(evenement, ecouteur);
    };
  }, [evenement, actif, rappelRef]);
}

/** Suit un salon tant que l'écran est ouvert (voir `suivreSalon`). */
export function useSalon(type: 'store' | 'order', id: string | null | undefined) {
  useEffect(() => {
    if (!id) return;
    return suivreSalon(type, id);
  }, [type, id]);
}

/** La connexion en direct est-elle établie. */
export function useConnexionTempsReel() {
  const [connecte, setConnecte] = useState(false);

  useEffect(() => {
    const connexion = connexionTempsReel();
    const ouvert = () => setConnecte(true);
    const ferme = () => setConnecte(false);

    setConnecte(connexion.connected);
    connexion.on('connect', ouvert);
    connexion.on('disconnect', ferme);

    return () => {
      connexion.off('connect', ouvert);
      connexion.off('disconnect', ferme);
    };
  }, []);

  return connecte;
}

/** Ce que le serveur annonce après chaque écriture réussie. */
export interface Modification {
  /** La famille de données : `orders`, `products`, `store-hours`… */
  ressource: string;
  action: 'creation' | 'modification' | 'suppression';
  id?: string;
  storeId?: string;
  orgId?: string;
  horodatage: string;
}

interface OptionsModifications {
  /** Ne retenir que les modifications de cette boutique. */
  storeId?: string | null;
  /** Ne retenir que les modifications de cette organisation. */
  orgId?: string | null;
  /** Ne retenir que les modifications de cette donnée (une page de détail). */
  id?: string | null;
  /** Les écritures arrivées pendant ce délai ne déclenchent qu'une relecture. */
  delaiMs?: number;
  actif?: boolean;
}

/**
 * Relit un écran quand ses données changent ailleurs.
 *
 * `ressources` désigne les familles qui l'intéressent (`'orders'`,
 * `['products', 'categories']`) ; `'*'` les prend toutes. Une modification
 * sans boutique ni organisation connue est retenue par prudence : mieux vaut
 * une relecture de trop qu'un écran périmé.
 *
 * Après une coupure, l'écran se relit aussi : des modifications ont pu passer
 * pendant qu'il n'écoutait pas.
 */
export function useDonneesModifiees(
  ressources: string | string[],
  relire: (modification?: Modification) => void,
  options: OptionsModifications = {}
) {
  const { storeId, orgId, id, delaiMs = 300, actif = true } = options;
  const relireRef = useDerniereValeur(relire);

  const liste = Array.isArray(ressources) ? ressources : [ressources];
  const cle = liste.join('|');

  useEffect(() => {
    if (!actif) return;

    const familles = new Set(cle.split('|'));
    const connexion = connexionTempsReel();
    let minuteur: ReturnType<typeof setTimeout> | undefined;
    let derniere: Modification | undefined;
    let dejaConnecte = connexion.connected;

    // Au plus une relecture par intervalle : les écritures qui arrivent
    // pendant l'attente la rejoignent. Repousser l'attente à chacune ferait
    // attendre indéfiniment un écran qui voit passer une activité continue.
    const planifier = (modification?: Modification) => {
      derniere = modification;
      if (minuteur) return;
      minuteur = setTimeout(() => {
        minuteur = undefined;
        relireRef.current(derniere);
      }, delaiMs);
    };

    const surModification = (modification: Modification) => {
      if (!familles.has('*') && !familles.has(modification.ressource)) return;
      if (storeId && modification.storeId && modification.storeId !== storeId) return;
      if (orgId && modification.orgId && modification.orgId !== orgId) return;
      if (id && modification.id && modification.id !== id) return;
      planifier(modification);
    };

    const surConnexion = () => {
      // La première connexion n'a rien manqué : l'écran vient de se charger.
      if (dejaConnecte) planifier();
      dejaConnecte = true;
    };

    connexion.on('donnees-modifiees', surModification);
    connexion.on('connect', surConnexion);

    return () => {
      clearTimeout(minuteur);
      connexion.off('donnees-modifiees', surModification);
      connexion.off('connect', surConnexion);
    };
  }, [cle, storeId, orgId, id, delaiMs, actif, relireRef]);
}

/**
 * Ouvre la connexion de l'onglet et la tient sous la bonne identité.
 *
 * Posé une fois, dans la mise en page racine.
 */
export function TempsReelProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const identite = user?.id ?? null;

  // À chaque changement de compte, ici ou dans un autre onglet, la connexion
  // vérifie qu'elle porte toujours le bon.
  useEffect(() => {
    if (isLoading) return;
    connexionTempsReel();
  }, [identite, isLoading]);

  useEffect(() => {
    const surStockage = (evenement: StorageEvent) => {
      if (evenement.key === 'accessToken' || evenement.key === 'driverToken' || evenement.key === null) {
        connexionTempsReel();
      }
    };
    window.addEventListener('storage', surStockage);
    return () => window.removeEventListener('storage', surStockage);
  }, []);

  return <>{children}</>;
}
