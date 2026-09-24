/**
 * Commander sans compte, dans un vrai navigateur.
 *
 * La page atteinte depuis la fiche d'un commerce — « Passer la commande » —
 * était une maquette : un identifiant de boutique écrit en dur, un menu
 * « Livraison » sans aucun champ d'adresse, et une commande envoyée sans
 * adresse, sans frais de zone et sans le détail du panier.
 *
 * On vérifie ici qu'un invité peut saisir son adresse, voir sa zone, et que la
 * commande arrive en base chez le bon commerce, avec son adresse.
 *
 * Demande un faux service d'adresses, sans quoi l'adresse écrite à la main ne
 * peut pas être située :
 *
 *   node ../backend/scripts/verification/faux-service-adresses.mjs &
 *   ADDRESS_API_URL=http://127.0.0.1:4599/ban  (côté API)
 *
 *   VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3001 \
 *     node scripts/verif-commande-invite.mjs
 */

import { chromium } from 'playwright';
import { inscriptionVia, ouvrirToutLeJour } from './inscription.mjs';

const SITE = process.env.VERIF_SITE_URL || 'http://localhost:3000';
const API = process.env.VERIF_API_URL || 'http://localhost:3001';

let ok = 0;
const echecs = [];

const check = (nom, condition, detail = '') => {
  if (condition) {
    ok++;
    console.log(`  OK    ${nom}`);
  } else {
    echecs.push(nom);
    console.log(`  ECHEC ${nom}${detail ? ` — ${detail}` : ''}`);
  }
};

const titre = (texte) => console.log(`\n[${texte}]`);

const appeler = async (chemin, options = {}) => {
  const reponse = await fetch(API + chemin, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.jeton ? { Authorization: `Bearer ${options.jeton}` } : {}),
    },
    ...(options.corps ? { body: JSON.stringify(options.corps) } : {}),
  });

  return { statut: reponse.status, donnees: await reponse.json().catch(() => null) };
};

const uniq = Date.now().toString(36);
// La vitrine se visite par son adresse lisible : c'est la seule qui reste.
const slug = `trattoria-${uniq}`;
const MDP = 'Password123!';

// Le faux service d'adresses situe tout à ce point : la boutique est posée
// dessus, l'adresse tapée tombe donc dans le premier anneau.
const BOUTIQUE = { latitude: 45.764, longitude: 4.8357 };

// ===== Le décor =====

await inscriptionVia(appeler, {
  method: 'POST',
  corps: { email: `p-${uniq}@t.fr`, password: MDP, name: `P ${uniq}` },
});

const commercant = await inscriptionVia(appeler, {
  method: 'POST',
  corps: { email: `m-${uniq}@t.fr`, password: MDP, name: `M ${uniq}` },
});
const T = commercant.donnees.accessToken;

const boutique = await appeler('/api/stores', {
  method: 'POST',
  jeton: T,
  corps: {
    orgId: commercant.donnees.organization.id,
    name: `Trattoria ${uniq}`,
    slug,
    address: '1 place Bellecour',
    city: 'Lyon',
    postalCode: '69002',
    phone: '0400000000',
    ...BOUTIQUE,
  },
});
const storeId = boutique.donnees.store?.id || boutique.donnees.id;
await ouvrirToutLeJour(appeler, storeId, T);

// Les zones sont celles d'un commerçant qui livre lui-même : avec les livreurs
// de la plateforme, les frais suivent la distance et aucune zone n'est dite.
await appeler(`/api/store-settings/${storeId}`, {
  method: 'PUT',
  jeton: T,
  corps: { delivery: { useOwnDelivery: true } },
});

const plat = `Lasagnes ${uniq}`;
await appeler('/api/products', {
  method: 'POST',
  jeton: T,
  corps: { storeId, name: plat, price: 14, status: 'ACTIVE' },
});

await appeler('/api/delivery-zones', {
  method: 'POST',
  jeton: T,
  corps: { storeId, name: 'Centre', radiusKm: 3, baseFee: 2.5, minOrder: 12, deliveryMinutes: 25 },
});

// ===== Le navigateur =====

const nav = await chromium.launch();
const page = await nav.newPage();
const erreurs = [];
page.on('console', (m) => {
  if (m.type() === 'error') erreurs.push(`${new URL(page.url()).pathname} : ${m.text()}`);
});

const texte = () => page.locator('body').innerText();

titre('Un invité compose son panier');
await page.goto(`${SITE}/store/${slug}`);
await page.waitForTimeout(3500);

const fiche = await texte();
check('la fiche du commerce s’ouvre', fiche.includes(plat), fiche.slice(0, 300));

await page.locator(`button[aria-label="Ajouter ${plat} au panier"]`).first().click();
await page.waitForTimeout(600);

// Le panier de la vitrine est un panneau replié : la deuxième unité s'ajoute
// depuis ses lignes, encore faut-il les avoir sous les yeux.
await page.locator('button', { hasText: 'Panier' }).first().click();
await page.waitForTimeout(1000);

await page.locator(`button[aria-label="Ajouter un ${plat}"]`).first().click();
await page.waitForTimeout(600);

// La vitrine commande son propre panier sur place ; la page /checkout, elle,
// reprend un panier par son adresse — c'est ce qu'on vérifie ici, et c'est le
// chemin qu'emprunte le rappel « un panier vous attend ailleurs ».
await page.goto(`${SITE}/checkout?boutique=${storeId}`);
await page.waitForTimeout(3000);

