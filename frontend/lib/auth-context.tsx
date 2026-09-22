'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

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
      'Votre session n'est plus valable. Reconnectez-vous.'
    );
  } catch {
    // Stockage refusé : il n'y avait rien à effacer.
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  const refreshAuth = useCallback(async () => {
    try {
      const token = localStorage.getItem('accessToken');
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
      } else {
        const refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken) {
          const refreshResponse = await fetch(`${API_URL}/api/auth/refresh`, {
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

            /**
             * Le compte, ou celui qu'on avait déjà.
             *
             * La route ne rendait que le jeton : `refreshData.user` était donc
             * vide, et un renouvellement réussi déconnectait l'écran. Elle le
             * rend maintenant ; le repli garde l'ancien au cas où.
             */
            setUser((precedent) => refreshData.user || precedent);
          } else {
            // La session est morte pour de bon : on efface, et on le dit à la
            // page de connexion plutôt que de laisser l'écran réessayer.
            oublierLaSession();
            setUser(null);
          }
        } else {
          setUser(null);
        }
      }
    } catch (error) {
      console.error('Auth refresh error:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, [API_URL]);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  useEffect(() => {
    const interval = setInterval(() => {
      refreshAuth();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [refreshAuth]);

  const login = async (email: string, password: string) => {
    const response = await fetch(`${API_URL}/api/auth/login`, {
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
