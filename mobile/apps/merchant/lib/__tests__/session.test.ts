import { DEFAULT_PREFS, clearSession, loadPrefs, loadSession, savePrefs, saveSession, type Prefs, type Session } from '../session';

// Le stockage sécurisé du téléphone, simulé par une table en mémoire.
const mockStockage = new Map<string, string>();
const mockSecureStore = {
  getItemAsync: jest.fn(async (cle: string) => mockStockage.get(cle) ?? null),
  setItemAsync: jest.fn(async (cle: string, valeur: string) => { mockStockage.set(cle, valeur); }),
  deleteItemAsync: jest.fn(async (cle: string) => { mockStockage.delete(cle); }),
};
// Les fonctions sont résolues à l'appel : le mock est hissé avant la table ci-dessus.
jest.mock('expo-secure-store', () => ({
  getItemAsync: (...args: [string]) => mockSecureStore.getItemAsync(...args),
  setItemAsync: (...args: [string, string]) => mockSecureStore.setItemAsync(...args),
  deleteItemAsync: (...args: [string]) => mockSecureStore.deleteItemAsync(...args),
}));


const session: Session = { accessToken: 'acces.jeton', refreshToken: 'renouvellement.jeton', email: 'alice@exemple.test', orgId: 'org-1' };

beforeEach(() => {
  mockStockage.clear();
  jest.clearAllMocks();
  mockSecureStore.getItemAsync.mockImplementation(async (cle: string) => mockStockage.get(cle) ?? null);
  mockSecureStore.setItemAsync.mockImplementation(async (cle: string, valeur: string) => { mockStockage.set(cle, valeur); });
  mockSecureStore.deleteItemAsync.mockImplementation(async (cle: string) => { mockStockage.delete(cle); });
});

describe('session : jetons dans le stockage sécurisé', () => {
  it('sans session enregistrée, rend null', async () => {
    await expect(loadSession()).resolves.toBeNull();
  });

  it('enregistre puis relit la session telle quelle', async () => {
    await saveSession(session);
    await expect(loadSession()).resolves.toEqual(session);
  });

  it('écrit uniquement dans le SecureStore, sous une clé propre à l\'application', async () => {
    await saveSession(session);
    expect(mockSecureStore.setItemAsync).toHaveBeenCalledTimes(1);
    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith('zupeat.merchant.session', JSON.stringify(session));
  });

  it('une valeur corrompue est ignorée : pas de plantage, pas de session', async () => {
    mockStockage.set('zupeat.merchant.session', '{pas du json');
    await expect(loadSession()).resolves.toBeNull();
  });

  it('un stockage illisible (clé verrouillée, appareil restauré) donne « pas de session »', async () => {
    mockSecureStore.getItemAsync.mockRejectedValue(new Error('Keychain indisponible'));
    await expect(loadSession()).resolves.toBeNull();
  });

  it('un échec d\'écriture ne fait pas planter l\'application', async () => {
    const avertir = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockSecureStore.setItemAsync.mockRejectedValue(new Error('disque plein'));
    await expect(saveSession(session)).resolves.toBeUndefined();
    expect(avertir).toHaveBeenCalled();
    // Le message n'emporte pas les jetons dans les journaux.
    expect(JSON.stringify(avertir.mock.calls)).not.toContain('renouvellement.jeton');
    avertir.mockRestore();
  });

  it('la déconnexion efface la session', async () => {
    await saveSession(session);
    await clearSession();
    expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('zupeat.merchant.session');
    await expect(loadSession()).resolves.toBeNull();
  });

  it('la déconnexion réussit même si l\'effacement échoue', async () => {
    mockSecureStore.deleteItemAsync.mockRejectedValue(new Error('verrouillé'));
    await expect(clearSession()).resolves.toBeUndefined();
  });

  it('remplacer la session (renouvellement) écrase les anciens jetons', async () => {
    await saveSession(session);
    await saveSession({ ...session, accessToken: 'acces.neuf', refreshToken: 'renouvellement.neuf' });
    await expect(loadSession()).resolves.toMatchObject({ accessToken: 'acces.neuf', refreshToken: 'renouvellement.neuf' });
  });
});

describe('préférences du commerçant', () => {
  const prefs: Prefs = { storeId: 'boutique-1', preparationMinutes: 45, soundEnabled: false };

  it('sans préférence enregistrée, rend les valeurs par défaut', async () => {
    await expect(loadPrefs()).resolves.toEqual(DEFAULT_PREFS);
    expect(DEFAULT_PREFS).toEqual({ preparationMinutes: 30, soundEnabled: true });
  });

  it('enregistre et relit les préférences, séparément de la session', async () => {
    await savePrefs(prefs);
    await expect(loadPrefs()).resolves.toEqual(prefs);
    await expect(loadSession()).resolves.toBeNull();
  });

  it('complète une préférence ancienne avec les valeurs par défaut manquantes', async () => {
    mockStockage.set('zupeat.merchant.prefs', JSON.stringify({ storeId: 'boutique-1' }));
    await expect(loadPrefs()).resolves.toEqual({ storeId: 'boutique-1', preparationMinutes: 30, soundEnabled: true });
  });

  it('des préférences corrompues donnent les valeurs par défaut', async () => {
    mockStockage.set('zupeat.merchant.prefs', 'pas du json');
    await expect(loadPrefs()).resolves.toEqual(DEFAULT_PREFS);
  });

  it('la déconnexion garde les préférences de l\'appareil mais efface la session', async () => {
    await savePrefs(prefs);
    await saveSession(session);
    await clearSession();
    await expect(loadSession()).resolves.toBeNull();
    await expect(loadPrefs()).resolves.toEqual(prefs);
  });

  it('la session garde l\'organisation du commerçant', async () => {
    await saveSession(session);
    await expect(loadSession()).resolves.toMatchObject({ orgId: 'org-1' });
  });
});
