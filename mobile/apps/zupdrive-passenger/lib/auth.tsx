import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, apiFetch, setSessionRenewedHandler, setUnauthorizedHandler } from './api';
import { clearSession, loadSession, saveSession, type Session } from './session';

interface AuthContext {
  /** Faux tant que la session du téléphone n'est pas relue. */
  pret: boolean;
  session: Session | null;
  connecter: (email: string, motDePasse: string) => Promise<void>;
  deconnecter: () => Promise<void>;
}

const Contexte = createContext<AuthContext | null>(null);

interface ReponseConnexion {
  accessToken: string;
  refreshToken: string;
  user?: { email?: string };
}

/**
 * La session du passager. `apiFetch` renouvelle seul un jeton périmé : on ne
 * déconnecte que lorsque le serveur refuse vraiment le renouvellement, jamais
 * sur une erreur réseau.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [pret, setPret] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let vivant = true;
    loadSession()
      .then((stockee) => {
        if (vivant && stockee?.accessToken && stockee.refreshToken) setSession(stockee);
      })
      .finally(() => {
        if (vivant) setPret(true);
      });
    return () => {
      vivant = false;
    };
  }, []);

  useEffect(() => {
    setSessionRenewedHandler(setSession);
    setUnauthorizedHandler(() => {
      void clearSession();
      setSession(null);
    });
    return () => {
      setSessionRenewedHandler(null);
      setUnauthorizedHandler(null);
    };
  }, []);

  const connecter = useCallback(async (email: string, motDePasse: string) => {
    const res = await apiFetch<ReponseConnexion>('/api/auth/login', null, {
      method: 'POST',
      body: { email: email.trim(), password: motDePasse },
    });
    if (!res.accessToken || !res.refreshToken) throw new ApiError('Réponse de connexion incomplète', 500);
    const suivante: Session = {
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
      email: res.user?.email || email.trim(),
    };
    await saveSession(suivante);
    setSession(suivante);
  }, []);

  const deconnecter = useCallback(async () => {
    await clearSession();
    setSession(null);
  }, []);

  const valeur = useMemo(() => ({ pret, session, connecter, deconnecter }), [pret, session, connecter, deconnecter]);
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useAuth() {
  const ctx = useContext(Contexte);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return ctx;
}

/** Le jeton d'accès courant, pour un écran qui n'existe que connecté. */
export function useToken(): string {
  const { session } = useAuth();
  return session?.accessToken ?? '';
}

/** Message affichable pour une erreur d'appel : réseau coupé ou erreur du serveur. */
export function messageErreur(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return 'Connexion impossible. Vérifiez votre réseau et réessayez.';
}
