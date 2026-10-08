import { apiFetch } from './api';

/**
 * Les trajets du passager (API `/api/zupdrive/courses`).
 *
 * Les montants arrivent en centimes (entiers) et ne sont convertis qu'à
 * l'affichage : aucun prix ne se calcule dans l'application. Le prix affiché
 * est celui du devis signé par le serveur, renvoyé tel quel à la commande.
 */

export interface AdresseTrajet {
  adresse: string;
  latitude: number;
  longitude: number;
  codePostal: string;
}

export interface Devis {
  region: string;
  distanceMetres: number;
  dureeSecondes: number;
  prixCentimes: number;
  devise: string;
  /** Le tracé de la route quand le serveur l'a calculé, sinon null. */
  trace: [number, number][] | null;
  /** Le devis signé, à renvoyer pour commander. */
  devis: string;
}

/** Ce que l'API dit du paiement : celui que le webhook Stripe a enregistré, jamais celui du téléphone. */
export interface PaiementTrajet {
  obligatoire: boolean;
  /** Statut de PaymentIntentDrive (SUCCEEDED, REFUND_REQUESTED, REFUNDED…), nul tant qu'aucun paiement n'existe. */
  statut: string | null;
}

export interface ResumeTrajet {
  id: string;
  statut: string;
  departAdresse: string;
  arriveeAdresse: string;
  prixCentimes: number;
  createdAt: string;
}

export interface Trajet extends ResumeTrajet {
  distanceMetres: number;
  dureeSecondes: number;
  annuleePar: string | null;
  departLatitude: number;
  departLongitude: number;
  arriveeLatitude: number;
  arriveeLongitude: number;
  chauffeur: {
    prenom: string | null;
    vehicule: string | null;
    plaque: string | null;
    /** Seulement pendant son approche. */
    position: { latitude: number; longitude: number } | null;
    /** Sa moyenne donnée par les passagers ; nulle tant que personne ne l'a noté. */
    note: { moyenne: number | null; avis: number } | null;
  } | null;
  maNote: number | null;
  peutNoter: boolean;
  paiement: PaiementTrajet;
}

/** Statuts d'une course encore en cours (le suivi se relit tant qu'elle est dans l'un d'eux). */
export const STATUTS_ACTIFS = ['RECHERCHE', 'ACCEPTEE', 'ARRIVEE', 'EN_COURS'];

/** Un trajet qu'on peut encore annuler : tant que le passager n'est pas à bord. */
export const STATUTS_ANNULABLES = ['RECHERCHE', 'ACCEPTEE', 'ARRIVEE'];

/** Relecture du suivi d'un trajet, en millisecondes (comme sur le site). */
export const RELECTURE_MS = 4000;

/** Les réponses de l'API enveloppent le résultat dans `data`. */
interface Enveloppe<T> {
  data: T;
}

export async function demanderDevis(token: string, depart: AdresseTrajet, arrivee: AdresseTrajet): Promise<Devis> {
  const res = await apiFetch<Enveloppe<Devis>>('/api/zupdrive/courses/devis', token, {
    method: 'POST',
    body: { depart, arrivee },
  });
  return res.data;
}

/**
 * Commande le devis signé. La clé d'idempotence est propre au devis : rejouer
 * la même commande (réseau coupé, double appui) rend la même course.
 */
export async function commanderTrajet(token: string, devis: Devis, cleIdempotence: string): Promise<{ id: string }> {
  const res = await apiFetch<Enveloppe<{ id: string }>>('/api/zupdrive/courses', token, {
    method: 'POST',
    body: { devis: devis.devis, cleIdempotence },
  });
  return res.data;
}

export async function mesTrajets(token: string): Promise<ResumeTrajet[]> {
  const res = await apiFetch<Enveloppe<ResumeTrajet[]>>('/api/zupdrive/courses', token);
  return res.data;
}

export async function lireTrajet(token: string, id: string): Promise<Trajet> {
  const res = await apiFetch<Enveloppe<Trajet>>(`/api/zupdrive/courses/${encodeURIComponent(id)}`, token);
  return res.data;
}

export async function annulerTrajet(token: string, id: string, motif?: string): Promise<Trajet> {
  const res = await apiFetch<Enveloppe<Trajet>>(`/api/zupdrive/courses/${encodeURIComponent(id)}/annuler`, token, {
    method: 'POST',
    body: motif ? { motif } : {},
  });
  return res.data;
}

export async function noterChauffeur(token: string, id: string, note: number, commentaire?: string): Promise<void> {
  await apiFetch(`/api/zupdrive/courses/${encodeURIComponent(id)}/note`, token, {
    method: 'POST',
    body: commentaire ? { note, commentaire } : { note },
  });
}

/**
 * Crée (ou retrouve) l'intention de paiement du trajet. Seul l'identifiant part :
 * le serveur lit le prix sur la course, jamais sur le téléphone.
 */
export async function creerIntentionPaiement(token: string, courseId: string): Promise<string> {
  const res = await apiFetch<Enveloppe<{ clientSecret: string }>>('/api/zupdrive/payment/intent', token, {
    method: 'POST',
    body: { courseId },
  });
  return res.data.clientSecret;
}

/** La clé publique Stripe (sans secret, la même que reçoit le navigateur) ; null si le paiement en ligne n'est pas branché. */
export async function lireClePubliqueStripe(): Promise<string | null> {
  const res = await apiFetch<Enveloppe<{ enLigne: boolean; publishableKey: string | null }>>('/api/payments/config', null);
  return res.data.enLigne ? res.data.publishableKey : null;
}

/** Une clé d'idempotence (8 à 64 caractères alphanumériques) pour un devis. */
export function cleAleatoire(): string {
  const caracteres = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let cle = '';
  for (let i = 0; i < 32; i++) cle += caracteres[Math.floor(Math.random() * caracteres.length)];
  return cle;
}

/** 1075 → « 10,75 € ». */
export const prix = (centimes: number) =>
  `${(centimes / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export const kilometres = (metres: number) =>
  `${(metres / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`;

export const minutes = (secondes: number) => `${Math.max(1, Math.round(secondes / 60))} min`;
