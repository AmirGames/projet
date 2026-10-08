import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

// Lu à l'import du composant : le paiement en ligne (pourboire) en dépend.
process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_fictive';

const mockRouter = { push: jest.fn(), back: jest.fn() };
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }));

// Les vrais messages français : le test lit ce que le client lit.
jest.mock('next-intl', () => {
  const messages = jest.requireActual('../../messages/fr.json');
  const traduire = (espace) => (cle, valeurs = {}) => {
    const texte = `${espace}.${cle}`.split('.').reduce((noeud, partie) => noeud?.[partie], messages);
    if (typeof texte !== 'string') return cle;
    return texte.replace(/\{(\w+)(?:, plural,[^}]*(?:\{[^}]*\}[^}]*)*)?\}/g, (_, nom) => String(valeurs[nom] ?? `{${nom}}`));
  };
  return { useTranslations: traduire };
});

jest.mock('@/components/LienRegional', () => ({ __esModule: true, default: ({ href, children, ...props }) => <a href={href} {...props}>{children}</a> }));
jest.mock('@/components/AddressAutocomplete', () => ({
  AddressAutocomplete: ({ id, value, onChange, onSelect }) => (
    <div>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
      <button type="button" onClick={() => onSelect({ street: '12 rue du Marché', city: 'Namur', postalCode: '5000', latitude: 50.46, longitude: 4.86 })}>
        Choisir la suggestion
      </button>
    </div>
  ),
}));
jest.mock('@/components/stripe-payment', () => ({
  StripePayment: ({ orderId, amount, onPaymentComplete }) => (
    <div data-testid="stripe">
      <span>{`${orderId}|${amount}`}</span>
      <button onClick={() => onPaymentComplete(true)}>Paiement réussi</button>
      <button onClick={() => onPaymentComplete(false)}>Paiement refusé</button>
    </div>
  ),
}));
jest.mock('@/components/ChoixPourboire', () => ({ ChoixPourboire: ({ base, onChange }) => <button onClick={() => onChange(2)}>{`Pourboire 2 € (base ${base})`}</button> }));
jest.mock('@/components/DelaiAnnulation', () => ({
  DelaiAnnulation: ({ lieu, surPartir, surRetour }) => (
    <div data-testid="delai">
      <span>{lieu}</span>
      <button onClick={surPartir}>Envoyer maintenant</button>
      <button onClick={surRetour}>Retour à la boutique</button>
    </div>
  ),
}));

let mockUtilisateur = null;
jest.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: mockUtilisateur }) }));
let mockJeton = null;
jest.mock('@/lib/jeton-session', () => ({ jetonAcces: () => mockJeton }));
jest.mock('@/lib/pays-client', () => ({ paysDuNavigateur: () => 'BE' }));
const mockAcceptation = { lireEtatAcceptation: jest.fn(), memoriserAcceptation: jest.fn(), oublierAcceptation: jest.fn() };
jest.mock('@/lib/acceptation-commande', () => ({
  lireEtatAcceptation: (...args) => mockAcceptation.lireEtatAcceptation(...args),
  memoriserAcceptation: (...args) => mockAcceptation.memoriserAcceptation(...args),
  oublierAcceptation: (...args) => mockAcceptation.oublierAcceptation(...args),
}));
let mockAdresseEnregistree = null;
const mockEnregistrerAdresse = jest.fn();
jest.mock('@/lib/adresseLivraison', () => ({
  useAdresseLivraisonEnregistree: () => mockAdresseEnregistree,
  enregistrerAdresseLivraison: (...args) => mockEnregistrerAdresse(...args),
}));

const messages = require('../../messages/fr.json');
const { euro } = require('../../lib/format');
/** Le montant tel que le lit le test : espaces insécables ramenés à des espaces simples. */
const eur = (valeur) => euro(valeur).replace(/[\u00a0\u202f]/g, ' ');
const { oublierTentative } = require('../../lib/cle-tentative');
const { TunnelCommande } = require('../TunnelCommande');

const t = (cle) => messages.tunnelCommande[cle];
const boutique = { id: 'boutique-1', name: 'Chez Zipzup', slug: 'zipzup', address: '1 rue du Four', city: 'Namur' };
const salade = { productId: 'salade', name: 'Salade', price: 8, quantity: 2 };
const lignes = [salade];

