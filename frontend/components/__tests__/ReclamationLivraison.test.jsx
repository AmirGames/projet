import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReclamationLivraison } from '../ReclamationLivraison';

jest.mock('next-intl', () => ({ useTranslations: () => (key) => key }));
jest.mock('@/lib/suivi-commande', () => ({
  cheminCommande: (id, token, suffix) => `/api/orders/${id}${suffix}`,
  jetonDeSuivi: () => null,
}));

beforeEach(() => {
  localStorage.clear();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { deposee: true } }) });
});

it('affiche une réclamation déposée puis sa réponse après actualisation', () => {
  const { rerender } = render(<ReclamationLivraison orderId="commande" etat={{ possible: true, deposee: false }} />);
  rerender(<ReclamationLivraison orderId="commande" etat={{ possible: false, deposee: true }} />);
  expect(screen.getByText('deposee')).toBeTruthy();
  rerender(<ReclamationLivraison orderId="commande" etat={{
    possible: false, deposee: true, traiteeLe: '2026-10-04T12:00:00Z', reponse: 'Dépôt validé : Attente de six minutes respectée.',
  }} />);
  expect(screen.getByText('traitee')).toBeTruthy();
  expect(screen.getByText('Dépôt validé : Attente de six minutes respectée.')).toBeTruthy();
  expect(screen.queryByText('deposee')).toBeNull();
});

it('affiche la réponse après un dépôt depuis la page déjà ouverte', async () => {
  const { rerender } = render(<ReclamationLivraison orderId="commande" etat={{ possible: true, deposee: false }} />);
  fireEvent.click(screen.getByText('bouton'));
  fireEvent.click(screen.getByText('envoyer'));
  await waitFor(() => expect(screen.getByText('deposee')).toBeTruthy());
  rerender(<ReclamationLivraison orderId="commande" etat={{
    possible: false, deposee: true, traiteeLe: '2026-10-04T12:00:00Z', reponse: 'Dépôt refusé : Commande non reçue.',
  }} />);
  expect(screen.getByText('Dépôt refusé : Commande non reçue.')).toBeTruthy();
  rerender(<ReclamationLivraison orderId="autre-commande" etat={{ possible: true, deposee: false }} />);
  expect(screen.queryByText('traitee')).toBeNull();
  expect(screen.queryByText('deposee')).toBeNull();
});
