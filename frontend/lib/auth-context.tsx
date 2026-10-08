'use client';

import { signalerErreur, estErreurReseau } from '@/lib/erreurs';
import React, { Suspense, createContext, use, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import { fermerSessionPartout } from '@/lib/sso';
import { ENTETE_TRANSPORT, renouveler, sessionARetrouver, sessionPerdueAuDemarrage, sessionPrete, jetonAcces, poserJeton, oublierJeton } from '@/lib/jeton-session';

interface User {
  id: string;
  email: string;
  name?: string;
  isSystemAdmin?: boolean;
  isSuperOwner?: boolean;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Efface la session d'un navigateur.
 *
 * Une base remise à zéro laisse le navigateur porteur d'un jeton signé pour un
 * compte disparu. Le serveur répond alors 401 `SESSION_INVALIDE` : il n'y a
 * rien à réessayer, il faut se reconnecter.
 */
export const RAISON_DECONNEXION = 'raisonDeconnexion';

function oublierLaSession() {
  try {
    oublierJeton();
    localStorage.removeItem('storeId');

    /**
     * Pourquoi la session s'est arrêtée.
     *
     * L'écran renvoyait vers la page de connexion sans un mot : l'utilisateur
     * se retrouvait devant un formulaire vide, persuadé d'avoir été déconnecté
     * par erreur, et réessayait. Le drapeau ne survit pas à l'onglet — c'est
     * un message, pas un état.
     */
    // Un drapeau : la page de connexion dit pourquoi, dans la langue du visiteur.
    sessionStorage.setItem(RAISON_DECONNEXION, "session-expiree");
  } catch {
    // Stockage refusé : il n'y avait rien à effacer.
  }
}

/**
 * La page de connexion de l'espace où se trouve l'utilisateur, ou null sur une
 * page ouverte à tous.
 *
 * Une session morte effaçait les jetons sans quitter l'écran : le commerçant
 * restait devant un tableau de bord qui ne chargeait plus rien. Seuls les
 * espaces réservés renvoient vers la connexion — un visiteur resté sur une
 * vitrine avec une vieille session n'a rien à y faire.
 */
function connexionDeLEspace(chemin: string): string | null {
  const sous = (prefixe: string) => chemin === prefixe || chemin.startsWith(`${prefixe}/`);

  if (sous('/driver')) {
    return sous('/driver/login') || sous('/driver/signup') ? null : '/driver/login';
  }
  if (sous('/merchant') || sous('/superowner') || sous('/dashboard')) return '/login';
  return null;
}

// Une seule promesse par chargement de page : `use` doit revoir la même à
// chaque tentative, sinon la page resterait suspendue.
let attenteSession: Promise<void> | null = null;

/**
 * Retient les pages jusqu'à ce que la session soit retrouvée, sans casser
 * l'hydratation.
 *
 * Rendre `null` à la place des pages, côté navigateur seulement, ne
 * correspondait plus au HTML du serveur : React abandonnait l'hydratation et
 * refaisait la page à côté de la première, d'où l'en-tête affiché deux fois
 * pour un visiteur déjà connecté. Suspendre dans une frontière Suspense
 * laisse au contraire le HTML du serveur en place, jusqu'à ce que la session
 * soit prête.
 */
function AttendreSession({ pret, children }: { pret: boolean; children: React.ReactNode }) {
  // Une fois suspendu, on rappelle `use` à chaque rendu (la promesse est alors
  // résolue, il rend aussitôt) : React refuse qu'un composant cesse d'appeler
  // `use` après avoir suspendu.
  if (!pret || attenteSession) {
    attenteSession ??= sessionPrete();
    use(attenteSession);
  }
  return <>{children}</>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Après un rechargement, le jeton d'accès (en mémoire) est perdu : on attend
  // qu'il soit redemandé avant d'afficher des pages qui le lisent aussitôt.
  // Sans session à retrouver (visiteurs, robots), rien ne change.
  const [sessionOk, setSessionOk] = useState(() => !sessionARetrouver());

  useEffect(() => {
    if (sessionOk) return;
    sessionPrete().then(() => {
      // Refusée au chargement : même suite qu'un refus en cours de route — le
      // message, puis la connexion de l'espace où l'on se trouve.
      if (sessionPerdueAuDemarrage()) {
        oublierLaSession();
        const connexion = connexionDeLEspace(window.location.pathname);
        if (connexion) router.replace(connexion);
      }
      setSessionOk(true);
    });
  }, [sessionOk, router]);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  const refreshAuth = useCallback(async () => {
    try {
      const token = jetonAcces();
      if (!token) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      const response = await fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      } else if (response.status === 401) {
        // Le jeton d'accès (15 minutes) a expiré : le cookie de renouvellement
        // en donne un neuf. Refusé, la session est finie.
        const renouvele = await renouveler();

        if (renouvele.ok) {
          setUser((precedent) => renouvele.donnees.user || precedent);
        } else if (renouvele.statut === 401 || renouvele.statut === 403) {
          oublierLaSession();
          setUser(null);

          const connexion = connexionDeLEspace(window.location.pathname);
          if (connexion) router.replace(connexion);
        } else {
          // Réseau ou serveur en défaut : on garde la session telle quelle.
          signalerErreur('Auth refresh failed:', renouvele.statut);
        }
      } else {
        signalerErreur('Auth check failed:', response.status);
      }
    } catch (error) {
      signalerErreur('Auth refresh error:', error);
      if (!estErreurReseau(error)) {
        setUser(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, [API_URL, router]);

  useEffectChargement(() => {
    if (sessionOk) refreshAuth();
  }, [refreshAuth, sessionOk]);

  useEffect(() => {
    const interval = setInterval(() => {
      refreshAuth();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [refreshAuth]);

  const login = async (email: string, password: string) => {
    // Par le site lui-même : le cookie de renouvellement doit être posé ici.
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...ENTETE_TRANSPORT },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      throw new Error('Login failed');
    }

    const data = await response.json();
    poserJeton(data.accessToken);

    // Store organization and driver info
    if (data.organization?.id) {
      localStorage.setItem('currentOrgId', data.organization.id);
    }
    if (data.driver?.id) {
      localStorage.setItem('currentDriverId', data.driver.id);
    }

    setUser(data.user);
  };

  const logout = () => {
    // Ferme la session sur tous les domaines (le jeton est lu avant d'être
    // effacé), puis l'efface d'ici.
    fermerSessionPartout();
    oublierLaSession();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        refreshAuth,
      }}
    >
      <Suspense fallback={null}>
        <AttendreSession pret={sessionOk}>{children}</AttendreSession>
      </Suspense>
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