/** Le réseau simulé : chaque test règle ce dont il a besoin. */
let reseau;
let fetchMock;
const appelsA = (fragment, methode) => fetchMock.mock.calls.filter(([url, options]) => String(url).includes(fragment) && (!methode || (options?.method || 'GET') === methode));
const corpsDeLaCommande = () => JSON.parse(appelsA('/api/orders', 'POST')[0][1].body);
const reponse = (statut, corps) => Promise.resolve({ ok: statut >= 200 && statut < 300, status: statut, json: async () => corps });

beforeEach(() => {
  jest.clearAllMocks();
  oublierTentative();
  localStorage.clear();
  mockUtilisateur = null;
  mockJeton = null;
  mockAdresseEnregistree = null;
  mockAcceptation.lireEtatAcceptation.mockResolvedValue(null);
  reseau = {
    profil: null,
    livraison: { livrable: true, zone: { name: 'Centre', minOrder: 0, deliveryMinutes: 30 }, distanceKm: 1.2, frais: 3, minimum: 0, gratuiteDes: null, raison: '', forfaitBoutique: false, mode: 'PLATFORM' },
    creneaux: [{ date: '2026-10-09', libelle: 'Vendredi', creneaux: [{ valeur: '2026-10-09T12:00', libelle: '12:00' }] }],
    moyens: [{ id: 'carte', type: 'CARD', name: 'Carte bancaire', isDefault: true }, { id: 'especes', type: 'CASH', name: 'Espèces', isDefault: false }],
    frais: 0,
    promo: { statut: 200, corps: { discountAmount: 2 } },
    commande: { statut: 201, corps: { order: { id: 'cmd-abcdef1234', trackingToken: 'suivi-secret', totalAmount: 16 } } },
  };
  fetchMock = jest.fn((url, options = {}) => {
    const adresse = String(url);
    if (adresse.includes('/api/client/me')) return reseau.profil ? reponse(200, { data: reseau.profil }) : reponse(404, {});
    if (adresse.includes('/zone-livraison')) return reponse(200, { data: reseau.livraison });
    if (adresse.includes('/pickup-slots')) return reponse(200, { data: reseau.creneaux });
    if (adresse.includes('/payment-methods')) return reponse(200, { data: reseau.moyens });
    if (adresse.includes('/api/client/service-fee')) return reponse(200, { data: { frais: reseau.frais } });
    if (adresse.includes('/api/promotions/validate')) return reponse(reseau.promo.statut, reseau.promo.corps);
    if (adresse.endsWith('/api/orders') && options.method === 'POST') {
      return typeof reseau.commande === 'function' ? reseau.commande() : reponse(reseau.commande.statut, reseau.commande.corps);
    }
    return reponse(404, {});
  });
  global.fetch = fetchMock;
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

async function afficher(props = {}) {
  const surCommandePassee = jest.fn();
  const rendu = render(<TunnelCommande boutique={boutique} lignes={lignes} surCommandePassee={surCommandePassee} {...props} />);
  // Laisse passer les chargements de départ (moyens de paiement, frais, profil).
  await waitFor(() => expect(appelsA('/payment-methods')).toHaveLength(1));
  await act(async () => { await Promise.resolve(); });
  return { surCommandePassee, ...rendu };
}

const saisir = (libelle, valeur) => fireEvent.change(screen.getByLabelText(libelle), { target: { value: valeur } });
const bouton = (nom) => screen.getByRole('button', { name: nom });
const coordonnees = () => {
  saisir(new RegExp(`^${t('nomComplet')}`), 'Alice Martin');
  saisir(new RegExp(`^${t('email')}`), 'alice@exemple.test');
  saisir(new RegExp(`^${t('telephone')}`), '0470 12 34 56');
};
const adresseSaisie = () => fireEvent.click(bouton('Choisir la suggestion'));
const cocherConditions = () => fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(messages.acceptationConditions.jAiLu) }));
const confirmer = () => fireEvent.click(bouton(t('confirmer')));
/** Un client prêt à commander en livraison. */
async function preparerLivraison(props) {
  const rendu = await afficher(props);
  coordonnees();
  adresseSaisie();
  await waitFor(() => expect(appelsA('/zone-livraison').length).toBeGreaterThan(0));
  cocherConditions();
  return rendu;
}

