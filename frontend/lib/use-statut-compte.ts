import { useCallback, useState } from 'react';
import { useTempsReel } from '@/lib/temps-reel';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export interface StatutCompte {
  id: string;
  name?: string;
  tier?: 'FREE' | 'PREMIUM' | 'PRO';
  status: string;
  suspensionReason?: string | null;
  suspensionDate?: string | null;
  closureReason?: string | null;
  closureDate?: string | null;
  closedUntil?: string | null;
  /** La validation du commerce par la plateforme : sans elle, pas d'ouverture. */
  validation?: {
    valide: boolean;
    piecesManquantes: { type: string; libelle: string }[];
    piecesAFournir: { type: string; libelle: string }[];
    piecesEnExamen: { type: string; libelle: string }[];
    dossierComplet: boolean;
  };
}

/**
 * L'état du compte commerçant, tenu à jour en direct.
 *
 * Une suspension prise en compte au prochain rechargement laisse le commerçant
 * travailler dans une interface qui ne répond plus : chaque enregistrement
 * échoue sans qu'il comprenne pourquoi. Le serveur pousse la bascule, l'écran
 * la suit tout de suite.
 *
 * L'état se lit sous /api/support, le seul chemin qui reste ouvert à un compte
 * restreint : le lire ailleurs le ferait disparaître au moment où il compte.
 */
export function useStatutCompte(orgId?: string | null) {
  const [statut, setStatut] = useState<StatutCompte | null>(null);
  const [chargement, setChargement] = useState(true);

  const charger = useCallback(async () => {
    if (!orgId) {
      setChargement(false);
      return;
    }

    const jeton = localStorage.getItem('accessToken');
    if (!jeton) {
      setChargement(false);
      return;
    }

    try {
      const reponse = await fetch(`${API_URL}/support/compte/${orgId}`, {
        headers: { Authorization: `Bearer ${jeton}` },
      });

      if (reponse.ok) setStatut(await reponse.json());
    } catch {
      // Hors ligne : on garde le dernier état connu plutôt que de tout vider.
    } finally {
      setChargement(false);
    }
  }, [orgId]);

  useEffectChargement(() => {
    charger();
  }, [charger]);

  useTempsReel<{ orgId: string; status: string; reason?: string | null }>(
    'compte-statut',
    (evenement) => {
      if (!orgId || evenement.orgId !== orgId) return;

      setStatut((precedent) => ({
        ...(precedent || { id: orgId }),
        status: evenement.status,
        suspensionReason: evenement.status === 'SUSPENDED' ? evenement.reason : null,
        closureReason: evenement.status === 'CLOSED' ? evenement.reason : null,
      }));

      // La date limite de suppression et le reste viennent du serveur : on
      // relit, sans attendre, pour compléter ce que l'événement ne porte pas.
      charger();
    },
    Boolean(orgId)
  );

  return {
    statut,
    chargement,
    /** Le compte n'a plus accès qu'au support. */
    restreint: Boolean(statut && statut.status !== 'ACTIVE'),
    recharger: charger,
  };
}
