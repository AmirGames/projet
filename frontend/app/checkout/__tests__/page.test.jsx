import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CheckoutPage from '../page';

let mockRecherche = '';
const mockRouter = {
  back: jest.fn(),
  push: jest.fn((href) => {
    mockRecherche = new URL(href, 'http://localhost').search;
  }),
};

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => new URLSearchParams(mockRecherche),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }) => (
    <a href={href} {...props} onClick={(event) => {
      event.preventDefault();
      mockRouter.push(href);
    }}>{children}</a>
  ),
}));

// Les vrais messages français : le test lit ce que le client lit.
jest.mock('next-intl', () => {
  const messages = jest.requireActual('../../../messages/fr.json');
  const traduire = (espace) => (cle, valeurs = {}) => {
    const texte = `${espace}.${cle}`.split('.').reduce((noeud, partie) => noeud?.[partie], messages);
    if (typeof texte !== 'string') return cle;
    return texte.replace(/\{(\w+)\}/g, (_, nom) => String(valeurs[nom] ?? `{${nom}}`));
  };
  return { useTranslations: traduire };
});
jest.mock('@/components/EnTeteClient', () => ({ EnTeteClient: () => null }));
jest.mock('@/components/TunnelCommande', () => {
  const { useState } = require('react');
  return {
    TunnelCommande: ({ boutique, lignes, surCommandePassee }) => {
      const [notes, setNotes] = useState('');
      return (
        <div data-testid="tunnel">
          <p>{boutique.name}</p>
          {lignes.map((ligne) => <p key={ligne.productId}>{ligne.name} × {ligne.quantity}</p>)}
          <input aria-label="Instructions" value={notes} onChange={(event) => setNotes(event.target.value)} />
          <button onClick={() => surCommandePassee({ id: 'commande', numero: '123' })}>Envoyer</button>
        </div>
      );
    },
  };
});

const paniers = {
  zipzup: {
    storeId: 'zipzup', storeName: 'Zipzup', storeSlug: 'zipzup', majA: '2026-10-04T10:00:00Z',
    lignes: [{ productId: 'naturelle', name: 'Naturelle', price: 3, quantity: 4 }],
  },
  boulangerie: {
    storeId: 'boulangerie', storeName: 'Boulangerie Démo', storeSlug: 'boulangerie-demo', majA: '2026-10-04T09:00:00Z',
    lignes: [{ productId: 'croissant', name: 'Croissant', price: 2, quantity: 12 }],
  },
};

beforeEach(() => {
  mockRecherche = '';
  jest.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('zupeat-paniers', JSON.stringify(paniers));
  window.history.replaceState(null, '', '/checkout');
  global.fetch = jest.fn().mockResolvedValue({ ok: false });
});

test('depuis Zipzup, ouvre son panier même si l’adresse du navigateur attend encore la navigation', () => {
  window.history.replaceState(null, '', '/store/zipzup');
  mockRecherche = '?boutique=zipzup';
  render(<CheckoutPage />);
  expect(screen.getByTestId('tunnel').textContent).toContain('Naturelle × 4');
  expect(screen.queryByText(/Quel panier/)).toBeNull();
  expect(screen.queryByText(/Croissant/)).toBeNull();
});

test.each(['zipzup', 'boulangerie'])('le choix %s ouvre le formulaire sans recharger la page', (id) => {
  const vue = render(<CheckoutPage />);
  expect(screen.getByText(/Quel panier/)).toBeTruthy();
  fireEvent.click(screen.getByRole('link', { name: new RegExp(paniers[id].storeName) }));
  vue.rerender(<CheckoutPage />);
  expect(mockRouter.push).toHaveBeenCalledWith(`/checkout?boutique=${id}`);
  expect(screen.getByTestId('tunnel').textContent).toContain(paniers[id].lignes[0].name);
  expect(screen.queryByText(/Quel panier/)).toBeNull();
});

test('changer de boutique remplace les articles et réinitialise le formulaire ; retour rouvre le choix', () => {
  mockRecherche = '?boutique=zipzup';
  window.history.replaceState(null, '', `/checkout${mockRecherche}`);
  const vue = render(<CheckoutPage />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Instructions' }), { target: { value: 'Pour Zipzup' } });
  mockRecherche = '?boutique=boulangerie';
  vue.rerender(<CheckoutPage />);
  expect(screen.getByTestId('tunnel').textContent).toContain('Croissant × 12');
  expect(screen.queryByText(/Naturelle/)).toBeNull();
  expect(screen.getByRole('textbox', { name: 'Instructions' }).value).toBe('');
  mockRecherche = '';
  vue.rerender(<CheckoutPage />);
  expect(screen.getByText(/Quel panier/)).toBeTruthy();
  expect(screen.queryByTestId('tunnel')).toBeNull();
});

test('sans commerce indiqué, un seul panier ouvre directement le formulaire', () => {
  localStorage.setItem('zupeat-paniers', JSON.stringify({ zipzup: paniers.zipzup }));
  render(<CheckoutPage />);
  expect(screen.getByTestId('tunnel').textContent).toContain('Naturelle × 4');
});

test('sans panier, propose de choisir un commerce', () => {
  localStorage.clear();
  render(<CheckoutPage />);
  expect(screen.getByText('Votre panier est vide')).toBeTruthy();
  expect(screen.queryByTestId('tunnel')).toBeNull();
});

test('commander Zipzup conserve l’autre panier et une nouvelle boutique quitte la confirmation', async () => {
  mockRecherche = '?boutique=zipzup';
  window.history.replaceState(null, '', `/checkout${mockRecherche}`);
  const vue = render(<CheckoutPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
  expect(screen.getByText('Commande envoyée')).toBeTruthy();
  expect(JSON.parse(localStorage.getItem('zupeat-paniers'))).toEqual({ boulangerie: paniers.boulangerie });
  mockRecherche = '?boutique=boulangerie';
  vue.rerender(<CheckoutPage />);
  expect(screen.queryByText('Commande envoyée')).toBeNull();
  expect(screen.getByTestId('tunnel').textContent).toContain('Croissant × 12');
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/client/stores/boulangerie')));
});
