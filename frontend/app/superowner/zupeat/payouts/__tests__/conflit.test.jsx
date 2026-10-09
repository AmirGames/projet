import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('next-intl', () => {
  const fr = require('../../../../../messages/fr.json');
  const traducteurs = Object.fromEntries(['common', 'superownerPayouts'].map((ns) => [ns, (cle) => fr[ns][cle] || cle]));
  return { useLocale: () => 'fr', useTranslations: (ns) => traducteurs[ns] };
});
jest.mock('@/lib/jeton-session', () => ({ jetonAcces: () => 'test' }));
jest.mock('@/lib/temps-reel', () => ({ useDonneesModifiees: () => {} }));
import VersementsPage from '../page';

const releve = { id: 'r1', driverName: 'Test A04', driverEmail: 'a04@example.test', periodStart: '2026-09-28', periodEnd: '2026-10-05', deliveryCount: 1, amount: 10.75, status: 'PENDING', batchId: null };
const reponse = (payouts) => ({ ok: true, json: async () => ({ payouts, counts: { PENDING: 1 }, totals: { PENDING: 10.75 }, periodeProposee: { periodStart: '2026-09-28', periodEnd: '2026-10-05' } }) });

afterEach(() => { jest.restoreAllMocks(); });
it('un relevé rattaché affiche son état et ne propose aucun paiement manuel', async () => {
  global.fetch = jest.fn(async () => reponse([{ ...releve, batchId: 'lot1' }]));
  render(<VersementsPage />);
  expect(await screen.findByText(/Inclus dans un lot bancaire/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Marquer versé' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Annuler le relevé de Test A04' })).not.toBeInTheDocument();
});
it('un conflit 409 referme le formulaire et relit l’état actuel sans effacer le refus', async () => {
  let dansLot = false;
  global.fetch = jest.fn(async (_url, options) => {
    if (options?.method === 'POST') {
      dansLot = true;
      return { ok: false, status: 409, json: async () => ({ error: 'Le relevé est dans un lot bancaire.', code: 'PAYOUT_IN_BATCH' }) };
    }
    return reponse([{ ...releve, batchId: dansLot ? 'lot1' : null }]);
  });
  render(<VersementsPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Marquer versé' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer le versement' }));
  expect(await screen.findByText(/Inclus dans un lot bancaire/)).toBeInTheDocument();
  expect(screen.getByText('Le relevé est dans un lot bancaire.')).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Confirmer le versement' })).not.toBeInTheDocument());
  expect(global.fetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
});