describe('panier : récapitulatif et montants', () => {
  it('montre la boutique, le détail du panier une fois déplié et les totaux', async () => {
    reseau.frais = 0.5;
    await afficher({ lignes: [{ ...salade, variantId: 'v1', variantNom: 'Grande', supplements: [{ id: 's1', label: 'Fromage' }] }] });
    await waitFor(() => expect(screen.getByText(eur(0.5))).toBeInTheDocument());
    expect(screen.getByText('Chez Zipzup')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Récapitulatif du panier/ }));
    const liste = screen.getByRole('list');
    expect(within(liste).getByText(/Salade/)).toBeInTheDocument();
    expect(within(liste).getByText(/Grande/)).toBeInTheDocument();
    expect(within(liste).getByText(/Fromage/)).toBeInTheDocument();
    expect(within(liste).getByText(eur(16))).toBeInTheDocument();
    // Sous-total 16 € + frais de service 0,50 € (la livraison reste à calculer).
    expect(screen.getByText(t('total')).parentElement).toHaveTextContent(eur(16.5));
  });

  it('un panier vide est refusé avant tout envoi', async () => {
    await afficher({ lignes: [] });
    coordonnees();
    adresseSaisie();
    cocherConditions();
    await waitFor(() => expect(appelsA('/zone-livraison').length).toBeGreaterThan(0));
    confirmer();
    expect(await screen.findByText(t('panierVide'))).toBeInTheDocument();
    expect(appelsA('/api/orders', 'POST')).toHaveLength(0);
  });

  it('ajoute les frais de la zone de livraison au total', async () => {
    await preparerLivraison();
    await waitFor(() => expect(screen.getByText(t('total')).parentElement).toHaveTextContent(eur(19)));
  });

  it('la livraison est offerte dès le seuil de la zone', async () => {
    reseau.livraison = { ...reseau.livraison, gratuiteDes: 15 };
    await preparerLivraison();
    await waitFor(() => expect(screen.getAllByText(t('offerte')).length).toBeGreaterThan(0));
    expect(screen.getByText(t('total')).parentElement).toHaveTextContent(eur(16));
  });

  it('sous le minimum de la zone, la commande est bloquée et le manque annoncé', async () => {
    reseau.livraison = { ...reseau.livraison, minimum: 20 };
    await preparerLivraison();
    const bouton_ = await screen.findByRole('button', { name: /^Minimum 20/ });
    expect(bouton_).toBeDisabled();
    fireEvent.click(bouton_);
    expect(appelsA('/api/orders', 'POST')).toHaveLength(0);
  });

  it('une adresse hors zone désactive la commande et dit pourquoi', async () => {
    reseau.livraison = { ...reseau.livraison, livrable: false, raison: 'Trop loin de la boutique' };
    await preparerLivraison();
    expect(await screen.findByText('Trop loin de la boutique')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('adresseNonLivree') })).toBeDisabled();
  });

  it('les conditions générales doivent être acceptées pour confirmer', async () => {
    await afficher();
    expect(bouton(t('confirmer'))).toBeDisabled();
    cocherConditions();
    expect(bouton(t('confirmer'))).toBeEnabled();
  });

  it('les conditions déjà acceptées dans leur version en vigueur ne sont plus redemandées', async () => {
    mockAcceptation.lireEtatAcceptation.mockResolvedValue({ dejaAccepte: true, versions: 'cgv-3' });
    await afficher();
    await waitFor(() => expect(bouton(t('confirmer'))).toBeEnabled());
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});

