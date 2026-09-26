'use client';

import { signalerErreur, estErreurReseau } from '@/lib/erreurs';
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useEffectChargement } from '@/lib/use-effect-chargement';

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
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('storeId');

    /**
     * Pourquoi la session s'est arrêtée.
     *
     * L'écran renvoyait vers la page de connexion sans un mot : l'utilisateur
     * se retrouvait devant un formulaire vide, persuadé d'avoir été déconnecté
     * par erreur, et réessayait. Le drapeau ne survit pas à l'onglet — c'est
     * un message, pas un état.
     */
    sessionStorage.setItem(
      RAISON_DECONNEXION,
      "Votre session n'est plus valable. Reconnectez-vous."
    );
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

  const refreshAuth = useCallback(async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      const response = await fetch(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      } else if (response.status === 401) {
        const refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken) {
          try {
            const refreshResponse = await fetch(`${API_URL}/auth/refresh`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refreshToken }),
            });

            if (refreshResponse.ok) {
              const refreshData = await refreshResponse.json();
              localStorage.setItem('accessToken', refreshData.accessToken);
              if (refreshData.refreshToken) {
                localStorage.setItem('refreshToken', refreshData.refreshToken);
              }

              setUser((precedent) => refreshData.user || precedent);
            } else {
              oublierLaSession();
              setUser(null);

              const connexion = connexionDeLEspace(window.location.pathname);
              if (connexion) router.replace(connexion);
            }
          } catch (refreshError) {
            signalerErreur('Auth refresh failed:', refreshError);
            if (!estErreurReseau(refreshError)) {
              oublierLaSession();
              setUser(null);
              const connexion = connexionDeLEspace(window.location.pathname);
              if (connexion) router.replace(connexion);
            }
          }
        } else {
          setUser(null);
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
    refreshAuth();
  }, [refreshAuth]);

  useEffect(() => {
    const interval = setInterval(() => {
      refreshAuth();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [refreshAuth]);

  const login = async (email: string, password: string) => {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      throw new Error('Login failed');
    }

    const data = await response.json();
    localStorage.setItem('accessToken', data.accessToken);
    if (data.refreshToken) {
      localStorage.setItem('refreshToken', data.refreshToken);
    }

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
      {children}
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
