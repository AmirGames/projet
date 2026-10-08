/** @jest-environment jsdom */

// Le module garde le jeton en mémoire et démarre à l'import : chaque test le recharge à neuf.
type Session = typeof import('../jeton-session');

const jetonAvecEcheance = (secondes: number) => {
  const charge = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + secondes })).toString('base64url');
  return `entete.${charge}.signature`;
};
const reponse = (statut: number, corps: unknown = {}) =>
  Promise.resolve({ ok: statut >= 200 && statut < 300, status: statut, json: async () => corps } as Response);

let fetchMock: jest.Mock;

function charger(avant?: () => void): Session {
  let session!: Session;
  jest.isolateModules(() => {
    avant?.();
    session = require('../jeton-session');
  });
  return session;
}

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('jeton d\'accès en mémoire', () => {
  it('ne vit jamais dans le stockage : seul un indice sans secret y est écrit', () => {
    const { poserJeton, jetonAcces } = charger();
    poserJeton('secret.jeton.valeur');
    expect(jetonAcces()).toBe('secret.jeton.valeur');
    expect(JSON.stringify({ ...localStorage })).not.toContain('secret.jeton.valeur');
    expect(localStorage.getItem('sessionOuverte')).toBe('1');
  });

  it('ignore un jeton vide ou absent', () => {
    const { poserJeton, jetonAcces } = charger();
    poserJeton(null);
    poserJeton('');
    poserJeton(undefined);
    expect(jetonAcces()).toBeNull();
    expect(localStorage.getItem('sessionOuverte')).toBeNull();
  });

  it('oublierJeton efface le jeton et l\'indice de session', () => {
    const { poserJeton, oublierJeton, jetonAcces } = charger();
    poserJeton('a.b.c');
    oublierJeton();
    expect(jetonAcces()).toBeNull();
    expect(localStorage.getItem('sessionOuverte')).toBeNull();
  });

  it('prévient les abonnés à chaque changement, jusqu\'au désabonnement', () => {
    const { poserJeton, oublierJeton, abonnerJeton } = charger();
    const rappel = jest.fn();
    const stop = abonnerJeton(rappel);
    poserJeton('a.b.c');
    oublierJeton();
    expect(rappel).toHaveBeenCalledTimes(2);
    stop();
    poserJeton('a.b.c');
    expect(rappel).toHaveBeenCalledTimes(2);
  });

  it('purge les anciennes clés où des versions précédentes écrivaient les jetons', () => {
    charger(() => {
      for (const cle of ['accessToken', 'driverToken', 'refreshToken', 'token']) localStorage.setItem(cle, 'ancien-secret');
      localStorage.setItem('autre', 'garde');
    });
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('driverToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('autre')).toBe('garde');
  });
});

describe('renouveler : le jeton d\'accès expire, la session se renouvelle', () => {
  it('demande un jeton neuf au cookie (même origine, transport cookie) et l\'adopte', async () => {
    const { renouveler, jetonAcces } = charger();
    fetchMock.mockReturnValue(reponse(200, { accessToken: 'neuf.jeton.ok', user: { id: 'u1' } }));
    const resultat = await renouveler();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/refresh', expect.objectContaining({
      method: 'POST', credentials: 'same-origin', body: '{}',
      headers: expect.objectContaining({ 'X-Refresh-Transport': 'cookie' }),
    }));
    expect(resultat).toMatchObject({ ok: true, statut: 200 });
    expect(resultat.donnees.user.id).toBe('u1');
    expect(jetonAcces()).toBe('neuf.jeton.ok');
  });

  it('transmet l\'ancien jeton de renouvellement d\'une inscription pour le convertir en cookie', async () => {
    const { renouveler } = charger();
    fetchMock.mockReturnValue(reponse(200, { accessToken: 'a.b.c' }));
    await renouveler('refresh-d-inscription');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ refreshToken: 'refresh-d-inscription' });
  });

  it.each([401, 403])('un refus %s met fin à la session : jeton et indice oubliés', async statut => {
    const { renouveler, poserJeton, jetonAcces } = charger();
    poserJeton('vieux.jeton.expire');
    fetchMock.mockReturnValue(reponse(statut, { error: 'refusé' }));
    const resultat = await renouveler();
    expect(resultat).toMatchObject({ ok: false, statut });
    expect(jetonAcces()).toBeNull();
    expect(localStorage.getItem('sessionOuverte')).toBeNull();
  });

  it.each([500, 502, 503])('une panne serveur %s ne déconnecte pas : le jeton est gardé', async statut => {
    const { renouveler, poserJeton, jetonAcces } = charger();
    poserJeton('jeton.encore.bon');
    fetchMock.mockReturnValue(reponse(statut));
    const resultat = await renouveler();
    expect(resultat.ok).toBe(false);
    expect(jetonAcces()).toBe('jeton.encore.bon');
    expect(localStorage.getItem('sessionOuverte')).toBe('1');
  });

  it('un réseau coupé rend le statut 0 et garde la session', async () => {
    const { renouveler, poserJeton, jetonAcces } = charger();
    poserJeton('jeton.encore.bon');
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(renouveler()).resolves.toEqual({ ok: false, statut: 0 });
    expect(jetonAcces()).toBe('jeton.encore.bon');
  });

  it('une réponse 200 sans jeton d\'accès n\'ouvre pas de session', async () => {
    const { renouveler, jetonAcces } = charger();
    fetchMock.mockReturnValue(reponse(200, { message: 'ok' }));
    expect((await renouveler()).ok).toBe(false);
    expect(jetonAcces()).toBeNull();
  });

  it('un corps non JSON est toléré', async () => {
    const { renouveler } = charger();
    fetchMock.mockReturnValue(Promise.resolve({ ok: false, status: 502, json: async () => { throw new SyntaxError('html'); } } as unknown as Response));
    await expect(renouveler()).resolves.toMatchObject({ ok: false, statut: 502 });
  });

  it('409 (un autre onglet renouvelle) : attend puis réessaie une seule fois', async () => {
    const { renouveler, jetonAcces } = charger();
    fetchMock.mockReturnValueOnce(reponse(409)).mockReturnValueOnce(reponse(200, { accessToken: 'apres.attente.ok' }));
    const attente = renouveler();
    await jest.advanceTimersByTimeAsync(1000);
    await expect(attente).resolves.toMatchObject({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(jetonAcces()).toBe('apres.attente.ok');
  });

  it('deux 409 de suite : abandon sans boucle infinie ni déconnexion', async () => {
    const { renouveler, poserJeton, jetonAcces } = charger();
    poserJeton('jeton.encore.bon');
    fetchMock.mockReturnValue(reponse(409));
    const attente = renouveler();
    await jest.advanceTimersByTimeAsync(1000);
    const resultat = await attente;
    expect(resultat.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(jetonAcces()).toBe('jeton.encore.bon');
  });

  it('se renouvelle seul une minute avant l\'échéance du jeton', async () => {
    const { poserJeton } = charger();
    fetchMock.mockReturnValue(reponse(200, { accessToken: jetonAvecEcheance(900) }));
    poserJeton(jetonAvecEcheance(120));
    await jest.advanceTimersByTimeAsync(50 * 1000);
    expect(fetchMock).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(15 * 1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/refresh');
  });

  it('ne renouvelle plus une fois le jeton oublié (minuteur annulé)', async () => {
    const { poserJeton, oublierJeton } = charger();
    poserJeton(jetonAvecEcheance(120));
    oublierJeton();
    await jest.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('démarrage : retrouver la session après un rechargement', () => {
  it('sans indice de session, aucune requête (visiteur, robot)', async () => {
    const { sessionARetrouver, sessionPrete, sessionPerdueAuDemarrage } = charger();
    expect(sessionARetrouver()).toBe(false);
    await sessionPrete();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sessionPerdueAuDemarrage()).toBe(false);
  });

  it('avec un indice, redemande un jeton au cookie avant d\'afficher les pages', async () => {
    fetchMock.mockReturnValue(reponse(200, { accessToken: 'retrouve.jeton.ok' }));
    const { sessionARetrouver, sessionPrete, jetonAcces } = charger(() => localStorage.setItem('sessionOuverte', '1'));
    expect(sessionARetrouver()).toBe(true);
    await sessionPrete();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/refresh', expect.anything());
    expect(jetonAcces()).toBe('retrouve.jeton.ok');
    expect(sessionARetrouver()).toBe(false);
  });

  it.each([401, 403])('cookie refusé (%s) : la session est déclarée perdue et l\'indice effacé', async statut => {
    fetchMock.mockReturnValue(reponse(statut));
    const { sessionPrete, sessionPerdueAuDemarrage } = charger(() => localStorage.setItem('sessionOuverte', '1'));
    await sessionPrete();
    expect(sessionPerdueAuDemarrage()).toBe(true);
    expect(localStorage.getItem('sessionOuverte')).toBeNull();
  });

  it('API injoignable : l\'indice est gardé pour réessayer au prochain chargement', async () => {
    fetchMock.mockRejectedValue(new TypeError('réseau'));
    const { sessionPrete, sessionPerdueAuDemarrage } = charger(() => localStorage.setItem('sessionOuverte', '1'));
    await sessionPrete();
    expect(sessionPerdueAuDemarrage()).toBe(false);
    expect(localStorage.getItem('sessionOuverte')).toBe('1');
  });
});

describe('fermeture et adoption', () => {
  it('effacerCookieSession appelle la déconnexion du site et survit à une panne réseau', async () => {
    const { effacerCookieSession } = charger();
    fetchMock.mockResolvedValue({ ok: true });
    await effacerCookieSession();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({ method: 'POST', credentials: 'same-origin' }));
    fetchMock.mockRejectedValue(new TypeError('hors ligne'));
    await expect(effacerCookieSession()).resolves.toBeUndefined();
  });

  it('adopterRefresh ne fait rien sans jeton, convertit en cookie sinon', async () => {
    const { adopterRefresh } = charger();
    fetchMock.mockReturnValue(reponse(200, { accessToken: 'a.b.c' }));
    await adopterRefresh(undefined);
    expect(fetchMock).not.toHaveBeenCalled();
    await adopterRefresh('refresh-inscription');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ refreshToken: 'refresh-inscription' });
  });
});
