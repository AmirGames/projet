/** @jest-environment node */
import { NextRequest } from 'next/server';
import { proxy } from '../../proxy';

/**
 * La sonde du conteneur (HEALTHCHECK) appelle http://127.0.0.1:3000/api/health :
 * le proxy du site, qui aiguille selon l'hôte, ne doit ni la rediriger ni la réécrire.
 */
describe('sonde de vie du site', () => {
  it('traverse le proxy telle quelle, quel que soit l’hôte', () => {
    for (const hote of ['127.0.0.1:3000', 'localhost:3000', 'zupeat.com', 'manager.zupeat.com']) {
      const reponse = proxy(
        new NextRequest('http://127.0.0.1:3000/api/health', { headers: { host: hote } })
      );
      expect(reponse.status).toBe(200);
      expect(reponse.headers.get('location')).toBeNull();
      const reecrit = reponse.headers.get('x-middleware-rewrite');
      if (reecrit) expect(new URL(reecrit).pathname).toBe('/api/health');
    }
  });
});
