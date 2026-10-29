import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockAuth = { user: null, isLoading: false };
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }) }));
jest.mock('next-intl', () => ({
  useTranslations: (namespace) => Object.assign(
    (key) => key === 'checkEmail' ? 'Vérifiez votre e-mail de confirmation.' : `${namespace}.${key}`,
    { rich: (key) => `${namespace}.${key}` },
  ),
}));
jest.mock('@/lib/auth-context', () => ({ useAuth: () => mockAuth }));
jest.mock('@/lib/navigateur', () => ({ useJetonAcces: () => null }));
jest.mock('@/lib/pays-client', () => ({ usePays: () => ['BE', jest.fn()] }));
jest.mock('@/lib/types-commerce', () => ({ useTypesDeCommerce: () => ({ etablissements: [{ code: 'restaurant', libelle: 'Restaurant' }], cuisines: [] }) }));
jest.mock('@/lib/jeton-session', () => ({ jetonAcces: jest.fn(() => 'test-access-token'), poserJeton: jest.fn(), adopterRefresh: jest.fn() }));
jest.mock('@/lib/sso', () => ({ confierSessionCentrale: jest.fn() }));
jest.mock('@/components/SelecteurPays', () => ({ SelecteurPays: () => null }));
jest.mock('@/components/ReglesMotDePasse', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/AddressAutocomplete', () => ({
  AddressAutocomplete: ({ value, onChange }) => <input name="address" value={value} onChange={(e) => onChange(e.target.value)} />,
}));
jest.mock('@/components/AcceptationConditions', () => ({
  __esModule: true,
  default: ({ coche, onChange }) => <input type="checkbox" checked={coche} onChange={(e) => onChange(e.target.checked)} />,
}));

jest.mock('../../../mobile/apps/delivery/node_modules/react', () => jest.requireActual('react'));
jest.mock('react-native', () => ({
  ActivityIndicator: () => null,
  KeyboardAvoidingView: ({ children }) => <div>{children}</div>,
  ScrollView: ({ children }) => <div>{children}</div>,
  Text: ({ children }) => <span>{children}</span>,
  View: ({ children }) => <div>{children}</div>,
  TextInput: ({ value, onChangeText, placeholder, secureTextEntry }) => <input value={value} onChange={(e) => onChangeText(e.target.value)} placeholder={placeholder} type={secureTextEntry ? 'password' : 'text'} />,
  TouchableOpacity: ({ children, onPress, disabled, accessibilityRole }) => <button role={accessibilityRole} onClick={onPress} disabled={disabled}>{children}</button>,
  Linking: { openURL: jest.fn() },
  Platform: { OS: 'android' },
}), { virtual: true });
jest.mock('../../../mobile/apps/delivery/lib/api', () => ({ API_URL: 'https://api.example.test', SITE_URL: 'https://example.test' }));
jest.mock('../../../mobile/apps/delivery/components/ui', () => ({ COLORS: {}, themedStyles: (factory) => factory() }));

import MerchantRegisterPage from '@/app/merchant/register/page';
import InscriptionLivreurPage from '@/app/driver/signup/page';
import SignupScreen from '../../../mobile/apps/delivery/components/screens/SignupScreen';
import { adopterRefresh, poserJeton } from '@/lib/jeton-session';
import { confierSessionCentrale } from '@/lib/sso';

const ancienFetch = global.fetch;
beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.user = null;
  mockAuth.isLoading = false;
  localStorage.removeItem('currentOrgId');
  global.fetch = jest.fn(async () => ({ ok: true, status: 202, json: async () => ({ emailVerificationRequired: true }) }));
});
afterEach(() => { global.fetch = ancienFetch; });
const changer = (input, value) => fireEvent.change(input, { target: { value } });

