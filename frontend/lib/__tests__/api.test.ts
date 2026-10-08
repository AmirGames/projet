/** @jest-environment jsdom */

const mockJeton = { valeur: null as string | null };
const mockRenouveler = jest.fn();
jest.mock('../jeton-session', () => ({
  ENTETE_TRANSPORT: { 'X-Refresh-Transport': 'cookie' },
  jetonAcces: () => mockJeton.valeur,
  renouveler: (...args: unknown[]) => mockRenouveler(...args),
}));

import { api } from '../api';

const reponse = (statut: number, corps: unknown = {}) =>
  Promise.resolve({ ok: statut >= 200 && statut < 300, status: statut, json: async () => corps } as Response);
let fetchMock: jest.Mock;

beforeEach(() => {
  mockJeton.valeur = null;
  mockRenouveler.mockReset();
  localStorage.clear();
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('en-têtes d\'authentification', () => {
  it('envoie le jeton d\'accès en Bearer quand une session est ouverte', async () => {
    mockJeton.valeur = 'jeton.acces.ok';
    fetchMock.mockReturnValue(reponse(200, { user: { id: 'u1' } }));
    await api.getMe();
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3001/api/auth/me', {
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jeton.acces.ok' },
    });
  });

  it('n\'envoie aucun en-tête Authorization sans session (pas de « Bearer null »)', async () => {
    fetchMock.mockReturnValue(reponse(200, {}));
    await api.getMe();
    const { headers } = fetchMock.mock.calls[0][1];
    expect(headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.stringify(headers)).not.toContain('Bearer');
  });

  it('renvoie le corps d\'une réponse 401 tel quel, sans lever : c\'est le contexte d\'authentification qui renouvelle la session', async () => {
    mockJeton.valeur = 'jeton.expire';
    fetchMock.mockReturnValue(reponse(401, { error: 'Session invalide', code: 'SESSION_INVALIDE' }));
    await expect(api.getMe()).resolves.toEqual({ error: 'Session invalide', code: 'SESSION_INVALIDE' });
    expect(mockRenouveler).not.toHaveBeenCalled();
  });

  it('les routes d\'écriture utilisent le jeton passé en paramètre, pas celui de la session', async () => {
    mockJeton.valeur = 'jeton.de.session';
    fetchMock.mockReturnValue(reponse(200, {}));
    await api.createCategory('boutique-1', 'Entrées', 'jeton.parametre');
    const { headers, body, method } = fetchMock.mock.calls[0][1];
    expect(method).toBe('POST');
    expect(headers.Authorization).toBe('Bearer jeton.parametre');
    expect(JSON.parse(body)).toEqual({ storeId: 'boutique-1', name: 'Entrées' });
  });

  it.each([
    ['deleteProduct', '/api/products/p1'],
    ['deleteCategory', '/api/categories/p1'],
  ] as const)('%s lit le jeton de session et vise la bonne ressource', async (methode, chemin) => {
    mockJeton.valeur = 'jeton.de.session';
    fetchMock.mockReturnValue(reponse(200, {}));
    await api[methode]('p1');
    expect(fetchMock.mock.calls[0][0]).toBe(`http://localhost:3001${chemin}`);
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer jeton.de.session');
  });

  it('deleteProduct sans session n\'envoie pas de jeton', async () => {
    fetchMock.mockReturnValue(reponse(401, { error: 'Authentification requise' }));
    await api.deleteProduct('p1');
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ 'Content-Type': 'application/json' });
  });
});

describe('connexion et inscription', () => {
  it('login passe par le site lui-même (cookie de renouvellement) avec le transport cookie', async () => {
    fetchMock.mockReturnValue(reponse(200, { accessToken: 'a.b.c', user: { id: 'u1' } }));
    const resultat = await api.login('alice@exemple.test', 'secret');
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Refresh-Transport': 'cookie' },
      body: JSON.stringify({ email: 'alice@exemple.test', password: 'secret' }),
    });
    expect(resultat).toEqual({ accessToken: 'a.b.c', user: { id: 'u1' } });
  });

  it('login refusé : rend le message et le code de l\'API, jamais un booléen', async () => {
    fetchMock.mockReturnValue(reponse(401, { error: 'Identifiants invalides', code: 'INVALID_CREDENTIALS' }));
    await expect(api.login('alice@exemple.test', 'faux')).resolves.toEqual({ error: 'Identifiants invalides', code: 'INVALID_CREDENTIALS' });
  });

  it('login refusé sans message : un texte par défaut', async () => {
    fetchMock.mockReturnValue(reponse(500, {}));
    await expect(api.login('a@b.test', 'x')).resolves.toEqual({ error: 'Erreur de connexion', code: undefined });
  });

  it('login hors ligne : message explicite plutôt qu\'une exception', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(api.login('a@b.test', 'x')).resolves.toEqual({ error: 'Serveur injoignable. Vérifiez votre connexion.' });
  });

  it('signup envoie la confirmation, l\'acceptation des conditions et le transport cookie', async () => {
    fetchMock.mockReturnValue(reponse(201, { user: { id: 'u2' } }));
    await api.signup('bob@exemple.test', 'Motdepasse1!', 'Bob', true);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/auth/signup');
    expect(options.headers['X-Refresh-Transport']).toBe('cookie');
    expect(JSON.parse(options.body)).toEqual({ email: 'bob@exemple.test', password: 'Motdepasse1!', name: 'Bob', confirmPassword: 'Motdepasse1!', conditionsAcceptees: true });
  });

  it('signup refusé : message et code de l\'API', async () => {
    fetchMock.mockReturnValue(reponse(409, { error: 'Adresse déjà utilisée', code: 'EMAIL_EXISTS' }));
    await expect(api.signup('bob@exemple.test', 'x', 'Bob', true)).resolves.toEqual({ error: 'Adresse déjà utilisée', code: 'EMAIL_EXISTS' });
  });

  it('signup hors ligne : message explicite', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(api.signup('a@b.test', 'x', 'A', true)).resolves.toEqual({ error: 'Serveur injoignable. Vérifiez votre connexion.' });
  });
});