titre('La page de commande sait de quel commerce il s’agit');
check(
  'elle porte la boutique dans son adresse',
  page.url().includes(`boutique=${storeId}`),
  page.url()
);

const commande = await texte();
check('le nom du commerce est rappelé', commande.includes(`Trattoria ${uniq}`), commande.slice(0, 400));
check('le panier est celui composé', commande.includes(plat), commande.slice(0, 400));
check('les deux articles sont comptés', /28,00/.test(commande), commande.slice(0, 600));

titre('Le champ d’adresse existe — c’est tout le sujet');
check(
  'la livraison est proposée',
  (await page.locator('input[value="DELIVERY"]').count()) === 1,
  'choix absent'
);
check('le champ adresse est là', (await page.locator('#livraison-adresse').count()) === 1, 'absent');
check('le champ ville est là', (await page.locator('#livraison-ville').count()) === 1, 'absent');
check(
  'le code postal est demandé',
  (await page.locator('#livraison-code-postal').count()) === 1,
  'absent'
);

titre('Il saisit son adresse à la main');
await page.locator('#client-nom').fill(`Invité ${uniq}`);
await page.locator('#client-email').fill(`invite-${uniq}@t.fr`);
await page.locator('#client-telephone').fill('0600000000');
await page.locator('#livraison-adresse').fill('20 Rue de la République');
await page.locator('#livraison-ville').fill('Lyon');
await page.locator('#livraison-code-postal').fill('69002');
await page.waitForTimeout(3000);

const zone = await texte();
check('sa zone lui est annoncée', /Zone « Centre »/.test(zone), zone.slice(0, 900));
check('avec ses frais', /2,50/.test(zone), zone.slice(0, 900));
check('et la durée annoncée', /25 min/.test(zone), zone.slice(0, 900));

const bouton = page.locator('button', { hasText: /Confirmer la Commande/ });
check('la commande est validable', !(await bouton.first().isDisabled()), 'bloquée à tort');

titre('Il confirme');
await bouton.first().click();
await page.waitForTimeout(3500);

const apres = await texte();
check('la commande est confirmée', /Commande confirmée/i.test(apres), apres.slice(0, 500));
check('un numéro lui est donné', /#[0-9A-Z]{8}/.test(apres), apres.slice(0, 500));
check('un lien de suivi est proposé', /Suivre ma commande/.test(apres), apres.slice(0, 500));

titre('Ce que le serveur a réellement enregistré');
// Le lien de suivi porte l'identifiant complet : c'est par lui qu'un invité
// retrouve sa commande, et par lui qu'on la relit ici.
const lienDeSuivi = await page
  .locator('a', { hasText: 'Suivre ma commande' })
  .first()
  .getAttribute('href');
const id = (lienDeSuivi || '').split('commande=')[1] || '';

const relue = (await appeler(`/api/orders/${id}`)).donnees;

check('la commande est chez le bon commerce', relue?.storeId === storeId, `${relue?.storeId}`);
check('elle est en livraison', relue?.deliveryType === 'DELIVERY', relue?.deliveryType);
check(
  'l’adresse est enregistrée',
  relue?.deliveryAddress === '20 Rue de la République',
  relue?.deliveryAddress
);
check('la ville aussi', relue?.deliveryCity === 'Lyon', relue?.deliveryCity);
check('le code postal aussi', relue?.deliveryPostal === '69002', relue?.deliveryPostal);
check('les frais viennent de la zone', Number(relue?.feesAmount) === 2.5, `${relue?.feesAmount}`);
check(
  'le total tient les deux plats et la livraison',
  Number(relue?.totalAmount) === 30.5,
  `${relue?.totalAmount}`
);

// Le détail manquait entièrement : la commande n'était qu'un montant, et la
// cuisine ne savait pas quoi préparer.
check('le détail du panier est enregistré', (relue?.items || []).length === 1, JSON.stringify(relue?.items));
check('avec la bonne quantité', relue?.items?.[0]?.quantity === 2, `${relue?.items?.[0]?.quantity}`);

titre('Le suivi est accessible sans compte');
await page.locator('a', { hasText: 'Suivre ma commande' }).first().click();
await page.waitForTimeout(3000);

const suivi = await texte();
check('la commande est retrouvée', suivi.includes('20 Rue de la République'), suivi.slice(0, 600));
check('son état est affiché', /En Attente/i.test(suivi), suivi.slice(0, 600));

titre('Le panier a été vidé');
const restant = await page.evaluate(() => localStorage.getItem('zupone-paniers'));
check('plus de panier pour ce commerce', !(restant || '').includes(storeId), restant || 'vide');

const vraiesErreurs = erreurs.filter(
  (e) => !/favicon|Failed to load resource|404|403|RSC payload|Auth refresh|adresse/i.test(e)
);
check('aucune erreur JavaScript', vraiesErreurs.length === 0, vraiesErreurs.slice(0, 2).join(' | '));

await nav.close();

console.log(`\n=== ${ok} réussites, ${echecs.length} échecs ===`);
if (echecs.length > 0) console.log(echecs.map((nom) => `  - ${nom}`).join('\n'));

process.exit(echecs.length === 0 ? 0 : 1);
