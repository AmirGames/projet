import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import mockMessages from '../../messages/fr.json';
import { IncidentCommande } from '../IncidentCommande';

jest.mock('next-intl', () => {
  const traduire = (key) => key.split('.').reduce((o, k) => o[k], mockMessages.incidentsCommande);
  return { useTranslations: () => traduire };
});
jest.mock('@/lib/jeton-session', () => ({ jetonAcces: () => null }));
jest.mock('@/lib/suivi-commande', () => ({ jetonDeSuivi: () => 'invite', cheminCommande: (id, token, suite) => `/api/orders/${id}${suite}?t=${token}` }));
const etat = { categories: ['MISSING_ITEM', 'WRONG_ORDER', 'OTHER'], refundPossible: true, items: [{ id: 'l1', name: 'Pizza', quantity: 2 }], dossiers: [] };
const dossier = { id: 'd1', category: 'MISSING_ITEM', message: 'Il manque deux pizzas.', requestRefund: true, status: 'OPEN', response: null };
beforeEach(() => {
  global.fetch = jest.fn(async (_url, options) => ({ ok: true, json: async () => ({ data: options?.method === 'POST' ? dossier : etat }) }));
});
afterEach(() => jest.useRealTimers());

test('permet à un invité de signaler les articles et de demander un examen du remboursement', async () => {
  render(<IncidentCommande orderId="o1" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Signaler un problème' }));
  expect(screen.getByRole('button', { name: 'Envoyer le signalement' })).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Pizza' }));
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Quantité' }), { target: { value: '2' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Décrivez le problème' }), { target: { value: 'Il manque deux pizzas.' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Demander un examen pour remboursement' }));
  fireEvent.click(screen.getByRole('button', { name: 'Envoyer le signalement' }));
  await screen.findByText('Demande de remboursement à examiner.');
  const [url, options] = global.fetch.mock.calls.find(([, options]) => options?.method === 'POST');
  expect(url).toContain('?t=invite');
  expect(JSON.parse(options.body)).toEqual({ category: 'MISSING_ITEM', message: 'Il manque deux pizzas.', requestRefund: true, items: [{ lineId: 'l1', quantity: 2 }] });
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});

test('borne les quantités et ne propose pas de remboursement sans paiement encaissé', async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: { ...etat, refundPossible: false } }) });
  render(<IncidentCommande orderId="o1" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Signaler un problème' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Pizza' }));
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Quantité' }), { target: { value: '3' } });
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Articles manquants.' } });
  expect(screen.getByRole('button', { name: 'Envoyer le signalement' })).toBeDisabled();
  expect(screen.queryByRole('checkbox', { name: 'Demander un examen pour remboursement' })).not.toBeInTheDocument();
});

test('montre une erreur sans faire croire que le signalement a été enregistré', async () => {
  global.fetch.mockImplementation(async (_url, options) => ({ ok: options?.method !== 'POST', json: async () => options?.method === 'POST' ? { error: 'Commande indisponible.' } : { data: etat } }));
  render(<IncidentCommande orderId="o1" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Signaler un problème' }));
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'OTHER' } });
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Un problème à examiner.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Envoyer le signalement' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Commande indisponible.');
  expect(screen.getByRole('textbox')).toBeInTheDocument();
});

test('relit la réponse du support et ne présente pas une réponse comme un remboursement effectué', async () => {
  jest.useFakeTimers();
  let repondu = false;
  global.fetch.mockImplementation(async () => ({ ok: true, json: async () => ({ data: { ...etat, dossiers: [{ ...dossier, status: repondu ? 'RESOLVED' : 'OPEN', response: repondu ? 'Nous avons examiné la demande.' : null }] } }) }));
  render(<IncidentCommande orderId="o1" />);
  await screen.findByText(/En attente du support/);
  repondu = true;
  await act(async () => { jest.advanceTimersByTime(20_000); });
  await waitFor(() => expect(screen.getByText(/Nous avons examiné la demande/)).toBeInTheDocument());
  expect(screen.getByText(/Réponse apportée/)).toBeInTheDocument();
  expect(screen.queryByText('Remboursement effectué')).not.toBeInTheDocument();
});
