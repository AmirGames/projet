import { describe, expect, it } from '@jest/globals';
import { depuisDe, fusionnerMessages, texteEnvoyable, type MessageChat } from './messages';

const m = (id: string, createdAt: string, auteur: MessageChat['auteur'] = 'PASSAGER'): MessageChat => ({ id, auteur, texte: id, createdAt });

describe('fusionnerMessages', () => {
  it('écarte les doublons (le serveur rend le dernier message déjà connu) et garde l\'ordre', () => {
    const anciens = [m('a', '2026-10-08T10:00:00.000Z'), m('b', '2026-10-08T10:00:05.000Z')];
    const relus = [m('b', '2026-10-08T10:00:05.000Z'), m('c', '2026-10-08T10:00:09.000Z', 'CHAUFFEUR')];
    expect(fusionnerMessages(anciens, relus).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('rend la même liste quand il n\'y a rien de nouveau (pas de rendu inutile)', () => {
    const anciens = [m('a', '2026-10-08T10:00:00.000Z')];
    expect(fusionnerMessages(anciens, [m('a', '2026-10-08T10:00:00.000Z')])).toBe(anciens);
    expect(fusionnerMessages(anciens, [])).toBe(anciens);
  });

  it('départage deux messages de la même milliseconde par identifiant', () => {
    const t = '2026-10-08T10:00:00.000Z';
    expect(fusionnerMessages([], [m('b', t), m('a', t)]).map((x) => x.id)).toEqual(['a', 'b']);
  });
});

describe('depuisDe', () => {
  it('reprend à la date du dernier message, ou au début sans message', () => {
    expect(depuisDe([m('a', '2026-10-08T10:00:00.000Z'), m('b', '2026-10-08T10:00:05.000Z')])).toBe('2026-10-08T10:00:05.000Z');
    expect(depuisDe([])).toBeUndefined();
  });
});

describe('texteEnvoyable', () => {
  it('refuse le vide et les espaces, accepte jusqu\'à 500 caractères, refuse au-delà', () => {
    expect(texteEnvoyable('')).toBe(false);
    expect(texteEnvoyable('   ')).toBe(false);
    expect(texteEnvoyable('Bonjour')).toBe(true);
    expect(texteEnvoyable('a'.repeat(500))).toBe(true);
    expect(texteEnvoyable('a'.repeat(501))).toBe(false);
  });
});
