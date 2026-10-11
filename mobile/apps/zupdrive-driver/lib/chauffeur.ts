import { apiFetch } from './api';

/** Contrats utilisés par l'app chauffeur, alignés sur les routeurs ZupDrive. */
export type StatutDossier = 'BROUILLON' | 'SOUMIS' | 'VALIDE' | 'REFUSE' | 'SUSPENDU';

export interface DossierChauffeur {
  statut: StatutDossier;
  nomComplet: string;
  motifStatut?: string | null;
}

export interface CourseChauffeur {
  id: string;
  statut: 'RECHERCHE' | 'ACCEPTEE' | 'ARRIVEE' | 'EN_COURS' | 'TERMINEE' | 'ANNULEE';
  passager: string | null;
  departAdresse: string;
  arriveeAdresse: string;
  prixCentimes: number;
  devise: string;
}

export interface TableauChauffeur {
  statut: StatutDossier;
  enLigne: boolean;
  proposition: { id: string; expireA: string; course: CourseChauffeur } | null;
  course: CourseChauffeur | null;
  historique: Pick<CourseChauffeur, 'id' | 'statut' | 'departAdresse' | 'arriveeAdresse' | 'prixCentimes'>[];
}

export interface RevenusChauffeur {
  totalEarningsCentimes: number;
  pendingCentimes: number;
  payouts: { id: string; amount: number; status: string; period: { start: string; end: string } }[];
}

export const chauffeurApi = {
  dossier: '/api/zupdrive/chauffeur/me',
  tableau: '/api/zupdrive/chauffeur/me/courses',
  disponibilite: '/api/zupdrive/chauffeur/me/disponibilite',
  position: '/api/zupdrive/chauffeur/me/position',
  revenus: '/api/zupdrive/payment/earnings',
  proposition: (id: string, reponse: 'accepter' | 'refuser') =>
    `/api/zupdrive/chauffeur/me/propositions/${encodeURIComponent(id)}/${reponse}`,
  etape: (id: string, etape: 'arrive' | 'demarrer' | 'terminer') =>
    `/api/zupdrive/chauffeur/me/courses/${encodeURIComponent(id)}/${etape}`,
};

export async function lireDossier(token: string) {
  const res = await apiFetch<{ data: DossierChauffeur | null }>(chauffeurApi.dossier, token);
  return res.data;
}

export async function lireTableau(token: string) {
  const res = await apiFetch<{ data: TableauChauffeur }>(chauffeurApi.tableau, token);
  return res.data;
}

export async function changerDisponibilite(token: string, enLigne: boolean) {
  const res = await apiFetch<{ data: TableauChauffeur }>(chauffeurApi.disponibilite, token, {
    method: 'POST', body: { enLigne },
  });
  return res.data;
}

export async function enregistrerPosition(token: string, latitude: number, longitude: number) {
  return apiFetch<{ data: { ok: true } }>(chauffeurApi.position, token, {
    method: 'POST', body: { latitude, longitude },
  });
}

export async function repondreProposition(token: string, id: string, reponse: 'accepter' | 'refuser' = 'accepter') {
  const res = await apiFetch<{ data: TableauChauffeur }>(chauffeurApi.proposition(id, reponse), token, { method: 'POST' });
  return res.data;
}

export async function avancerCourse(token: string, courseId: string, etape: 'arrive' | 'demarrer' | 'terminer') {
  const res = await apiFetch<{ data: TableauChauffeur }>(chauffeurApi.etape(courseId, etape), token, { method: 'POST' });
  return res.data;
}

export async function lireRevenus(token: string) {
  const res = await apiFetch<{ data: RevenusChauffeur }>(chauffeurApi.revenus, token);
  return res.data;
}
