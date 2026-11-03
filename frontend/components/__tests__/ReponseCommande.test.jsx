import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import mockMessages from '../../messages/fr.json';
import { ReponseCommande } from '../ReponseCommande';
import { CarteCommandeCuisine } from '../CarteCommandeCuisine';
import { accepterCommande } from '@/lib/reponse-commande';

jest.mock('next-intl', () => ({ useTranslations: (namespace) => (key, values = {}) => {
  const groupe = namespace.split('.').reduce((objet, partie) => objet[partie], mockMessages);
  let texte = key.split('.').reduce((objet, partie) => objet[partie], groupe);
  for (const [cle, valeur] of Object.entries(values)) texte = texte.replace(`{${cle}}`, valeur);
  return texte;
} }));
jest.mock('@/lib/reponse-commande', () => ({
  ...jest.requireActual('@/lib/reponse-commande'),
  accepterCommande: jest.fn(),
}));

const etatCuisine = { minutes: 30, habituelle: 30, source: 'HISTORIQUE', echantillons: 10, commandesEnCours: 2, attenteMinutes: 0, rush: null, reglages: { minutesParDefaut: 20, commandesParalleles: 3 } };
const commande = { id: 'commande-1', status: 'PENDING', deliveryType: 'DELIVERY' };
beforeEach(() => { jest.clearAllMocks(); accepterCommande.mockResolvedValue({ status: 'ACCEPTED' }); global.fetch = jest.fn(async () => ({ ok: true, json: async () => etatCuisine })); });

test('propose le temps habituel et permet de l’ajuster avec moins et plus', async () => {
  const surChangement = jest.fn();
  render(<ReponseCommande storeId="commerce" commande={commande} surChangement={surChangement} />);
  expect(screen.getByRole('button', { name: 'Accepter' })).toBeDisabled();
  await screen.findByRole('button', { name: 'Accepter et annoncer 30 min' });
  fireEvent.click(screen.getByRole('button', { name: 'Augmenter de 5 minutes' }));
  expect(screen.getByRole('spinbutton', { name: 'Durée en minutes (1 à 240)' })).toHaveValue(35);
  fireEvent.click(screen.getByRole('button', { name: 'Diminuer de 5 minutes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Accepter et annoncer 30 min' }));
  await waitFor(() => expect(surChangement).toHaveBeenCalledTimes(1));
  expect(accepterCommande).toHaveBeenCalledWith('commerce', 'commande-1', 30);
});

test('permet un délai personnalisé sans envoyer une durée invalide', async () => {
  render(<ReponseCommande storeId="commerce" commande={commande} surChangement={jest.fn()} />);
  await screen.findByRole('button', { name: 'Accepter et annoncer 30 min' });
  const input = screen.getByRole('spinbutton', { name: 'Durée en minutes (1 à 240)' });
  for (const value of ['', '-1', '241', '2.5']) {
    fireEvent.change(input, { target: { value } });
    expect(screen.getByRole('button', { name: 'Accepter' })).toBeDisabled();
  }
  expect(accepterCommande).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: '25' } });
  fireEvent.click(screen.getByRole('button', { name: 'Accepter et annoncer 25 min' }));
  await waitFor(() => expect(accepterCommande).toHaveBeenCalledWith('commerce', 'commande-1', 25));
});

test('ne reporte pas un ajustement ponctuel sur une autre commande', async () => {
  const props = { storeId: 'commerce', surChangement: jest.fn() };
  const { rerender } = render(<ReponseCommande {...props} commande={commande} />);
  await screen.findByRole('button', { name: 'Accepter et annoncer 30 min' });
  fireEvent.click(screen.getByRole('button', { name: 'Augmenter de 5 minutes' }));
  rerender(<ReponseCommande {...props} commande={{ ...commande, id: 'commande-2' }} />);
  await screen.findByRole('button', { name: 'Accepter et annoncer 30 min' });
  expect(screen.getByRole('spinbutton', { name: 'Durée en minutes (1 à 240)' })).toHaveValue(30);
});

test('ne confirme pas une annonce refusée par le serveur', async () => {
  accepterCommande.mockRejectedValue(new Error('Cette commande a déjà été traitée.'));
  const surChangement = jest.fn();
  render(<ReponseCommande storeId="commerce" commande={commande} surChangement={surChangement} />);
  await screen.findByRole('button', { name: 'Accepter et annoncer 30 min' });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Durée en minutes (1 à 240)' }), { target: { value: '20' } });
  fireEvent.click(screen.getByRole('button', { name: 'Accepter et annoncer 20 min' }));
  await screen.findByText('Cette commande a déjà été traitée.');
  expect(surChangement).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Accepter et annoncer 20 min' })).toBeEnabled();
});


test('active un supplément temporaire sans changer la durée annoncée à une commande', async () => {
  render(<ReponseCommande storeId="commerce" commande={commande} surChangement={jest.fn()} />);
  await screen.findByRole('button', { name: 'Accepter et annoncer 30 min' });
  fireEvent.click(screen.getByText('Capacité et mode cuisine chargée'));
  fireEvent.change(screen.getByRole('combobox', { name: 'Mode de la cuisine' }), { target: { value: '60' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les réglages' }));
  await screen.findByText('Réglages enregistrés. Les prochaines suggestions sont actualisées.');
  const requete = global.fetch.mock.calls.find(([, options]) => options?.method === 'PUT');
  expect(JSON.parse(requete[1].body)).toEqual({ minutesParDefaut: 20, commandesParalleles: 3, supplementRush: 10, dureeRush: 60 });
  expect(accepterCommande).not.toHaveBeenCalled();
});

test('propose aussi le délai et les boutons moins/plus sur l’écran cuisine', async () => {
  render(<CarteCommandeCuisine storeId="commerce" orgId="org" maintenant={Date.now()} livreurDeLaPlateforme={false} surChoisirLivreur={jest.fn()} commande={{ ...commande, customerName: 'Alice', totalAmount: 12, paymentStatus: 'SUCCEEDED', createdAt: new Date().toISOString(), items: [{ id: 'ligne', quantity: 1, product: { name: 'Pizza' } }] }} />);
  await screen.findByRole('button', { name: 'Accepter · 30 min' });
  fireEvent.click(screen.getByRole('button', { name: 'Augmenter de 5 minutes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Accepter · 35 min' }));
  await waitFor(() => expect(accepterCommande).toHaveBeenCalledWith('commerce', 'commande-1', 35));
});
