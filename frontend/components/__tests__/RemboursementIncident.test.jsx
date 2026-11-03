import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import mockMessages from '../../messages/fr.json';
import { RemboursementIncident } from '../RemboursementIncident';
import { EtatRemboursement } from '../EtatRemboursement';

jest.mock('next-intl', () => {
  const traduire = (key, valeurs = {}) => {
    let texte = key.split('.').reduce((o, k) => o[k], mockMessages.incidentsCommande);
    for (const [cle, valeur] of Object.entries(valeurs)) texte = texte.replace(`{${cle}}`, valeur);
    return texte;
  };
  return { useTranslations: () => traduire, useLocale: () => 'fr' };
});
jest.mock('@/lib/jeton-session', () => ({ jetonAcces: () => 'admin' }));
const apercu = { available: true, currency: 'eur', remainingCents: 3300, operation: null,
  items: [{ lineId: 'l1', name: 'Pizza', quantity: 2, refundedQuantity: 0, netCents: 1800 }] };
const ouvrir = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Examiner le remboursement' }));
  await screen.findByRole('checkbox', { name: 'Pizza' });
};
const choisir = () => {
  fireEvent.click(screen.getByRole('checkbox', { name: 'Pizza' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Motif de la décision' }), { target: { value: 'Article manquant confirmé.' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /Je confirme le remboursement/ }));
};
beforeEach(() => {
  global.fetch = jest.fn(async (_url, options) => ({ ok: true, json: async () => ({ data: options?.method === 'POST' ? { status: 'REQUESTED', amountCents: 900, currency: 'eur' } : apercu }) }));
});

test('exige une confirmation du montant calculé et transmet une décision bornée au serveur', async () => {
  const onSaved = jest.fn();
  render(<RemboursementIncident issueId="d1" onSaved={onSaved} />);
  await ouvrir();
  expect(screen.getByRole('button', { name: 'Confirmer le remboursement' })).toBeDisabled();
  choisir();
  expect(screen.getByText(/Montant à rembourser : 9,00/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer le remboursement' }));
  await screen.findByText(/Remboursement demandé/);
  const [url, options] = global.fetch.mock.calls.find(([, options]) => options?.method === 'POST');
  expect(url).toContain('/orders/issues/d1/refund');
  expect(options.headers.Authorization).toBe('Bearer admin');
  expect(JSON.parse(options.body)).toEqual({ mode: 'ITEMS', items: [{ lineId: 'l1', quantity: 1 }], reason: 'Article manquant confirmé.', expectedAmountCents: 900 });
  expect(onSaved).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/Remboursement effectué/)).not.toBeInTheDocument();
});

test('remet la confirmation à zéro lors d’un changement de quantité ou de mode', async () => {
  render(<RemboursementIncident issueId="d1" onSaved={() => {}} />);
  await ouvrir(); choisir();
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Quantité' }), { target: { value: '2' } });
  expect(screen.getByRole('button', { name: 'Confirmer le remboursement' })).toBeDisabled();
  expect(screen.getByText(/Montant à rembourser : 18,00/)).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'BALANCE' } });
  expect(screen.getByText(/Montant à rembourser : 33,00/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Confirmer le remboursement' })).toBeDisabled();
});

test('envoie le solde sans sélection d’articles', async () => {
  render(<RemboursementIncident issueId="d1" onSaved={() => {}} />);
  await ouvrir(); choisir();
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'BALANCE' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /Je confirme le remboursement/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer le remboursement' }));
  await waitFor(() => expect(global.fetch.mock.calls.some(([, o]) => o?.method === 'POST')).toBe(true));
  const [, options] = global.fetch.mock.calls.find(([, o]) => o?.method === 'POST');
  expect(JSON.parse(options.body)).toMatchObject({ mode: 'BALANCE', items: [], expectedAmountCents: 3300 });
});

test('une réponse perdue conserve le payload pour une reprise identique', async () => {
  let echec = true;
  global.fetch.mockImplementation(async (_url, options) => {
    if (options?.method === 'POST' && echec) { echec = false; throw new Error('Réseau interrompu'); }
    return { ok: true, json: async () => ({ data: options?.method === 'POST' ? { status: 'REQUESTED' } : apercu }) };
  });
  render(<RemboursementIncident issueId="d1" onSaved={() => {}} />);
  await ouvrir(); choisir();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer le remboursement' }));
  await screen.findByRole('alert');
  expect(screen.getByRole('textbox')).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Reprendre la même demande' }));
  await screen.findByText(/Remboursement demandé/);
  const posts = global.fetch.mock.calls.filter(([, o]) => o?.method === 'POST');
  expect(posts).toHaveLength(2);
  expect(posts[1][1].body).toBe(posts[0][1].body);
});

test('un refus serveur impose de revoir et confirmer le montant', async () => {
  global.fetch.mockImplementation(async (_url, options) => ({ ok: options?.method !== 'POST', json: async () => options?.method === 'POST'
    ? { error: 'Le montant a changé.' } : { data: apercu } }));
  render(<RemboursementIncident issueId="d1" onSaved={() => {}} />);
  await ouvrir(); choisir();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer le remboursement' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Le montant a changé.');
  expect(screen.getByRole('button', { name: 'Confirmer le remboursement' })).toBeDisabled();
});

test('un dossier non éligible affiche la raison et aucun contrôle de remboursement', async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: { ...apercu, available: false, explanation: 'Commande en cours.' } }) });
  render(<RemboursementIncident issueId="d1" onSaved={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Examiner le remboursement' }));
  await screen.findByText('Commande en cours.');
  expect(screen.queryByRole('button', { name: 'Confirmer le remboursement' })).not.toBeInTheDocument();
});

test.each([
  ['REQUESTED', 'Remboursement demandé'], ['WAITING_STRIPE', 'Remboursement en attente de confirmation'],
  ['SUCCEEDED', 'Remboursement effectué'], ['ABANDONED', 'Remboursement à vérifier par le support'],
])('le client voit le statut %s avec le montant réellement demandé', (status, libelle) => {
  render(<EtatRemboursement operation={{ status, amountCents: 900, currency: 'eur' }} />);
  expect(screen.getByRole('status')).toHaveTextContent(libelle);
  expect(screen.getByRole('status')).toHaveTextContent('9,00');
});
