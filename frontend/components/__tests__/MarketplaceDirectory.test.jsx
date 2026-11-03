import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MarketplaceDirectory } from '../client/MarketplaceDirectory';

jest.mock('next-intl', () => ({ useLocale: () => 'fr', useTranslations: () => (key) => key }));
jest.mock('@/lib/region-context', () => {
  const region = { code: 'be-fr' };
  return { useRegion: () => region };
});
jest.mock('@/lib/adresseLivraison', () => ({ useAdresseLivraisonEnregistree: () => null }));
jest.mock('@/components/RechercheAdresseLivraison', () => ({ RechercheAdresseLivraison: () => null }));

const boutiques = [
  { id: 'a', slug: 'jules', name: 'Chez Jules', isOpenNow: true, products: [{ name: 'Salade' }], searchProducts: [{ name: 'Pizza végétarienne' }], livraison: { livrable: true, frais: 3, deliveryMinutes: 25 } },
  { id: 'b', slug: 'sushi', name: 'Sushi Zen', isOpenNow: false, livraison: { livrable: false, frais: 0, deliveryMinutes: 5 } },
  { id: 'c', slug: 'burger', name: 'Burger House', livraison: null },
];

beforeEach(() => {
  global.fetch = jest.fn(async (url) => ({ ok: true, json: async () => ({ data: String(url).includes('/types') ? { familles: [] } : boutiques }) }));
});

test('trouve un plat absent de l’aperçu et tolère une faute', async () => {
  render(<MarketplaceDirectory />);
  await screen.findByText('Chez Jules');
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'pizaa' } });
  expect(screen.getByText('Chez Jules')).toBeInTheDocument();
  expect(screen.queryByText('Sushi Zen')).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'introuvable' } });
  expect(screen.getByText('noResults')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'clearFilters' }));
  expect(screen.getByText('Sushi Zen')).toBeInTheDocument();
});

test('combine livraison à l’adresse et plafond de frais, puis les réinitialise', async () => {
  render(<MarketplaceDirectory />);
  await screen.findByText('Chez Jules');
  fireEvent.click(screen.getByRole('checkbox', { name: 'deliverable' }));
  expect(screen.queryByText('Sushi Zen')).not.toBeInTheDocument();
  expect(screen.queryByText('Burger House')).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'maxDeliveryFee' }), { target: { value: '0' } });
  await waitFor(() => expect(screen.getByText('noResults')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'clearFilters' }));
  expect(screen.getByText('Chez Jules')).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'maxDeliveryFee' })).toHaveValue('');
});

test('le filtre ouvert exclut les horaires inconnus et le filtre rapide exclut les hors zone', async () => {
  render(<MarketplaceDirectory />);
  await screen.findByText('Chez Jules');
  fireEvent.click(screen.getByRole('checkbox', { name: 'openNow' }));
  expect(screen.queryByText('Burger House')).not.toBeInTheDocument();
  expect(screen.queryByText('Sushi Zen')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: 'openNow' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'fast' }));
  expect(screen.getByText('Chez Jules')).toBeInTheDocument();
  expect(screen.queryByText('Sushi Zen')).not.toBeInTheDocument();
});