it('commerçant : affiche la confirmation, sans session ni redirection vers un tableau inexistant', async () => {
  const { container } = render(<MerchantRegisterPage />);
  const donnees = {
    businessName: 'Commerce', email: 'pro@example.test', phone: '0470123456', description: 'Commerce test',
    address: '1 rue test', city: 'Namur', postalCode: '5000', storeName: 'Boutique', storeSlug: 'boutique',
    password: 'MotDePasse123!', confirmPassword: 'MotDePasse123!',
  };
  for (const [name, value] of Object.entries(donnees)) changer(container.querySelector(`[name="${name}"]`), value);
  fireEvent.click(container.querySelector('[type="checkbox"]'));
  fireEvent.submit(container.querySelector('form'));
  await screen.findByRole('status');
  expect(screen.getByText('Vérifiez votre e-mail de confirmation.')).toBeTruthy();
  expect(container.querySelector('form')).toBeNull();
  expect(poserJeton).not.toHaveBeenCalled();
  expect(adopterRefresh).not.toHaveBeenCalled();
  expect(confierSessionCentrale).not.toHaveBeenCalled();
  expect(mockPush).not.toHaveBeenCalled();
});

it('commerçant déjà inscrit : retourne à sa boutique au lieu de recréer un commerce', async () => {
  mockAuth.user = { id: 'user-1', email: 'commercant@example.test' };
  localStorage.setItem('currentOrgId', 'org-existing');
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({
      roles: {
        merchant: {
          active: true,
          organizations: [{ id: 'org-other' }, { id: 'org-existing' }],
        },
      },
    }),
  }));

  render(<MerchantRegisterPage />);

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/merchant/org-existing/dashboard'));
  expect(localStorage.getItem('currentOrgId')).toBe('org-existing');
});

it('compte connecté sans rôle commerçant : poursuit vers le formulaire de création', async () => {
  mockAuth.user = { id: 'user-2', email: 'client@example.test' };
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ roles: { merchant: { active: false, organizations: [] } } }),
  }));

  render(<MerchantRegisterPage />);

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/merchant/onboard'));
});

it('livreur web : affiche la confirmation, sans stocker des jetons absents', async () => {
  const { container } = render(<InscriptionLivreurPage />);
  changer(container.querySelector('[type="text"]'), 'Livreur test');
  changer(container.querySelector('[type="email"]'), 'livreur@example.test');
  changer(container.querySelector('[type="tel"]'), '0470123456');
  changer(screen.getByPlaceholderText('0123.456.749'), '0123456749');
  changer(screen.getByPlaceholderText('0123.456.749'), '0123456749');
  changer(container.querySelector('[type="password"]'), 'MotDePasse123!');
  fireEvent.click(container.querySelector('[type="checkbox"]'));
  fireEvent.submit(container.querySelector('form'));
  await screen.findByRole('status');
  expect(container.querySelector('form')).toBeNull();
  expect(poserJeton).not.toHaveBeenCalled();
  expect(adopterRefresh).not.toHaveBeenCalled();
  expect(confierSessionCentrale).not.toHaveBeenCalled();
  expect(mockPush).not.toHaveBeenCalled();
});

it('livreur mobile : reste déconnecté et propose le retour à la connexion après confirmation', async () => {
  const onSignedUp = jest.fn();
  const onCancel = jest.fn();
  const { container } = render(<SignupScreen onSignedUp={onSignedUp} onCancel={onCancel} />);
  changer(screen.getByPlaceholderText('Prénom Nom'), 'Livreur test');
  changer(screen.getByPlaceholderText('vous@exemple.fr'), 'livreur@example.test');
  changer(container.querySelector('[type="password"]'), 'MotDePasse123!');
  changer(screen.getByPlaceholderText('06 12 34 56 78'), '0612345678');
  changer(screen.getByPlaceholderText('0123.456.749'), '0123456749');
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByText('Créer mon compte'));
  await waitFor(() => expect(screen.getByText('Vérifiez votre e-mail')).toBeTruthy());
  expect(onSignedUp).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Retour à la connexion'));
  expect(onCancel).toHaveBeenCalledTimes(1);
});