describe('refresh', () => {
  it('rend les données du renouvellement quand il réussit', async () => {
    mockRenouveler.mockResolvedValue({ ok: true, donnees: { accessToken: 'neuf', user: { id: 'u1' } }, statut: 200 });
    await expect(api.refresh()).resolves.toEqual({ accessToken: 'neuf', user: { id: 'u1' } });
  });

  it('rend { error: true } quand le renouvellement est refusé ou sans donnée', async () => {
    mockRenouveler.mockResolvedValue({ ok: false, statut: 401 });
    await expect(api.refresh()).resolves.toEqual({ error: true });
  });
});

describe('commandes et suivi sans compte', () => {
  it('createOrder garde le jeton de suivi pour retrouver la commande d\'un invité', async () => {
    fetchMock.mockReturnValue(reponse(201, { order: { id: 'cmd-1', trackingToken: 'suivi-secret' } }));
    await api.createOrder('boutique-1', 'Alice', 'a@b.test', '0470', 'DELIVERY', 1200);
    expect(localStorage.getItem('suiviCommande:cmd-1')).toBe('suivi-secret');
  });

  it('createOrder n\'envoie pas de jeton d\'accès (un invité peut commander) et le total est un entier envoyé tel quel', async () => {
    mockJeton.valeur = 'jeton.de.session';
    fetchMock.mockReturnValue(reponse(201, { order: { id: 'cmd-1' } }));
    await api.createOrder('boutique-1', 'Alice', 'a@b.test', '0470', 'PICKUP', 1099);
    const options = fetchMock.mock.calls[0][1];
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(options.body)).toMatchObject({ storeId: 'boutique-1', deliveryType: 'PICKUP', totalAmount: 1099 });
  });

  it('createOrder sans jeton de suivi dans la réponse ne stocke rien', async () => {
    fetchMock.mockReturnValue(reponse(400, { error: 'Panier vide' }));
    await expect(api.createOrder('b', 'A', 'a@b.test', '0', 'PICKUP', 0)).resolves.toEqual({ error: 'Panier vide' });
    expect(localStorage.length).toBe(0);
  });

  it('getOrder joint le jeton de suivi mémorisé, encodé', async () => {
    localStorage.setItem('suiviCommande:cmd 1', 'jeton&secret');
    fetchMock.mockReturnValue(reponse(200, { id: 'cmd 1' }));
    await api.getOrder('cmd 1');
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3001/api/orders/cmd%201?t=jeton%26secret');
  });

  it('getOrder sans jeton de suivi n\'ajoute pas de paramètre', async () => {
    fetchMock.mockReturnValue(reponse(404, { error: 'Introuvable' }));
    await api.getOrder('cmd-2');
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3001/api/orders/cmd-2');
  });

  it('updateOrderStatus transmet le statut par PATCH avec le jeton fourni', async () => {
    fetchMock.mockReturnValue(reponse(200, {}));
    await api.updateOrderStatus('cmd-1', 'ACCEPTED', 'jeton.marchand');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/api/orders/cmd-1/status');
    expect(options.method).toBe('PATCH');
    expect(options.headers.Authorization).toBe('Bearer jeton.marchand');
    expect(JSON.parse(options.body)).toEqual({ status: 'ACCEPTED' });
  });
});

describe('espaces commerçant et livreur', () => {
  it('getRoles lève une erreur lisible quand la réponse n\'est pas OK', async () => {
    fetchMock.mockReturnValue(reponse(401, { error: 'Session invalide' }));
    await expect(api.getRoles()).rejects.toThrow('Erreur lors du chargement des rôles');
  });

  it('getRoles rend les rôles du compte', async () => {
    mockJeton.valeur = 'jeton.ok';
    fetchMock.mockReturnValue(reponse(200, { roles: ['merchant'] }));
    await expect(api.getRoles()).resolves.toEqual({ roles: ['merchant'] });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer jeton.ok');
  });

  it.each([
    ['becomeMerchant', 'become-merchant', 'Erreur lors de la création du commerce'],
    ['becomeDriver', 'become-driver', 'Erreur lors de la création du profil livreur'],
  ] as const)('%s remonte le message de l\'API, ou un texte par défaut', async (methode, chemin, secours) => {
    fetchMock.mockReturnValueOnce(reponse(400, { error: 'Dossier incomplet' }));
    await expect(api[methode]({})).rejects.toThrow('Dossier incomplet');
    fetchMock.mockReturnValueOnce(reponse(500, {}));
    await expect(api[methode]({})).rejects.toThrow(secours);
    expect(fetchMock.mock.calls[0][0]).toBe(`http://localhost:3001/api/auth/me/${chemin}`);
  });

  it('createProduct envoie un produit actif dans la boutique indiquée', async () => {
    fetchMock.mockReturnValue(reponse(201, {}));
    await api.createProduct('boutique-1', 'SKU-1', 'Salade', 8.5, 10, 'jeton.marchand');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ storeId: 'boutique-1', sku: 'SKU-1', name: 'Salade', price: 8.5, stock: 10, status: 'ACTIVE' });
  });
});
