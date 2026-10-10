/** @jest-environment jsdom */
import { useEffect } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';

const mockRouter = { replace: jest.fn(), push: jest.fn() };
jest.mock('@/components/MfaGate', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }));

const mockSession = {
  jeton: null as string | null,
  aRetrouver: false,
  perdueAuDemarrage: false,
};
const mockRenouveler = jest.fn();
const mockPoserJeton = jest.fn((valeur: string) => { mockSession.jeton = valeur; });
const mockOublierJeton = jest.fn(() => { mockSession.jeton = null; });
jest.mock('@/lib/jeton-session', () => ({
  ENTETE_TRANSPORT: { 'X-Refresh-Transport': 'cookie' },
  jetonAcces: () => mockSession.jeton,
  poserJeton: (...args: [string]) => mockPoserJeton(...args),
  oublierJeton: () => mockOublierJeton(),
  renouveler: (...args: unknown[]) => mockRenouveler(...args),
  sessionARetrouver: () => mockSession.aRetrouver,
  sessionPerdueAuDemarrage: () => mockSession.perdueAuDemarrage,
  sessionPrete: () => Promise.resolve(),
}));
const mockFermerPartout = jest.fn();
jest.mock('@/lib/sso', () => ({ fermerSessionPartout: () => mockFermerPartout() }));

import { AuthProvider, RAISON_DECONNEXION, useAuth } from '../auth-context';

const reponse = (statut: number, corps: unknown = {}) =>
  Promise.resolve({ ok: statut >= 200 && statut < 300, status: statut, json: async () => corps } as Response);
let fetchMock: jest.Mock;
let auth!: ReturnType<typeof useAuth>;

function Sonde() {
  const contexte = useAuth();
  // Hors du rendu : le test lit le contexte courant pour appeler login, logout…
  useEffect(() => {
    auth = contexte;
  });
  return (
    <div>
      <p data-testid="etat">{contexte.isLoading ? 'chargement' : contexte.isAuthenticated ? `connecté:${contexte.user?.email}` : 'anonyme'}</p>
    </div>
  );
}

const monter = () => render(<AuthProvider><Sonde /></AuthProvider>);
/** Montage qui laisse React reprendre un rendu suspendu en attendant la session (`use`). */
const monterEnAttendantLaSession = () => act(async () => { monter(); });
const etat = () => screen.getByTestId('etat').textContent;
const aller = (chemin: string) => window.history.pushState({}, '', chemin);

