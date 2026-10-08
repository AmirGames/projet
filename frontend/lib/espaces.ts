'use client';


import { jetonAcces } from '@/lib/jeton-session';
import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export type Espace = 'client' | 'driver' | 'merchant' | 'superowner';

export interface EspaceAccessible {
  id: Espace;
  libelle: string;
  href: string;
}

// Ordre d'affichage dans le sélecteur : de l'usage courant à l'administration.
const ESPACES: Record<Espace, Omit<EspaceAccessible, 'id'>> = {
  // Libellé vide : l'écran affiche `selecteurEspace.espaces.<id>` des traductions.
  client: { libelle: '', href: '/client' },
  driver: { libelle: '', href: '/driver' },
  merchant: { libelle: '', href: '/merchant' },
  superowner: { libelle: '', href: '/superowner' },
};

interface RolesCompte {
  user?: {
    isSuperOwner?: boolean;
    isSystemAdmin?: boolean;
    platformRole?: string | null;
    platformRoleLabel?: string | null;
  };
  roles?: {
    customer?: { active?: boolean };
    driver?: { active?: boolean };
    merchant?: { active?: boolean; organizations?: { id: string }[] };
  };
}

/**
 * Un seul appel par jeton : chaque layout monte le sélecteur, et passer d'un
 * espace à l'autre ne doit pas redemander les rôles à chaque fois.
 */
const rolesParJeton = new Map<string, Promise<RolesCompte | null>>();

function chargerRoles(jeton: string): Promise<RolesCompte | null> {
  let promesse = rolesParJeton.get(jeton);
  if (!promesse) {
    promesse = fetch(`${API_URL}/api/auth/me/roles`, {
      headers: { Authorization: `Bearer ${jeton}` },
    })
      .then((reponse) => (reponse.ok ? reponse.json() : null))
      .catch(() => null);
    rolesParJeton.set(jeton, promesse);
    // Un échec ne doit pas rester en cache : on réessaiera au prochain montage.
    promesse.then((roles) => {
      if (!roles) rolesParJeton.delete(jeton);
    });
  }
  return promesse;
}

function lireJeton(): string | null {
  try {
    return jetonAcces();
  } catch {
    return null;
  }
}

function espacesDuCompte(donnees: RolesCompte): EspaceAccessible[] {
  // Un membre de l'équipe (SuperAdmin, Administrateur, Support) travaille dans
  // l'espace de la plateforme, sous le nom de son groupe.
  const membreEquipe = !donnees.user?.isSuperOwner && !!donnees.user?.platformRole;
  const ouverts: Record<Espace, boolean> = {
    // Tout compte peut commander : la fiche client est créée à la première
    // visite de l'espace client (voir clientConnecte côté serveur).
    client: true,
    driver: !!donnees.roles?.driver?.active,
    merchant: !!donnees.roles?.merchant?.active,
    // L'équipe de la plateforme (SuperAdmin, Administrateur, Support) y entre
    // aussi ; ce qu'elle y voit dépend des permissions de son groupe.
    superowner: !!donnees.user?.isSuperOwner || !!donnees.user?.isSystemAdmin,
  };
  return (Object.keys(ESPACES) as Espace[])
    .filter((id) => ouverts[id])
    .map((id) => ({
      id,
      ...ESPACES[id],
      ...(id === 'superowner' && membreEquipe && donnees.user?.platformRoleLabel
        ? { libelle: donnees.user.platformRoleLabel }
        : {}),
    }));
}

/**
 * Les espaces que le compte connecté peut ouvrir, d'après `/auth/me/roles`.
 * Liste vide tant que les rôles ne sont pas connus (ou sans session).
 */
export function useEspacesAccessibles() {
  const [espaces, setEspaces] = useState<EspaceAccessible[]>([]);
  const [premiereOrg, setPremiereOrg] = useState<string | null>(null);

  useEffect(() => {
    const jeton = lireJeton();
    if (!jeton) return;
    let actif = true;
    chargerRoles(jeton).then((donnees) => {
      if (!actif || !donnees) return;
      setEspaces(espacesDuCompte(donnees));
      setPremiereOrg(donnees.roles?.merchant?.organizations?.[0]?.id ?? null);
    });
    return () => {
      actif = false;
    };
  }, []);

  return { espaces, premiereOrg };
}

/**
 * Prépare le stockage attendu par l'espace d'arrivée (le commerce courant).
 */
export function preparerEspace(espace: Espace, premiereOrg: string | null) {
  try {
    // Un seul jeton pour tous les espaces : rien à recopier d'une clé à l'autre.
    if (!jetonAcces()) return;
    if (espace === 'merchant' && premiereOrg && !localStorage.getItem('currentOrgId')) {
      localStorage.setItem('currentOrgId', premiereOrg);
    }
  } catch {
    // Stockage refusé : l'espace d'arrivée renverra vers sa connexion.
  }
}