describe('code promo', () => {
  const appliquer = async (code = 'bienvenue10') => {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t('ajouterCode')) }));
    saisir(t('codePromo'), code);
    fireEvent.click(bouton(t('appliquer')));
  };

  it('vérifie le code auprès du serveur avec le panier (jamais un total) et applique la remise', async () => {
    await afficher({ lignes: [{ ...salade, variantId: 'v1', supplements: [{ id: 's1', label: 'Fromage' }] }] });
    await appliquer();
    expect(await screen.findByText(/appliqué/)).toBeInTheDocument();
    const [url, options] = appelsA('/api/promotions/validate', 'POST')[0];
    expect(url).toContain('storeId=boutique-1');
    expect(JSON.parse(options.body)).toEqual({ code: 'BIENVENUE10', lignes: [{ productId: 'salade', quantity: 2, variantId: 'v1', supplements: ['s1'] }] });
    expect(screen.getByText(t('total')).parentElement).toHaveTextContent(eur(14));
  });

  it('un code refusé affiche le message du serveur et ne change pas le total', async () => {
    reseau.promo = { statut: 400, corps: { error: 'Code expiré' } };
    await afficher();
    await appliquer('perime');
    expect(await screen.findByText('Code expiré')).toBeInTheDocument();
    expect(screen.getByText(t('total')).parentElement).toHaveTextContent(eur(16));
  });

  it('un code sans remise sur ce panier est signalé', async () => {
    reseau.promo = { statut: 200, corps: { discountAmount: 0 } };
    await afficher();
    await appliquer();
    expect(await screen.findByText(t('codeSansRemise'))).toBeInTheDocument();
  });

  it('une panne réseau pendant la vérification est signalée sans casser le tunnel', async () => {
    await afficher();
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError('Failed to fetch')));
    await appliquer();
    expect(await screen.findByText(t('verificationImpossible'))).toBeInTheDocument();
  });

  it('retirer le code restaure le total et la remise part en code seul dans la commande', async () => {
    await preparerLivraison();
    await appliquer();
    await screen.findByText(/appliqué/);
    confirmer();
    await waitFor(() => expect(appelsA('/api/orders', 'POST')).toHaveLength(1));
    expect(corpsDeLaCommande().promoCode).toBe('BIENVENUE10');
  });

  it('le retrait du code est pris en compte', async () => {
    await afficher();
    await appliquer();
    await screen.findByText(/appliqué/);
    fireEvent.click(bouton(t('retirer')));
    expect(screen.getByText(t('total')).parentElement).toHaveTextContent(eur(16));
  });
});

