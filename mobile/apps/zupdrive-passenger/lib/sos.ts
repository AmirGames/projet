import { apiFetch } from './api';

/** L'alerte SOS et la personne de confiance du passager (API `/api/zupdrive/sos`). */

export interface AlerteSos {
  id: string;
  /** Ce que le serveur a réellement envoyé : nul tant que rien n'est parti. */
  equipePrevenueLe: string | null;
  contactPrevenuLe: string | null;
}

export interface ContactConfiance {
  nom: string;
  email: string;
  consentementLe: string;
}

interface Enveloppe<T> {
  data: T;
}

export async function declencherSos(
  token: string,
  courseId: string,
  position?: { latitude: number; longitude: number }
): Promise<AlerteSos> {
  const res = await apiFetch<Enveloppe<AlerteSos>>('/api/zupdrive/sos', token, {
    method: 'POST',
    body: position ? { courseId, ...position } : { courseId },
  });
  return res.data;
}

export async function lireContactConfiance(token: string): Promise<ContactConfiance | null> {
  const res = await apiFetch<Enveloppe<ContactConfiance | null>>('/api/zupdrive/sos/contact', token);
  return res.data;
}

/** `consentement` : le passager confirme avoir informé cette personne (exigé par le serveur). */
export async function enregistrerContactConfiance(token: string, nom: string, email: string): Promise<ContactConfiance> {
  const res = await apiFetch<Enveloppe<ContactConfiance>>('/api/zupdrive/sos/contact', token, {
    method: 'PUT',
    body: { nom, email, consentement: true },
  });
  return res.data;
}

export async function supprimerContactConfiance(token: string): Promise<void> {
  await apiFetch('/api/zupdrive/sos/contact', token, { method: 'DELETE' });
}
