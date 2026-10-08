/** Les messages du chat d'un trajet : logique pure, sans réseau (testée dans messages.test.ts). */

export interface MessageChat {
  id: string;
  /** PASSAGER (moi) ou CHAUFFEUR. */
  auteur: 'PASSAGER' | 'CHAUFFEUR';
  texte: string;
  createdAt: string;
}

export const TEXTE_MAX = 500;

/**
 * Ajoute les messages relus à ceux déjà affichés : le serveur rend aussi le
 * dernier message déjà connu (`depuis` est inclusif), on écarte donc les
 * doublons par identifiant, et on garde l'ordre d'arrivée.
 */
export function fusionnerMessages(anciens: MessageChat[], nouveaux: MessageChat[]): MessageChat[] {
  const vus = new Set(anciens.map((m) => m.id));
  const ajoutes = nouveaux.filter((m) => !vus.has(m.id));
  if (ajoutes.length === 0) return anciens;
  return [...anciens, ...ajoutes].sort((a, b) => (a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt < b.createdAt ? -1 : 1));
}

/** Le point de reprise de la relecture : la date du dernier message connu. */
export function depuisDe(messages: MessageChat[]): string | undefined {
  return messages.length ? messages[messages.length - 1].createdAt : undefined;
}

/** Un texte qu'on peut envoyer : non vide une fois nettoyé, et pas plus long que le serveur ne l'accepte. */
export function texteEnvoyable(texte: string): boolean {
  const propre = texte.trim();
  return propre.length > 0 && propre.length <= TEXTE_MAX;
}
