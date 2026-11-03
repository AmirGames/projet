import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import mockMessages from '../../messages/fr.json';
import IncidentsCommandesPage from '../../app/superowner/zupeat/support-tickets/incidents-commandes/page';
import { chargerAcces } from '@/lib/acces-plateforme';

jest.mock('next-intl', () => {
  const traduire = (key, valeurs = {}) => {
    let texte = key.split('.').reduce((o, k) => o[k], mockMessages.incidentsCommande);
    for (const [cle, valeur] of Object.entries(valeurs)) texte = texte.replace(`{${cle}}`, valeur);
    return texte;
  };
  return { useTranslations: () => traduire, useLocale: () => 'fr' };
});
jest.mock('@/lib/acces-plateforme', () => ({ chargerAcces: jest.fn(async () => ({ isSuperOwner: false, permissions: { 'support-tickets': 'write' } })) }));
jest.mock('@/lib/jeton-session', () => ({ jetonAcces: () => 'admin' }));

test('le support peut répondre au dossier sans déclencher un remboursement', async () => {
  let traite = false;
  const dossier = { id: 'd1', category: 'MISSING_ITEM', message: 'Une pizza manque.', status: 'OPEN', response: null, requestRefund: true,
    items: [{ lineId: 'l1', name: 'Pizza', quantity: 1 }], order: { id: 'o1', status: 'COMPLETED', paymentStatus: 'SUCCEEDED', store: { name: 'Chez Jules' } } };
  global.fetch = jest.fn(async (_url, options) => {
    if (options?.method === 'PUT') traite = true;
    return { ok: true, json: async () => options?.method === 'PUT' ? { data: { ...dossier, status: 'RESOLVED' } } : { dossiers: traite ? [] : [dossier], total: traite ? 0 : 1 } };
  });
  render(<IncidentsCommandesPage />);
  await screen.findByText('Une pizza manque.');
  expect(screen.getByRole('button', { name: 'Enregistrer la réponse' })).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox', { name: 'Réponse au client' }), { target: { value: 'Nous avons examiné votre demande.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la réponse' }));
  await waitFor(() => expect(screen.queryByText('Une pizza manque.')).not.toBeInTheDocument());
  const [url, options] = global.fetch.mock.calls.find(([, options]) => options?.method === 'PUT');
  expect(url).toContain('/support-tickets/order-issues/d1/response');
  expect(options.headers.Authorization).toBe('Bearer admin');
  expect(JSON.parse(options.body)).toEqual({ status: 'RESOLVED', response: 'Nous avons examiné votre demande.' });
  expect(global.fetch.mock.calls.every(([url]) => !String(url).includes('refund'))).toBe(true);
  expect(screen.queryByRole('button', { name: 'Examiner le remboursement' })).not.toBeInTheDocument();
});

test.each(['read', 'write'])('le bouton de remboursement exige Facturation en modification : %s', async (niveau) => {
  chargerAcces.mockResolvedValueOnce({ isSuperOwner: false, permissions: { billing: niveau, 'support-tickets': 'write' } });
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ dossiers: [{ id: 'd1', category: 'OTHER', message: 'Un problème à examiner.',
    status: 'OPEN', response: null, requestRefund: true, items: [], order: { id: 'o1', store: { name: 'Chez Jules' } } }], total: 1 }) }));
  render(<IncidentsCommandesPage />);
  await screen.findByText('Un problème à examiner.');
  if (niveau === 'write') expect(await screen.findByRole('button', { name: 'Examiner le remboursement' })).toBeInTheDocument();
  else expect(screen.queryByRole('button', { name: 'Examiner le remboursement' })).not.toBeInTheDocument();
});

test('un refus d’accès ne présente pas de contrôle de réponse', async () => {
  global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) }));
  render(<IncidentsCommandesPage />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger');
  expect(screen.queryByRole('textbox', { name: 'Réponse au client' })).not.toBeInTheDocument();
});