describe('adresse et coordonnées', () => {
  it('livraison par défaut : les coordonnées manquantes sont refusées avant tout envoi', async () => {
    await afficher();
    cocherConditions();
    confirmer();
    expect(await screen.findByText(t('champsObligatoires'))).toBeInTheDocument();
    expect(appelsA('/api/orders', 'POST')).toHaveLength(0);
  });

  it('livraison sans adresse : refusée avec le bon message', async () => {
    await afficher();
    coordonnees();
    cocherConditions();
    confirmer();
    expect(await screen.findByText(t('adresseManquante'))).toBeInTheDocument();
    expect(appelsA('/api/orders', 'POST')).toHaveLength(0);
  });

  it('la ville est obligatoire en livraison même si la rue est saisie', async () => {
    await afficher();
    coordonnees();
    saisir(new RegExp(`^${t('adresse')}`), '5 rue sans ville');
    cocherConditions();
    confirmer();
    expect(await screen.findByText(t('adresseManquante'))).toBeInTheDocument();
  });

  it('une suggestion retenue interroge la zone avec ses coordonnées', async () => {
    await afficher();
    adresseSaisie();
    await waitFor(() => expect(appelsA('/zone-livraison')).toHaveLength(1));
    expect(appelsA('/zone-livraison')[0][0]).toContain('boutique-1/zone-livraison?lat=50.46&lng=4.86');
    expect(screen.getByDisplayValue('Namur')).toBeInTheDocument();
    expect(screen.getByDisplayValue('5000')).toBeInTheDocument();
  });

  it('une adresse tapée à la main est située par le serveur, après une temporisation', async () => {
    jest.useFakeTimers();
    try {
      await afficher();
      saisir(new RegExp(`^${t('adresse')}`), '5 rue de Fer');
      saisir(new RegExp(`^${t('ville')}`), 'Namur');
      expect(appelsA('/zone-livraison')).toHaveLength(0);
      await act(async () => { await jest.advanceTimersByTimeAsync(600); });
      expect(appelsA('/zone-livraison')).toHaveLength(1);
      expect(decodeURIComponent(appelsA('/zone-livraison')[0][0])).toContain('?adresse=5 rue de Fer Namur');
    } finally {
      jest.useRealTimers();
    }
  });

  it('retaper l\'adresse après une suggestion jette ses coordonnées devenues fausses', async () => {
    await preparerLivraison();
    saisir(new RegExp(`^${t('adresse')}`), '99 autre rue');
    cocherConditions();
    cocherConditions();
    confirmer();
    await waitFor(() => expect(appelsA('/api/orders', 'POST')).toHaveLength(1));
    const corps = corpsDeLaCommande();
    expect(corps.deliveryAddress).toBe('99 autre rue');
    expect(corps.deliveryLat).toBeUndefined();
    expect(corps.deliveryLng).toBeUndefined();
  });

  it('pas d\'appel de zone en retrait', async () => {
    await afficher();
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(t('retraitSurPlace')) }));
    await waitFor(() => expect(appelsA('/pickup-slots')).toHaveLength(1));
    expect(appelsA('/zone-livraison')).toHaveLength(0);
  });

  it('le retrait exige un créneau, pas d\'adresse', async () => {
    await afficher();
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(t('retraitSurPlace')) }));
    coordonnees();
    cocherConditions();
    confirmer();
    expect(await screen.findByText(t('heureManquante'))).toBeInTheDocument();
    expect(appelsA('/api/orders', 'POST')).toHaveLength(0);
  });

  it('le retrait avec un créneau envoie l\'heure choisie et aucune adresse de livraison', async () => {
    await afficher();
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(t('retraitSurPlace')) }));
    const liste = await screen.findByLabelText(new RegExp(`^${t('heureRetrait')}`));
    coordonnees();
    fireEvent.change(liste, { target: { value: '2026-10-09T12:00' } });
    cocherConditions();
    confirmer();
    await waitFor(() => expect(appelsA('/api/orders', 'POST')).toHaveLength(1));
    const corps = corpsDeLaCommande();
    expect(corps).toMatchObject({ deliveryType: 'PICKUP', pickupTime: '2026-10-09T12:00' });
    expect(corps.deliveryAddress).toBeUndefined();
    expect(mockEnregistrerAdresse).not.toHaveBeenCalled();
  });

  it('sans créneau disponible, le client est prévenu', async () => {
    reseau.creneaux = [];
    await afficher();
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(t('retraitSurPlace')) }));
    expect(await screen.findByText(t('aucunCreneau'))).toBeInTheDocument();
  });

  it('boutique fermée : la livraison est indisponible, le retrait seul reste possible', async () => {
    await afficher({ ouverteMaintenant: false });
    expect(screen.getByRole('radio', { name: new RegExp(`^${t('livraison')}`) })).toBeDisabled();
    expect(screen.getByRole('radio', { name: new RegExp(t('retraitSurPlace')) })).toBeChecked();
    expect(screen.getByText(t('livraisonFermee'))).toBeInTheDocument();
  });

  it('un client connecté retrouve son profil (coordonnées et adresse) et la commande porte son jeton', async () => {
    mockUtilisateur = { id: 'u1', email: 'alice@exemple.test' };
    mockJeton = 'jeton.client';
    reseau.profil = { name: 'Alice Martin', email: 'alice@exemple.test', phone: '+32470123456', address: '3 rue Haute', city: 'Namur', postalCode: '5000' };
    await afficher();
    await waitFor(() => expect(screen.getByText('Alice Martin')).toBeInTheDocument());
    expect(appelsA('/api/client/me')[0][1].headers.Authorization).toBe('Bearer jeton.client');
    cocherConditions();
    await waitFor(() => expect(appelsA('/zone-livraison').length).toBeGreaterThan(0));
    confirmer();
    await waitFor(() => expect(appelsA('/api/orders', 'POST')).toHaveLength(1));
    expect(appelsA('/api/orders', 'POST')[0][1].headers.Authorization).toBe('Bearer jeton.client');
    expect(corpsDeLaCommande()).toMatchObject({ customerName: 'Alice Martin', deliveryAddress: '3 rue Haute', deliveryCity: 'Namur', deliveryPostal: '5000' });
  });

  it('l\'adresse retenue sur l\'accueil prime sur celle du profil', async () => {
    mockUtilisateur = { id: 'u1' };
    mockJeton = 'jeton.client';
    mockAdresseEnregistree = { street: '8 place Centrale', city: 'Dinant', postalCode: '5500', latitude: 50.26, longitude: 4.91, label: '' };
    reseau.profil = { name: 'Alice', email: 'a@exemple.test', phone: '0470', address: '3 rue Haute', city: 'Namur', postalCode: '5000' };
    await afficher();
    cocherConditions();
    await waitFor(() => expect(appelsA('/zone-livraison').length).toBeGreaterThan(0));
    confirmer();
    await waitFor(() => expect(appelsA('/api/orders', 'POST')).toHaveLength(1));
    expect(corpsDeLaCommande()).toMatchObject({ deliveryAddress: '8 place Centrale', deliveryCity: 'Dinant', deliveryPostal: '5500', deliveryLat: 50.26, deliveryLng: 4.91 });
  });

  it('un invité n\'envoie aucun jeton', async () => {
    await preparerLivraison();
    confirmer();
    await waitFor(() => expect(appelsA('/api/orders', 'POST')).toHaveLength(1));
    expect(appelsA('/api/orders', 'POST')[0][1].headers.Authorization).toBeUndefined();
  });
});

