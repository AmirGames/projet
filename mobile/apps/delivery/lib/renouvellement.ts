/**
 * Le renouvellement de la session, sans dépendance native (testable seul).
 *
 * Le jeton d'accès vit 15 minutes ; le jeton de renouvellement tourne à chaque
 * usage. Deux renouvellements simultanés présentaient donc le même jeton, et
 * le serveur fermait la session. Ici : un seul renouvellement à la fois, tous
 * les appels refusés en même temps attendent le même résultat, et le jeton
 * neuf est enregistré avant d'être utilisé.
 */

export interface SessionRenouvelable {
  accessToken: string;
  refreshToken: string;
}

export type Renouvellement = { token: string } | { expired: true } | { transient: true };

export interface DependancesRenouvellement<S extends SessionRenouvelable> {
  charger: () => Promise<S | null>;
  enregistrer: (session: S) => Promise<unknown>;
  /** POST /api/auth/refresh avec le jeton de renouvellement. */
  appeler: (refreshToken: string, requestId: string) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;
  creerRequestId?: () => string;
  surRenouvelee?: (session: S) => void;
  attendre?: (ms: number) => Promise<void>;
}

export function creerRenouvellement<S extends SessionRenouvelable>(deps: DependancesRenouvellement<S>) {
  const attendre = deps.attendre ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let enCours: Promise<Renouvellement> | null = null;
  const requestId = deps.creerRequestId ?? (() => `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);

  async function faire(staleToken?: string): Promise<Renouvellement> {
    const stored = await deps.charger();
    if (!stored?.refreshToken) return { expired: true };
    // Un autre appel (ou l'arrière-plan) a déjà renouvelé : son jeton est le bon.
    if (staleToken && stored.accessToken !== staleToken) return { token: stored.accessToken };

    const cle = requestId();
    for (let essai = 0; essai < 2; essai++) {
      let reponse;
      try {
        reponse = await deps.appeler(stored.refreshToken, cle);
      } catch {
        // Réseau coupé : ce n'est pas une session expirée, on ne déconnecte pas.
        return { transient: true };
      }
      const data = await reponse.json().catch(() => ({}));
      if (reponse.ok && data?.accessToken) {
        const renouvelee = {
          ...stored,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken || stored.refreshToken,
        } as S;
        await deps.enregistrer(renouvelee);
        deps.surRenouvelee?.(renouvelee);
        return { token: renouvelee.accessToken };
      }
      if (reponse.status === 409 && data?.code === 'REFRESH_CONCURRENT') {
        // Un autre processus renouvelle : on attend son résultat, enregistré en session.
        await attendre(1500);
        const relue = await deps.charger();
        if (relue && relue.accessToken !== stored.accessToken) return { token: relue.accessToken };
        return { transient: true };
      }
      if (reponse.status === 401 || reponse.status === 403) return { expired: true };
      return { transient: true };
    }
    return { transient: true };
  }

  return {
    /** `staleToken` : le jeton d'accès que l'appelant vient de se voir refuser. */
    renouveler(staleToken?: string): Promise<Renouvellement> {
      if (!enCours) {
        enCours = faire(staleToken).finally(() => {
          enCours = null;
        });
      }
      return enCours;
    },
  };
}
