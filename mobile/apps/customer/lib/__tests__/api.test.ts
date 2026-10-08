import { ApiError, apiFetch, formatEuros, mediaUrl, renewSession, setSessionRenewedHandler, setUnauthorizedHandler } from '../api';

// Le stockage sécurisé du téléphone, simulé par une table en mémoire.
const mockStockage = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (cle: string) => mockStockage.get(cle) ?? null,
  setItemAsync: async (cle: string, valeur: string) => { mockStockage.set(cle, valeur); },
  deleteItemAsync: async (cle: string) => { mockStockage.delete(cle); },
}));
jest.mock('expo-constants', () => ({ __esModule: true, default: {} }));


const CLE_SESSION = 'zupeat.customer.session';
const reponse = (statut: number, corps: unknown = {}) =>
  Promise.resolve({ ok: statut >= 200 && statut < 300, status: statut, json: async () => corps } as Response);
let fetchMock: jest.Mock;
const appels = (fragment: string) => fetchMock.mock.calls.filter(([url]) => String(url).includes(fragment));

beforeEach(() => {
  mockStockage.clear();
  mockStockage.set(CLE_SESSION, JSON.stringify({ accessToken: 'A0', refreshToken: 'R0', email: 'alice@exemple.test' }));
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  setUnauthorizedHandler(null);
  setSessionRenewedHandler(null);
});

describe('apiFetch : appel nominal', () => {
  it('envoie le jeton en Bearer, le corps en JSON et rend la réponse', async () => {
    fetchMock.mockReturnValue(reponse(200, { orders: [1] }));
    await expect(apiFetch('/api/orders', 'A0', { method: 'POST', body: { storeId: 's1' } })).resolves.toEqual({ orders: [1] });
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3001/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer A0' },
      body: JSON.stringify({ storeId: 's1' }),
    });
  });

  it('sans jeton, l\'appel part anonyme : aucun en-tête Authorization', async () => {
    fetchMock.mockReturnValue(reponse(200, []));
    await apiFetch('/api/client/stores', null);
    const { headers, method, body } = fetchMock.mock.calls[0][1];
    expect(headers).toEqual({ 'Content-Type': 'application/json' });
    expect(method).toBe('GET');
    expect(body).toBeUndefined();
  });

  it('transmet les en-têtes complémentaires (clé d\'idempotence)', async () => {
    fetchMock.mockReturnValue(reponse(201, {}));
    await apiFetch('/api/orders', null, { method: 'POST', body: {}, headers: { 'Idempotency-Key': 'cle-1' } });
    expect(fetchMock.mock.calls[0][1].headers['Idempotency-Key']).toBe('cle-1');
  });

  it('une erreur du serveur devient une ApiError avec message, statut et code', async () => {
    fetchMock.mockReturnValue(reponse(400, { error: 'Panier vide', code: 'EMPTY_CART' }));
    const erreur = await apiFetch('/api/orders', null, { method: 'POST' }).catch((e) => e);
    expect(erreur).toBeInstanceOf(ApiError);
    expect(erreur).toMatchObject({ message: 'Panier vide', status: 400, code: 'EMPTY_CART' });
  });

  it('retombe sur « message », puis sur « Erreur <statut> » quand le corps est illisible', async () => {
    fetchMock.mockReturnValueOnce(reponse(422, { message: 'Invalide' }));
    await expect(apiFetch('/x', null)).rejects.toMatchObject({ message: 'Invalide', status: 422 });
    fetchMock.mockReturnValueOnce(Promise.resolve({ ok: false, status: 502, json: async () => { throw new SyntaxError('html'); } } as unknown as Response));
    await expect(apiFetch('/x', null)).rejects.toMatchObject({ message: 'Erreur 502', status: 502 });
  });

  it('un réseau coupé fait échouer l\'appel sans rien déconnecter', async () => {
    const dehors = jest.fn();
    setUnauthorizedHandler(dehors);
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await expect(apiFetch('/api/orders', 'A0')).rejects.toThrow('Network request failed');
    expect(dehors).not.toHaveBeenCalled();
  });
});

