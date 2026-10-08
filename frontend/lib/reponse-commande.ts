import { jetonAcces } from '@/lib/jeton-session';
/**
 * Accepter ou refuser une commande : les libellés et les appels.
 *
 * Partagé par la liste des commandes, le détail d'une commande et les écrans
 * du client, pour que tous disent la même chose.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Les motifs que le commerçant peut choisir. Leur libellé : `motifsRefus.commercant.<motif>`
 * des traductions ; le motif tel que le client le lit : `motifsRefus.client.<motif>`.
 */
export const MOTIFS_DU_COMMERCANT = [
  { valeur: 'TOO_BUSY' },
  { valeur: 'PRODUCT_UNAVAILABLE' },
  { valeur: 'EXCEPTIONAL_CLOSURE' },
  { valeur: 'OTHER' },
] as const;

export type MotifDeRefus = (typeof MOTIFS_DU_COMMERCANT)[number]['valeur'];

/** Les temps de préparation proposés, en minutes. */
export const TEMPS_DE_PREPARATION = [10, 15, 20, 30, 45, 60];

/** « 12:20 ». */
export function heure(date: string | Date) {
  return new Date(date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

type Traduire = (cle: string, valeurs?: Record<string, string | number>) => string;

/**
 * « dans 7 min », « dans 1 h 05 », ou « maintenant ». Avec `t` (l'espace
 * `delai` des traductions), dans la langue du visiteur ; sans, en français.
 */
export function delaiRestant(echeance: string | Date, maintenant = Date.now(), t?: Traduire) {
  const minutes = Math.floor((new Date(echeance).getTime() - maintenant) / 60000);
  if (minutes <= 0) return t ? t('maintenant') : 'maintenant';
  if (minutes < 60) return t ? t('minutes', { n: minutes }) : `dans ${minutes} min`;
  const reste = String(minutes % 60).padStart(2, '0');
  const heures = Math.floor(minutes / 60);
  return t ? t('heures', { h: heures, m: reste }) : `dans ${heures} h ${reste}`;
}

async function envoyer(chemin: string, corps: unknown) {
  const jeton = jetonAcces();
  const reponse = await fetch(`${API_URL}${chemin}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
    body: JSON.stringify(corps),
  });

  const donnees = await reponse.json().catch(() => null);

  if (!reponse.ok) {
    throw new Error(donnees?.error || donnees?.message || 'Action impossible');
  }

  return donnees?.order;
}

export function accepterCommande(storeId: string, orderId: string, preparationMinutes: number) {
  return envoyer(`/api/order-management/${storeId}/${orderId}/accept`, { preparationMinutes });
}

export function refuserCommande(storeId: string, orderId: string, motif: MotifDeRefus, note?: string) {
  return envoyer(`/api/order-management/${storeId}/${orderId}/reject`, {
    motif,
    ...(note?.trim() ? { note: note.trim() } : {}),
  });
}

/** Faire avancer une commande acceptée : en préparation, prête, remise. */
export async function avancerCommande(storeId: string, orderId: string, status: string) {
  const jeton = jetonAcces();
  const reponse = await fetch(`${API_URL}/api/order-management/${storeId}/${orderId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
    body: JSON.stringify({ status }),
  });

  const donnees = await reponse.json().catch(() => null);

  if (!reponse.ok) {
    throw new Error(donnees?.error || donnees?.message || 'Changement de statut impossible');
  }

  return donnees?.order;
}

/** Nom de l'événement qui dit aux écrans ouverts de relire leurs commandes. */
export const EVENEMENT_COMMANDES_CHANGEES = 'commandes-changees';
