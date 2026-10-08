import { apiFetch } from './api';
import type { MessageChat } from './messages';

/** Le chat du trajet avec le chauffeur (API `/api/zupdrive/courses/:id/messages`). */

interface Enveloppe<T> {
  data: T;
}

/** `depuis` : ne rend que les messages arrivés depuis cette date (inclusive, le client écarte les doublons). */
export async function lireMessages(token: string, courseId: string, depuis?: string): Promise<MessageChat[]> {
  const requete = depuis ? `?depuis=${encodeURIComponent(depuis)}` : '';
  const res = await apiFetch<Enveloppe<MessageChat[]>>(`/api/zupdrive/courses/${encodeURIComponent(courseId)}/messages${requete}`, token);
  return res.data;
}

/** La clé d'idempotence est propre à un message : rejouer l'envoi (réseau coupé) rend le même message. */
export async function envoyerMessage(token: string, courseId: string, texte: string, cleIdempotence: string): Promise<MessageChat> {
  const res = await apiFetch<Enveloppe<MessageChat>>(`/api/zupdrive/courses/${encodeURIComponent(courseId)}/messages`, token, {
    method: 'POST',
    body: { texte: texte.trim(), cleIdempotence },
  });
  return res.data;
}
