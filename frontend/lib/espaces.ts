'use client';

import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export type Espace = 'client' | 'driver' | 'merchant' | 'admin' | 'super-admin' | 'superowner';

export interface EspaceAccessible {
  id: Espace;
  libelle: string;
  href: string;
}

// Ordre d'affichage dans le sélecteur : de l'usage courant à l'administration.
const ESPACES: Record<Espace, Omit<EspaceAccessible, 'id'>> = {
  client: { libelle: 'Espace client', href: '/client' },
  driver: { libelle: 'Espace livreur', href: '/driver' },
  merchant: { libelle: 'Espace commerçant', href: '/merchant' },
  admin: { libelle: 'Administration', href: '/admin/dashboard' },
  'super-admin': { libelle: 'Super Admin', href: '/super-admin' },
  superowner: { libelle: 'Super Owner', href: '/superowner' },
};

interface RolesCompte {
  user?: { isSuperOwner?: boolean; isSystemAdmin?: boolean };
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
    // L'espace livreur range le même jeton de compte sous sa propre clé.
    return localStorage.getItem('accessToken') || localStorage.getItem('driverToken');
  } catch {
    return null;
  }
}

function espacesDuCompte(donnees: RolesCompte): EspaceAccessible[] {
  const ouverts: Record<Espace, boolean> = {
    client: !!donnees.roles?.customer?.active,
    driver: !!donnees.roles?.driver?.active,
    merchant: !!donnees.roles?.merchant?.active,
    admin: !!donnees.user?.isSystemAdmin,
    'super-admin': !!donnees.user?.isSystemAdmin,
    superowner: !!donnees.user?.isSuperOwner,
  };
  return (Object.keys(ESPACES) as Espace[])
    .filter((id) => ouverts[id])
    .map((id) => ({ id, ...ESPACES[id] }));
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
 * Prépare le stockage attendu par l'espace d'arrivée : chaque espace a été
 * écrit avec sa propre clé de session, alors qu'il s'agit du même compte.
 */
export function preparerEspace(espace: Espace, premiereOrg: string | null) {
  try {
    const jeton = lireJeton();
    if (!jeton) return;
    if (!localStorage.getItem('accessToken')) localStorage.setItem('accessToken', jeton);
    if (espace === 'driver' && !localStorage.getItem('driverToken')) {
      localStorage.setItem('driverToken', jeton);
    }
    if (espace === 'merchant' && premiereOrg && !localStorage.getItem('currentOrgId')) {
      localStorage.setItem('currentOrgId', premiereOrg);
    }
  } catch {
    // Stockage refusé : l'espace d'arrivée renverra vers sa connexion.
  }
}
