/**
 * Accepter ou refuser une commande : les libellés et les appels.
 *
 * Partagé par la liste des commandes, le détail d'une commande et les écrans
 * du client, pour que tous disent la même chose.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

/** Les motifs que le commerçant peut choisir, tels qu'il les lit. */
export const MOTIFS_DU_COMMERCANT = [
  { valeur: 'TOO_BUSY', libelle: 'Trop occupé' },
  { valeur: 'PRODUCT_UNAVAILABLE', libelle: 'Produit indisponible' },
  { valeur: 'EXCEPTIONAL_CLOSURE', libelle: 'Fermeture exceptionnelle' },
  { valeur: 'OTHER', libelle: 'Autre raison' },
] as const;

export type MotifDeRefus = (typeof MOTIFS_DU_COMMERCANT)[number]['valeur'];

/** Le motif, tel que le client le lit. */
export const MOTIFS_POUR_LE_CLIENT: Record<string, string> = {
  TOO_BUSY: 'Le restaurant est trop occupé pour le moment.',
  PRODUCT_UNAVAILABLE: "Un produit de votre commande n'est plus disponible.",
  EXCEPTIONAL_CLOSURE: 'Le restaurant a dû fermer exceptionnellement.',
  OTHER: 'Le restaurant ne peut pas honorer votre commande.',
  NO_RESPONSE: "Le restaurant n'a pas confirmé votre commande à temps.",
};

/** Le motif, tel que le commerçant le relit. */
export const MOTIFS_POUR_LE_COMMERCANT: Record<string, string> = {
  TOO_BUSY: 'Trop occupé',
  PRODUCT_UNAVAILABLE: 'Produit indisponible',
  EXCEPTIONAL_CLOSURE: 'Fermeture exceptionnelle',
  OTHER: 'Autre raison',
  NO_RESPONSE: 'Refusée automatiquement : pas de réponse à temps',
};

/** Les temps de préparation proposés, en minutes. */
export const TEMPS_DE_PREPARATION = [10, 15, 20, 30, 45, 60];

/** « 12:20 ». */
export function heure(date: string | Date) {
  return new Date(date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/** « dans 7 min », « dans 1 h 05 », ou « maintenant ». */
export function delaiRestant(echeance: string | Date, maintenant = Date.now()) {
  const minutes = Math.floor((new Date(echeance).getTime() - maintenant) / 60000);
  if (minutes <= 0) return 'maintenant';
  if (minutes < 60) return `dans ${minutes} min`;
  const reste = minutes % 60;
  return `dans ${Math.floor(minutes / 60)} h ${String(reste).padStart(2, '0')}`;
}

async function envoyer(chemin: string, corps: unknown) {
  const jeton = localStorage.getItem('accessToken') || localStorage.getItem('token');
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
  const jeton = localStorage.getItem('accessToken') || localStorage.getItem('token');
  const reponse = await fetch(`${API_URL}/order-management/${storeId}/${orderId}/status`, {
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
