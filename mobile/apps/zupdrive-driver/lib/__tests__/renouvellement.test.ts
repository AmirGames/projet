import { creerRenouvellement } from '../renouvellement';

declare const describe: (nom: string, suite: () => void) => void;
declare const it: (nom: string, test: () => Promise<void>) => void;
declare const expect: (valeur: unknown) => any;

describe('reprise du renouvellement de session', () => {
  it('réessaie avec la même preuve après perte de réponse post-commit', async () => {
    let sessionLocale = { accessToken: 'A0', refreshToken: 'R0' };
    let successeur: { accessToken: string; refreshToken: string } | null = null;
    const preuves: string[] = [];
    let appels = 0;
    const appeler = async (refreshToken: string, requestId: string) => {
      appels += 1;
      preuves.push(requestId);
      expect(refreshToken).toBe('R0');
      if (!successeur) {
        successeur = { accessToken: 'A1', refreshToken: 'R1' }; // le serveur a committé
        throw new Error('réponse réseau perdue');
      }
      return { ok: true, status: 200, json: async () => successeur };
    };
    const renouvellement = creerRenouvellement({
      charger: async () => ({ ...sessionLocale }),
      enregistrer: async (session) => { sessionLocale = { ...session }; },
      appeler,
      creerRequestId: () => 'a'.repeat(48),
      attendre: async () => undefined,
    });

    await expect(renouvellement.renouveler('A0')).resolves.toEqual({ token: 'A1' });
    expect(appels).toBe(2);
    expect(preuves).toEqual(['a'.repeat(48), 'a'.repeat(48)]);
    expect(sessionLocale).toEqual({ accessToken: 'A1', refreshToken: 'R1' });
  });

  it('relit le SecureStore après un conflit concurrent, sans déconnecter', async () => {
    let sessionLocale = { accessToken: 'A0', refreshToken: 'R0' };
    let appels = 0;
    const appeler = async () => {
      appels += 1;
      sessionLocale = { accessToken: 'A-externe', refreshToken: 'R-externe' };
      return { ok: false, status: 409, json: async () => ({ code: 'REFRESH_CONCURRENT' }) };
    };
    const renouvellement = creerRenouvellement({
      charger: async () => ({ ...sessionLocale }),
      enregistrer: async () => undefined,
      appeler,
      creerRequestId: () => 'b'.repeat(48),
      attendre: async () => undefined,
    });

    await expect(renouvellement.renouveler('A0')).resolves.toEqual({ token: 'A-externe' });
    expect(appels).toBe(1);
  });
});