beforeEach(() => {
  jest.clearAllMocks();
  mockSession.jeton = null;
  mockSession.aRetrouver = false;
  mockSession.perdueAuDemarrage = false;
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  localStorage.clear();
  sessionStorage.clear();
  aller('/');
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('useAuth', () => {
  it('lève une erreur hors du fournisseur', () => {
    const Hors = () => { useAuth(); return null; };
    expect(() => render(<Hors />)).toThrow('useAuth must be used within an AuthProvider');
  });
});

describe('chargement de la session', () => {
  it('sans jeton : visiteur anonyme, aucun appel réseau', async () => {
    monter();
    await waitFor(() => expect(etat()).toBe('anonyme'));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(auth.isAuthenticated).toBe(false);
  });

  it('avec un jeton valide : lit /api/auth/me avec le Bearer et expose l\'utilisateur', async () => {
    mockSession.jeton = 'jeton.valide';
    fetchMock.mockReturnValue(reponse(200, { user: { id: 'u1', email: 'alice@exemple.test' } }));
    monter();
    await waitFor(() => expect(etat()).toBe('connecté:alice@exemple.test'));
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3001/api/auth/me', { headers: { Authorization: 'Bearer jeton.valide' } });
  });

  it('jeton expiré (401) : renouvelle par le cookie et garde l\'utilisateur', async () => {
    mockSession.jeton = 'jeton.expire';
    fetchMock.mockReturnValue(reponse(401, { error: 'expiré' }));
    mockRenouveler.mockResolvedValue({ ok: true, statut: 200, donnees: { accessToken: 'neuf', user: { id: 'u1', email: 'alice@exemple.test' } } });
    monter();
    await waitFor(() => expect(etat()).toBe('connecté:alice@exemple.test'));
    expect(mockRenouveler).toHaveBeenCalledTimes(1);
    expect(mockOublierJeton).not.toHaveBeenCalled();
  });

  it.each([401, 403])('renouvellement refusé (%s) : session effacée, message d\'expiration, retour à la connexion du commerçant', async statut => {
    aller('/merchant/orders');
    mockSession.jeton = 'jeton.expire';
    localStorage.setItem('storeId', 'boutique-1');
    fetchMock.mockReturnValue(reponse(401));
    mockRenouveler.mockResolvedValue({ ok: false, statut });
    monter();
    await waitFor(() => expect(etat()).toBe('anonyme'));
    expect(mockOublierJeton).toHaveBeenCalled();
    expect(localStorage.getItem('storeId')).toBeNull();
    expect(sessionStorage.getItem(RAISON_DECONNEXION)).toBe('session-expiree');
    expect(mockRouter.replace).toHaveBeenCalledWith('/login');
  });

  it.each([
    ['/driver/orders', '/driver/login'],
    ['/superowner/dashboard', '/login'],
    ['/dashboard', '/login'],
  ])('session morte sur %s : renvoie vers %s', async (chemin, connexion) => {
    aller(chemin);
    mockSession.jeton = 'jeton.expire';
    fetchMock.mockReturnValue(reponse(401));
    mockRenouveler.mockResolvedValue({ ok: false, statut: 401 });
    monter();
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith(connexion));
  });

  it.each(['/', '/store/boulangerie', '/driver/login', '/driver/signup', '/checkout'])(
    'session morte sur la page ouverte %s : efface la session sans renvoyer ailleurs',
    async chemin => {
      aller(chemin);
      mockSession.jeton = 'jeton.expire';
      fetchMock.mockReturnValue(reponse(401));
      mockRenouveler.mockResolvedValue({ ok: false, statut: 401 });
      monter();
      await waitFor(() => expect(etat()).toBe('anonyme'));
      expect(mockOublierJeton).toHaveBeenCalled();
      expect(mockRouter.replace).not.toHaveBeenCalled();
    }
  );

  it('panne du serveur au renouvellement : la session est conservée telle quelle', async () => {
    mockSession.jeton = 'jeton.expire';
    fetchMock.mockReturnValue(reponse(401));
    mockRenouveler.mockResolvedValue({ ok: false, statut: 503 });
    monter();
    await waitFor(() => expect(auth.isLoading).toBe(false));
    expect(mockOublierJeton).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(RAISON_DECONNEXION)).toBeNull();
  });

  it('une réponse /me inattendue (500) ne déconnecte personne', async () => {
    mockSession.jeton = 'jeton.valide';
    fetchMock.mockReturnValue(reponse(500));
    monter();
    await waitFor(() => expect(auth.isLoading).toBe(false));
    expect(mockOublierJeton).not.toHaveBeenCalled();
    expect(mockRenouveler).not.toHaveBeenCalled();
  });

  it('réseau coupé : l\'utilisateur déjà chargé reste connecté', async () => {
    mockSession.jeton = 'jeton.valide';
    fetchMock.mockReturnValueOnce(reponse(200, { user: { id: 'u1', email: 'alice@exemple.test' } }));
    monter();
    await waitFor(() => expect(etat()).toBe('connecté:alice@exemple.test'));
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await act(async () => { await auth.refreshAuth(); });
    expect(etat()).toBe('connecté:alice@exemple.test');
  });

  it('erreur inattendue (pas réseau) : l\'utilisateur est retiré', async () => {
    mockSession.jeton = 'jeton.valide';
    fetchMock.mockReturnValueOnce(reponse(200, { user: { id: 'u1', email: 'alice@exemple.test' } }));
    monter();
    await waitFor(() => expect(etat()).toBe('connecté:alice@exemple.test'));
    fetchMock.mockRejectedValue(new Error('JSON cassé'));
    await act(async () => { await auth.refreshAuth(); });
    expect(etat()).toBe('anonyme');
  });

  it('relit la session toutes les cinq minutes', async () => {
    jest.useFakeTimers();
    try {
      mockSession.jeton = 'jeton.valide';
      fetchMock.mockReturnValue(reponse(200, { user: { id: 'u1', email: 'alice@exemple.test' } }));
      monter();
      await act(async () => { await Promise.resolve(); });
      const avant = fetchMock.mock.calls.length;
      await act(async () => { await jest.advanceTimersByTimeAsync(5 * 60 * 1000); });
      expect(fetchMock.mock.calls.length).toBeGreaterThan(avant);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('session à retrouver après un rechargement', () => {
  it('session perdue au démarrage sur un espace réservé : message puis connexion', async () => {
    aller('/merchant');
    mockSession.aRetrouver = true;
    mockSession.perdueAuDemarrage = true;
    await monterEnAttendantLaSession();
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/login'));
    expect(mockOublierJeton).toHaveBeenCalled();
    expect(sessionStorage.getItem(RAISON_DECONNEXION)).toBe('session-expiree');
  });

  it('session retrouvée : les pages s\'affichent et l\'utilisateur est chargé', async () => {
    mockSession.aRetrouver = true;
    mockSession.jeton = 'jeton.retrouve';
    fetchMock.mockReturnValue(reponse(200, { user: { id: 'u1', email: 'alice@exemple.test' } }));
    await monterEnAttendantLaSession();
    await waitFor(() => expect(etat()).toBe('connecté:alice@exemple.test'));
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});

describe('login', () => {
  it('passe par le site lui-même, pose le jeton d\'accès en mémoire et retient l\'organisation et le livreur', async () => {
    monter();
    await waitFor(() => expect(etat()).toBe('anonyme'));
    fetchMock.mockReturnValue(reponse(200, {
      accessToken: 'jeton.connexion', user: { id: 'u1', email: 'alice@exemple.test' },
      organization: { id: 'org-1' }, driver: { id: 'livreur-1' },
    }));
    await act(async () => { await auth.login('alice@exemple.test', 'secret'); });
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Refresh-Transport': 'cookie' },
      body: JSON.stringify({ email: 'alice@exemple.test', password: 'secret' }),
    });
    expect(mockPoserJeton).toHaveBeenCalledWith('jeton.connexion');
    expect(localStorage.getItem('currentOrgId')).toBe('org-1');
    expect(localStorage.getItem('currentDriverId')).toBe('livreur-1');
    expect(etat()).toBe('connecté:alice@exemple.test');
    expect(JSON.stringify({ ...localStorage })).not.toContain('jeton.connexion');
  });

  it('un client sans commerce ni livraison n\'écrit ni organisation ni livreur', async () => {
    monter();
    await waitFor(() => expect(etat()).toBe('anonyme'));
    fetchMock.mockReturnValue(reponse(200, { accessToken: 'jeton.client', user: { id: 'u2', email: 'bob@exemple.test' } }));
    await act(async () => { await auth.login('bob@exemple.test', 'secret'); });
    expect(localStorage.getItem('currentOrgId')).toBeNull();
    expect(localStorage.getItem('currentDriverId')).toBeNull();
  });

  it('identifiants refusés : lève, ne pose aucun jeton et reste anonyme', async () => {
    monter();
    await waitFor(() => expect(etat()).toBe('anonyme'));
    fetchMock.mockReturnValue(reponse(401, { error: 'Identifiants invalides' }));
    await expect(auth.login('alice@exemple.test', 'faux')).rejects.toThrow('Login failed');
    expect(mockPoserJeton).not.toHaveBeenCalled();
    expect(etat()).toBe('anonyme');
  });
});

describe('logout', () => {
  it('ferme la session partout puis l\'efface ici, sans laisser de trace de stockage', async () => {
    mockSession.jeton = 'jeton.valide';
    localStorage.setItem('storeId', 'boutique-1');
    fetchMock.mockReturnValue(reponse(200, { user: { id: 'u1', email: 'alice@exemple.test' } }));
    monter();
    await waitFor(() => expect(etat()).toBe('connecté:alice@exemple.test'));
    act(() => auth.logout());
    expect(mockFermerPartout).toHaveBeenCalledTimes(1);
    expect(mockOublierJeton).toHaveBeenCalled();
    expect(localStorage.getItem('storeId')).toBeNull();
    expect(etat()).toBe('anonyme');
    expect(auth.isAuthenticated).toBe(false);
  });

  it('ferme la session distante avant d\'oublier le jeton (il est lu avant d\'être effacé)', async () => {
    mockSession.jeton = 'jeton.valide';
    fetchMock.mockReturnValue(reponse(200, { user: { id: 'u1', email: 'alice@exemple.test' } }));
    monter();
    await waitFor(() => expect(etat()).toBe('connecté:alice@exemple.test'));
    const ordre: string[] = [];
    mockFermerPartout.mockImplementation(() => { ordre.push('fermer'); });
    mockOublierJeton.mockImplementation(() => { ordre.push('oublier'); mockSession.jeton = null; });
    act(() => auth.logout());
    expect(ordre).toEqual(['fermer', 'oublier']);
  });
});