describe('apiFetch : 401 et renouvellement de la session', () => {
  const refreshReussi = (accessToken = 'A1', refreshToken = 'R1') => reponse(200, { accessToken, refreshToken });

  it('jeton périmé : renouvelle par le jeton de renouvellement puis rejoue l\'appel une seule fois', async () => {
    fetchMock
      .mockReturnValueOnce(reponse(401, { error: 'Jeton expiré' }))
      .mockReturnValueOnce(refreshReussi())
      .mockReturnValueOnce(reponse(200, { ok: true }));
    await expect(apiFetch('/api/orders', 'A0')).resolves.toEqual({ ok: true });
    expect(appels('/api/auth/refresh')).toHaveLength(1);
    expect(JSON.parse(appels('/api/auth/refresh')[0][1].body)).toEqual({ refreshToken: 'R0' });
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer A1');
  });

  it('enregistre la session renouvelée (les deux jetons tournent) avant de rejouer', async () => {
    fetchMock
      .mockReturnValueOnce(reponse(401))
      .mockReturnValueOnce(refreshReussi('A1', 'R1'))
      .mockImplementationOnce(async () => {
        // Au moment du rejeu, le nouveau jeton est déjà enregistré.
        expect(JSON.parse(mockStockage.get(CLE_SESSION) as string)).toEqual({ accessToken: 'A1', refreshToken: 'R1', email: 'alice@exemple.test' });
        return reponse(200, {});
      });
    await apiFetch('/api/orders', 'A0');
  });

  it('prévient l\'écran de la session renouvelée', async () => {
    const renouvelee = jest.fn();
    setSessionRenewedHandler(renouvelee);
    fetchMock.mockReturnValueOnce(reponse(401)).mockReturnValueOnce(refreshReussi()).mockReturnValueOnce(reponse(200, {}));
    await apiFetch('/api/orders', 'A0');
    expect(renouvelee).toHaveBeenCalledWith({ accessToken: 'A1', refreshToken: 'R1', email: 'alice@exemple.test' });
  });

  it('garde le jeton de renouvellement quand le serveur n\'en rend pas de nouveau', async () => {
    fetchMock.mockReturnValueOnce(reponse(401)).mockReturnValueOnce(reponse(200, { accessToken: 'A1' })).mockReturnValueOnce(reponse(200, {}));
    await apiFetch('/api/orders', 'A0');
    expect(JSON.parse(mockStockage.get(CLE_SESSION) as string).refreshToken).toBe('R0');
  });

  it('le rejeu refusé à son tour déconnecte et ne boucle pas', async () => {
    const dehors = jest.fn();
    setUnauthorizedHandler(dehors);
    fetchMock.mockReturnValueOnce(reponse(401)).mockReturnValueOnce(refreshReussi()).mockReturnValueOnce(reponse(401, { error: 'Toujours refusé' }));
    await expect(apiFetch('/api/orders', 'A0')).rejects.toMatchObject({ status: 401, message: 'Toujours refusé' });
    expect(dehors).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([401, 403])('renouvellement refusé (%s) : la session est expirée, l\'écran est prévenu', async (statut) => {
    const dehors = jest.fn();
    setUnauthorizedHandler(dehors);
    fetchMock.mockReturnValueOnce(reponse(401)).mockReturnValueOnce(reponse(statut, {}));
    await expect(apiFetch('/api/orders', 'A0')).rejects.toMatchObject({ status: 401 });
    expect(dehors).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('réseau coupé pendant le renouvellement : l\'appel échoue mais la session est conservée', async () => {
    const dehors = jest.fn();
    setUnauthorizedHandler(dehors);
    fetchMock.mockReturnValueOnce(reponse(401)).mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(apiFetch('/api/orders', 'A0')).rejects.toMatchObject({ status: 401 });
    expect(dehors).not.toHaveBeenCalled();
    expect(mockStockage.get(CLE_SESSION)).toContain('R0');
  });

  it('panne du serveur au renouvellement (500) : transitoire, pas de déconnexion', async () => {
    const dehors = jest.fn();
    setUnauthorizedHandler(dehors);
    fetchMock.mockReturnValueOnce(reponse(401)).mockReturnValueOnce(reponse(500, {}));
    await expect(apiFetch('/api/orders', 'A0')).rejects.toBeInstanceOf(ApiError);
    expect(dehors).not.toHaveBeenCalled();
  });

  it('un 401 sans jeton (appel anonyme) ne déclenche ni renouvellement ni déconnexion', async () => {
    const dehors = jest.fn();
    setUnauthorizedHandler(dehors);
    fetchMock.mockReturnValue(reponse(401, { error: 'Connexion requise' }));
    await expect(apiFetch('/api/client/me', null)).rejects.toMatchObject({ status: 401 });
    expect(appels('/api/auth/refresh')).toHaveLength(0);
    expect(dehors).not.toHaveBeenCalled();
  });

  it('MISSING_ORG est une requête incomplète, pas une session expirée', async () => {
    const dehors = jest.fn();
    setUnauthorizedHandler(dehors);
    fetchMock.mockReturnValue(reponse(401, { code: 'MISSING_ORG', error: 'Organisation manquante' }));
    await expect(apiFetch('/api/orders', 'A0')).rejects.toMatchObject({ status: 401, code: 'MISSING_ORG' });
    expect(appels('/api/auth/refresh')).toHaveLength(0);
    expect(dehors).not.toHaveBeenCalled();
  });

  it('les erreurs autres que 401 ne touchent pas à la session', async () => {
    const dehors = jest.fn();
    setUnauthorizedHandler(dehors);
    fetchMock.mockReturnValue(reponse(403, { error: 'Interdit' }));
    await expect(apiFetch('/api/orders', 'A0')).rejects.toMatchObject({ status: 403 });
    expect(appels('/api/auth/refresh')).toHaveLength(0);
    expect(dehors).not.toHaveBeenCalled();
  });

  it('plusieurs appels refusés en même temps ne présentent qu\'une fois le jeton de renouvellement', async () => {
    fetchMock.mockImplementation(async (url: string, options: { headers: Record<string, string> }) => {
      if (String(url).includes('/api/auth/refresh')) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return reponse(200, { accessToken: 'A1', refreshToken: 'R1' });
      }
      return options.headers.Authorization === 'Bearer A1' ? reponse(200, { ok: true }) : reponse(401);
    });
    const resultats = await Promise.all(Array.from({ length: 6 }, () => apiFetch('/api/orders', 'A0')));
    expect(resultats).toEqual(Array(6).fill({ ok: true }));
    expect(appels('/api/auth/refresh')).toHaveLength(1);
  });

  it('sans session enregistrée, le renouvellement est expiré', async () => {
    mockStockage.clear();
    await expect(renewSession('A0')).resolves.toEqual({ expired: true });
    expect(appels('/api/auth/refresh')).toHaveLength(0);
  });

  it('un jeton déjà renouvelé par un autre appel est repris sans rappeler le serveur', async () => {
    mockStockage.set(CLE_SESSION, JSON.stringify({ accessToken: 'A9', refreshToken: 'R9', email: 'alice@exemple.test' }));
    await expect(renewSession('A0')).resolves.toEqual({ token: 'A9' });
    expect(appels('/api/auth/refresh')).toHaveLength(0);
  });

  it('409 REFRESH_CONCURRENT : attend la session enregistrée par l\'autre processus', async () => {
    jest.useFakeTimers();
    try {
      fetchMock.mockImplementation(async () => {
        mockStockage.set(CLE_SESSION, JSON.stringify({ accessToken: 'A-autre', refreshToken: 'R-autre', email: 'alice@exemple.test' }));
        return reponse(409, { code: 'REFRESH_CONCURRENT' });
      });
      const attente = renewSession('A0');
      await jest.advanceTimersByTimeAsync(1500);
      await expect(attente).resolves.toEqual({ token: 'A-autre' });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('utilitaires', () => {
  it('mediaUrl complète les chemins relatifs et laisse passer les adresses absolues', () => {
    expect(mediaUrl('/uploads/logo.png')).toBe('http://localhost:3001/uploads/logo.png');
    expect(mediaUrl('uploads/logo.png')).toBe('http://localhost:3001/uploads/logo.png');
    expect(mediaUrl('https://cdn.exemple.test/a.png')).toBe('https://cdn.exemple.test/a.png');
    expect(mediaUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(mediaUrl('file:///tmp/a.png')).toBe('file:///tmp/a.png');
    expect(mediaUrl(null)).toBeNull();
    expect(mediaUrl('')).toBeNull();
  });

  it('formatEuros affiche deux décimales à la française et tolère le vide', () => {
    expect(formatEuros(8)).toMatch(/^8,00\s€$/);
    expect(formatEuros('12.5')).toMatch(/^12,50\s€$/);
    expect(formatEuros(1234.5)).toMatch(/^1\s234,50\s€$/);
    expect(formatEuros(null)).toMatch(/^0,00\s€$/);
    expect(formatEuros('abc')).toMatch(/^0,00\s€$/);
  });
});

describe('adresse du serveur', () => {
  /** L'adresse est calculée à l'import : on recharge le module avec l'environnement voulu. */
  function charger(env: Record<string, string | undefined>, hostUri?: string) {
    const avant = { api: process.env.EXPO_PUBLIC_API_URL, site: process.env.EXPO_PUBLIC_SITE_URL };
    process.env.EXPO_PUBLIC_API_URL = env.api as string;
    process.env.EXPO_PUBLIC_SITE_URL = env.site as string;
    if (env.api === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    if (env.site === undefined) delete process.env.EXPO_PUBLIC_SITE_URL;
    let module_!: typeof import('../api');
    jest.isolateModules(() => {
      // Dans ce registre isolé, le module de configuration est une autre instance.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('expo-constants').default.expoConfig = hostUri ? { hostUri } : undefined;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      module_ = require('../api');
    });
    process.env.EXPO_PUBLIC_API_URL = avant.api as string;
    process.env.EXPO_PUBLIC_SITE_URL = avant.site as string;
    return module_;
  }

  it('la variable d\'environnement prime, sans barre finale', () => {
    expect(charger({ api: 'https://api.zupeat.com/' }, '192.168.1.5:8081').API_URL).toBe('https://api.zupeat.com');
  });

  it('en développement, vise le PC qui sert l\'application (port 3001)', () => {
    expect(charger({}, '192.168.1.5:8081').API_URL).toBe('http://192.168.1.5:3001');
  });

  it.each(['localhost:8081', '127.0.0.1:8081', undefined])('sans hôte distinct (%s), retombe sur localhost', (hote) => {
    expect(charger({}, hote).API_URL).toBe('http://localhost:3001');
  });

  it('le site public a une valeur par défaut, sans barre finale', () => {
    expect(charger({}).SITE_URL).toBe('https://zupeat.com');
    expect(charger({ site: 'https://exemple.test///' }).SITE_URL).toBe('https://exemple.test');
  });
});