describe('paiement et envoi de la commande', () => {
  it('propose les moyens de paiement du commerçant, celui par défaut présélectionné', async () => {
    await afficher();
    await screen.findByRole('radiogroup', { name: t('moyenPaiement') });
    expect(screen.getByRole('radio', { name: 'Carte bancaire' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Espèces' })).not.toBeChecked();
  });

  it('n\'envoie jamais un montant : le serveur tarife, taxe et totalise', async () => {
    await preparerLivraison({ lignes: [{ ...salade, variantId: 'v1', supplements: [{ id: 's1', label: 'Fromage' }] }] });
    confirmer();
    await waitFor(() => expect(appelsA('/api/orders', 'POST')).toHaveLength(1));
    const corps = corpsDeLaCommande();
    expect(corps).toMatchObject({
      storeId: 'boutique-1', deliveryType: 'DELIVERY', conditionsAcceptees: true, paymentMethodId: 'carte',
      customerPhone: '+32470123456',
      items: [{ productId: 'salade', quantity: 2, variantId: 'v1', supplements: ['s1'] }],
    });
    const texte = JSON.stringify(corps);
    for (const interdit of ['price', 'total', 'amount', 'totalAmount', 'subtotal', 'fee', 'frais', 'tax']) {
      expect(texte.toLowerCase()).not.toContain(`"${interdit.toLowerCase()}"`);
    }
    expect(corps.items[0]).not.toHaveProperty('price');
  });

  it('envoie une clé d\'idempotence, la même pour le même panier réessayé', async () => {
    reseau.commande = { statut: 500, corps: { error: 'Indisponible' } };
    await preparerLivraison();
    confirmer();
    await screen.findByText('Indisponible');
    confirmer();
    await waitFor(() => expect(appelsA('/api/orders', 'POST')).toHaveLength(2));
    const [premier, second] = appelsA('/api/orders', 'POST').map(([, options]) => options.headers['Idempotency-Key']);
    expect(premier).toBeTruthy();
    expect(second).toBe(premier);
  });

  it('un panier modifié est un autre achat : autre clé d\'idempotence', async () => {
    reseau.commande = { statut: 500, corps: { error: 'Indisponible' } };
    const { rerender, surCommandePassee } = await preparerLivraison();
    confirmer();
    await screen.findByText('Indisponible');
    rerender(<TunnelCommande boutique={boutique} lignes={[{ ...salade, quantity: 3 }]} surCommandePassee={surCommandePassee} />);
    confirmer();
    await waitFor(() => expect(appelsA('/api/orders', 'POST')).toHaveLength(2));
    const [premier, second] = appelsA('/api/orders', 'POST').map(([, options]) => options.headers['Idempotency-Key']);
    expect(second).not.toBe(premier);
  });

  it('un double clic n\'envoie qu\'une commande', async () => {
    let terminer;
    reseau.commande = () => new Promise((resolve) => { terminer = () => resolve({ ok: true, status: 201, json: async () => ({ order: { id: 'cmd-abcdef1234' } }) }); });
    await preparerLivraison();
    confirmer();
    await screen.findByRole('button', { name: t('traitement') });
    fireEvent.click(screen.getByRole('button', { name: t('traitement') }));
    expect(appelsA('/api/orders', 'POST')).toHaveLength(1);
    await act(async () => { terminer(); });
  });

  it('commande passée hors paiement en ligne : la remonte au parent, garde le suivi et l\'adresse', async () => {
    const { surCommandePassee } = await preparerLivraison();
    confirmer();
    await waitFor(() => expect(surCommandePassee).toHaveBeenCalledWith({ id: 'cmd-abcdef1234', numero: 'DEF1234'.padStart(8, 'C') }));
    expect(localStorage.getItem('suiviCommande:cmd-abcdef1234')).toBe('suivi-secret');
    expect(mockEnregistrerAdresse).toHaveBeenCalledWith(expect.objectContaining({ street: '12 rue du Marché', city: 'Namur', postalCode: '5000', latitude: 50.46, longitude: 4.86 }));
  });

  it('mémorise la version des conditions acceptées après une commande réussie', async () => {
    mockAcceptation.lireEtatAcceptation.mockResolvedValue({ dejaAccepte: false, versions: 'cgv-3' });
    const { surCommandePassee } = await preparerLivraison();
    await waitFor(() => expect(mockAcceptation.lireEtatAcceptation).toHaveBeenCalled());
    confirmer();
    await waitFor(() => expect(surCommandePassee).toHaveBeenCalled());
    expect(mockAcceptation.memoriserAcceptation).toHaveBeenCalledWith('cgv-3');
  });

  it('paiement en ligne : la commande attend l\'encaissement, le panier n\'est pas rendu au parent', async () => {
    reseau.commande = { statut: 201, corps: { order: { id: 'cmd-abcdef1234', paiementEnLigne: true, totalAmount: 19, tipAmount: 2 } } };
    const { surCommandePassee } = await preparerLivraison();
    confirmer();
    const stripe = await screen.findByTestId('stripe');
    expect(stripe).toHaveTextContent('cmd-abcdef1234|21');
    expect(surCommandePassee).not.toHaveBeenCalled();
    expect(screen.getByText(t('paiementEnLigne'))).toBeInTheDocument();
  });

  it('paiement refusé : la commande n\'est pas annoncée ; réussi : elle l\'est', async () => {
    reseau.commande = { statut: 201, corps: { order: { id: 'cmd-abcdef1234', paiementEnLigne: true, totalAmount: 19 } } };
    const { surCommandePassee } = await preparerLivraison();
    confirmer();
    await screen.findByTestId('stripe');
    fireEvent.click(bouton('Paiement refusé'));
    expect(surCommandePassee).not.toHaveBeenCalled();
    fireEvent.click(bouton('Paiement réussi'));
    expect(surCommandePassee).toHaveBeenCalledWith({ id: 'cmd-abcdef1234', numero: expect.stringMatching(/^[A-Z0-9-]{8}$/) });
  });

  it('espèces : un délai de repentir précède l\'envoi, rien ne part avant', async () => {
    const { surCommandePassee } = await preparerLivraison();
    fireEvent.click(screen.getByRole('radio', { name: 'Espèces' }));
    confirmer();
    expect(await screen.findByTestId('delai')).toBeInTheDocument();
    expect(appelsA('/api/orders', 'POST')).toHaveLength(0);
    fireEvent.click(bouton('Envoyer maintenant'));
    await waitFor(() => expect(surCommandePassee).toHaveBeenCalled());
    expect(appelsA('/api/orders', 'POST')).toHaveLength(1);
    expect(corpsDeLaCommande().paymentMethodId).toBe('especes');
  });

  it('espèces : « Retour » ramène à la boutique sans rien envoyer', async () => {
    await preparerLivraison();
    fireEvent.click(screen.getByRole('radio', { name: 'Espèces' }));
    confirmer();
    fireEvent.click(await screen.findByRole('button', { name: 'Retour à la boutique' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/store/zipzup');
    expect(appelsA('/api/orders', 'POST')).toHaveLength(0);
  });

  it('refus du serveur : le message de l\'API est affiché, rien n\'est annoncé au parent', async () => {
    reseau.commande = { statut: 400, corps: { error: 'Boutique fermée' } };
    const { surCommandePassee } = await preparerLivraison();
    confirmer();
    expect(await screen.findByText('Boutique fermée')).toBeInTheDocument();
    expect(surCommandePassee).not.toHaveBeenCalled();
    expect(mockEnregistrerAdresse).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });

  it('refus sans message : texte par défaut', async () => {
    reseau.commande = { statut: 500, corps: {} };
    await preparerLivraison();
    confirmer();
    expect(await screen.findByText(t('erreurCreation'))).toBeInTheDocument();
  });

  it('acceptation devenue obsolète côté serveur : la case est redemandée', async () => {
    mockAcceptation.lireEtatAcceptation.mockResolvedValue({ dejaAccepte: true, versions: 'cgv-2' });
    reseau.commande = { statut: 400, corps: { error: 'Conditions', code: 'CONDITIONS_REQUIRED' } };
    await afficher();
    coordonnees();
    adresseSaisie();
    await waitFor(() => expect(bouton(t('confirmer'))).toBeEnabled());
    confirmer();
    await waitFor(() => expect(mockAcceptation.oublierAcceptation).toHaveBeenCalled());
    expect(await screen.findByRole('checkbox', { name: new RegExp(messages.acceptationConditions.jAiLu) })).not.toBeChecked();
    expect(bouton(t('confirmer'))).toBeDisabled();
  });

  it('réseau coupé pendant l\'envoi : message de connexion, le bouton redevient actif', async () => {
    reseau.commande = () => Promise.reject(new TypeError('Failed to fetch'));
    const { surCommandePassee } = await preparerLivraison();
    confirmer();
    expect(await screen.findByText(t('erreurConnexion'))).toBeInTheDocument();
    expect(surCommandePassee).not.toHaveBeenCalled();
    expect(bouton(t('confirmer'))).toBeEnabled();
  });
});

describe('alcool et pourboire', () => {
  it('un panier avec alcool exige l\'attestation d\'âge, transmise au serveur', async () => {
    await preparerLivraison({ lignes: [{ ...salade, alcool: true }] });
    expect(bouton(t('confirmer'))).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(messages.allergenes.ageCase.slice(0, 20)) }));
    expect(bouton(t('confirmer'))).toBeEnabled();
    confirmer();
    await waitFor(() => expect(appelsA('/api/orders', 'POST')).toHaveLength(1));
    expect(corpsDeLaCommande().ageMinimumConfirme).toBe(true);
  });

  it('sans alcool, aucune attestation n\'est demandée ni envoyée', async () => {
    await preparerLivraison();
    confirmer();
    await waitFor(() => expect(appelsA('/api/orders', 'POST')).toHaveLength(1));
    expect(corpsDeLaCommande()).not.toHaveProperty('ageMinimumConfirme');
  });

  it('pourboire : proposé en livraison par un livreur de la plateforme payée en ligne, envoyé avec la commande', async () => {
    await preparerLivraison();
    fireEvent.click(await screen.findByRole('button', { name: /Pourboire 2/ }));
    confirmer();
    await waitFor(() => expect(appelsA('/api/orders', 'POST')).toHaveLength(1));
    expect(corpsDeLaCommande().tipAmount).toBe(2);
  });

  it.each([
    ['livreur du commerçant', (r) => { r.livraison = { ...r.livraison, mode: 'OWN' }; }],
    ['paiement en espèces', null],
  ])('pas de pourboire : %s', async (_nom, regler) => {
    if (regler) regler(reseau);
    await preparerLivraison();
    if (!regler) fireEvent.click(screen.getByRole('radio', { name: 'Espèces' }));
    await waitFor(() => expect(appelsA('/zone-livraison').length).toBeGreaterThan(0));
    expect(screen.queryByRole('button', { name: /Pourboire 2/ })).not.toBeInTheDocument();
  });

  it('pas de pourboire en retrait', async () => {
    await afficher();
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(t('retraitSurPlace')) }));
    expect(screen.queryByRole('button', { name: /Pourboire 2/ })).not.toBeInTheDocument();
  });
});
