import { describe, expect, it } from '@jest/globals';
import { STATUTS_SOS, statutCourt, statutDetail } from './statuts';

describe('STATUTS_SOS', () => {
  it("n'ouvre l'alerte que pour un trajet avec un chauffeur en route ou à bord", () => {
    expect(STATUTS_SOS).toEqual(['ACCEPTEE', 'ARRIVEE', 'EN_COURS']);
    for (const statut of ['RECHERCHE', 'TERMINEE', 'ANNULEE', 'SANS_CHAUFFEUR']) {
      expect(STATUTS_SOS).not.toContain(statut);
    }
  });
});

describe('libellés de statut', () => {
  it('traduit les statuts connus et laisse passer un statut inconnu', () => {
    expect(statutCourt('SANS_CHAUFFEUR')).toBe('Sans chauffeur');
    expect(statutDetail('ACCEPTEE')).toBe('Votre chauffeur arrive');
    expect(statutCourt('NOUVEAU_STATUT')).toBe('NOUVEAU_STATUT');
  });
});
