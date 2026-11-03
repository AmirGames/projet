import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import messages from '../../messages/fr.json';
import { EstimationLivraison } from '../EstimationLivraison';

jest.mock('next-intl', () => ({
  useLocale: () => 'fr-FR',
  useTranslations: () => (key, variables = {}) => {
    let message = key.split('.').reduce((valeur, partie) => valeur[partie], messages.estimationLivraison);
    for (const [nom, valeur] of Object.entries(variables)) message = message.replace(`{${nom}}`, valeur);
    return message;
  },
}));

const estimation = (extra = {}) => ({ etape: 'EN_ROUTE', motif: null,
  fourchette: { debut: '2026-11-02T12:10:00Z', fin: '2026-11-02T12:20:00Z' },
  calculeeLe: '2026-11-02T12:00:00Z', valideJusqua: '2026-11-02T12:01:00Z', ...extra });

beforeEach(() => jest.useFakeTimers({ now: new Date('2035-01-01T00:00:00Z') }));
afterEach(() => jest.useRealTimers());

test('affiche une fourchette et une étape malgré une horloge client décalée', () => {
  render(<EstimationLivraison estimation={estimation()} />);
  expect(screen.getByText(/Arrivée estimée entre/)).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Le livreur est en route vers vous.');
});

test('retire une estimation périmée hors ligne et accepte une nouvelle lecture', () => {
  const { rerender } = render(<EstimationLivraison estimation={estimation()} />);
  act(() => jest.advanceTimersByTime(65_000));
  expect(screen.queryByText(/Arrivée estimée entre/)).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Actualisation en cours');
  rerender(<EstimationLivraison estimation={estimation({ calculeeLe: '2026-11-02T12:01:00Z', valideJusqua: '2026-11-02T12:02:00Z' })} />);
  expect(screen.getByText(/Arrivée estimée entre/)).toBeInTheDocument();
});

test('explique les absences de GPS et les préparations en retard sans heure fictive', () => {
  const { rerender } = render(<EstimationLivraison estimation={estimation({ fourchette: null, motif: 'GPS_INDISPONIBLE' })} />);
  expect(screen.getByText(/position du livreur n’est pas à jour/)).toBeInTheDocument();
  expect(screen.queryByText(/Arrivée estimée entre/)).not.toBeInTheDocument();
  rerender(<EstimationLivraison estimation={estimation({ etape: 'PREPARATION', fourchette: null, motif: 'PREPARATION_EN_RETARD' })} />);
  expect(screen.getByText(/préparation prend plus de temps/)).toBeInTheDocument();
});

test('une réponse identique en cache ne prolonge pas la validité', () => {
  const { rerender } = render(<EstimationLivraison estimation={estimation()} />);
  act(() => jest.advanceTimersByTime(55_000));
  rerender(<EstimationLivraison estimation={estimation()} />);
  act(() => jest.advanceTimersByTime(10_000));
  expect(screen.queryByText(/Arrivée estimée entre/)).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Actualisation en cours');
});

test('actualise l’étape et supprime les heures une fois la livraison terminée', () => {
  const { rerender } = render(<EstimationLivraison estimation={estimation({ etape: 'AUTRE_LIVRAISON' })} />);
  expect(screen.getByRole('status')).toHaveTextContent('une autre livraison');
  rerender(<EstimationLivraison estimation={estimation({ etape: 'LIVREE' })} />);
  act(() => jest.advanceTimersByTime(120_000));
  expect(screen.getByRole('status')).toHaveTextContent('Votre commande a été livrée.');
  expect(screen.queryByText(/Arrivée estimée entre/)).not.toBeInTheDocument();
});

test('ne plante pas sur une fourchette invalide et ne montre rien pour un retrait', () => {
  const { rerender } = render(<EstimationLivraison estimation={estimation({ fourchette: { debut: 'inconnu', fin: 'inconnu' } })} />);
  expect(screen.queryByText(/Arrivée estimée entre/)).not.toBeInTheDocument();
  rerender(<EstimationLivraison estimation={null} />);
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
});
