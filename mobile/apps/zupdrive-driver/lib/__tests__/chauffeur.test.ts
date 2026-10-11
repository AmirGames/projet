import { chauffeurApi } from '../chauffeur';

describe('contrats de routes de l’app chauffeur ZupDrive', () => {
  it('utilise le dossier et le tableau propres au chauffeur', () => {
    expect(chauffeurApi.dossier).toBe('/api/zupdrive/chauffeur/me');
    expect(chauffeurApi.tableau).toBe('/api/zupdrive/chauffeur/me/courses');
    expect(chauffeurApi.disponibilite).toBe('/api/zupdrive/chauffeur/me/disponibilite');
    expect(chauffeurApi.position).toBe('/api/zupdrive/chauffeur/me/position');
    expect(chauffeurApi.tableau).not.toBe('/api/zupdrive/courses');
  });

  it('accepte par ID de proposition et avance une course par les étapes chauffeur', () => {
    expect(chauffeurApi.proposition('prop/123', 'accepter'))
      .toBe('/api/zupdrive/chauffeur/me/propositions/prop%2F123/accepter');
    expect(chauffeurApi.etape('course-1', 'terminer'))
      .toBe('/api/zupdrive/chauffeur/me/courses/course-1/terminer');
    expect(chauffeurApi.proposition('prop-1', 'refuser'))
      .toBe('/api/zupdrive/chauffeur/me/propositions/prop-1/refuser');
  });

  it('lit les revenus sur la route ZupDrive du chauffeur', () => {
    expect(chauffeurApi.revenus).toBe('/api/zupdrive/payment/earnings');
  });

  it('garde les fonctions d’acceptation et de fin dans le sous-espace chauffeur', () => {
    expect(chauffeurApi.proposition('p-1', 'accepter')).toMatch(/^\/api\/zupdrive\/chauffeur\/me\/propositions\//);
    expect(chauffeurApi.etape('c-1', 'terminer')).toMatch(/^\/api\/zupdrive\/chauffeur\/me\/courses\//);
  });
});
