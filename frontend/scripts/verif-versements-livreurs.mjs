/**
 * Les versements aux livreurs, des deux côtés de l'écran.
 *
 * Côté livreur : ce qui lui est dû, ce qui attend le virement, ce qui est
 * arrivé — trois montants là où il n'y avait qu'un « total gagné » muet. Côté
 * plateforme : l'écran qui n'existait pas, où l'on arrête les relevés d'une
 * période puis on les marque versés.
 *
 * Suppose une base vierge : le premier compte inscrit devient la plateforme.
 *
 *   node scripts/verification/reinitialiser.mjs   (dans backend/)
 *   VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3001 \
 *     node scripts/verif-versements-livreurs.mjs
 */

import { chromium } from 'playwright';
import { validerLivreur, codeDeRemise } from './outils-livreur.mjs';
import { inscriptionVia } from './inscription.mjs';

const SITE = process.env.VERIF_SITE_URL || 'http://localhost:3000';
const API = process.env.VERIF_API_URL || 'http://localhost:3001';

const uniq = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const MDP = 'Password123!';
const POSITION = { latitude: 45.764, longitude: 4.8357 };

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
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.jeton ? { Authorization: `Bearer ${options.jeton}` } : {}),
    },
    ...(options.corps ? { body: JSON.stringify(options.corps) } : {}),
  });

  return { statut: reponse.status, donnees: await reponse.json().catch(() => null) };
};

// ===== Le décor =====

const emailPlateforme = `p-${uniq}@t.fr`;
const emailLivreur = `livreur-${uniq}@t.fr`;

const plateforme = await inscriptionVia(appeler, {
  method: 'POST',
  corps: { email: emailPlateforme, password: MDP, name: `Plateforme ${uniq}` },
});

const TP = plateforme.donnees?.accessToken;

if (!TP) {
  console.error(`Inscription de la plateforme impossible : ${JSON.stringify(plateforme.donnees)}`);
  process.exit(1);
}

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
    name: `Sushi ${uniq}`,
    slug: `sushi-${uniq}`,
    address: '1 place Bellecour',
    city: 'Lyon',
    postalCode: '69002',
    phone: '0400000000',
    ...POSITION,
  },
});
const storeId = boutique.donnees.store?.id || boutique.donnees.id;

const produit = await appeler('/api/products', {
  method: 'POST',
  jeton: T,
  corps: { storeId, name: 'California', price: 14, status: 'ACTIVE' },
});
const productId = produit.donnees.product?.id || produit.donnees.id;

const inscription = await appeler('/api/drivers/register', {
  method: 'POST',
  corps: {
    name: `Karim ${uniq}`,
    email: emailLivreur,
    password: MDP,
    phone: '0611111111',
    vehicleType: 'scooter',
    vehiclePlate: 'AB-123-CD',
  },
});
const D = inscription.donnees.accessToken;

await validerLivreur(API, D, TP);
await appeler('/api/drivers/availability', { method: 'PATCH', jeton: D, corps: { isOnline: true } });
await appeler('/api/drivers/location', { method: 'PATCH', jeton: D, corps: POSITION });

/** Une commande menée jusqu'à la livraison : une course à payer. */
async function courseLivree() {
  const commande = await appeler('/api/orders', {
    method: 'POST',
    corps: {
      storeId,
      customerName: `Client ${uniq}`,
      customerEmail: `c-${uniq}@t.fr`,
      customerPhone: '0600000000',
      deliveryType: 'DELIVERY',
      deliveryAddress: '12 avenue Thiers',
      deliveryCity: 'Lyon',
      deliveryLat: 45.78,
      deliveryLng: 4.86,
      totalAmount: 14,
      feesAmount: 3,
      items: [{ productId, quantity: 1, price: 14 }],
    },
  });

  const orderId = commande.donnees.order?.id || commande.donnees.id;
  const attribution = await appeler(`/api/orders/${orderId}/dispatch`, { method: 'POST', jeton: T });
  const courseId = attribution.donnees?.data?.deliveryId;

  await appeler(`/api/drivers/deliveries/${courseId}/accept`, { method: 'PATCH', jeton: D });
  await appeler(`/api/drivers/deliveries/${courseId}`, {
    method: 'PATCH',
    jeton: D,
    corps: { status: 'PICKED_UP' },
  });
  await appeler(`/api/drivers/deliveries/${courseId}`, {
    method: 'PATCH',
    jeton: D,
    corps: { status: 'DELIVERED', code: await codeDeRemise(API, orderId) },
  });
}

await courseLivree();
await courseLivree();

// ===== Le navigateur =====

const nav = await chromium.launch();
const contexte = await nav.newContext();

const page = await contexte.newPage();
const erreurs = [];
page.on('console', (m) => {
  if (m.type() === 'error') erreurs.push(`${new URL(page.url()).pathname} : ${m.text()}`);
});

// ===== Côté livreur : ce qui est dû =====

titre('Le livreur voit ce qu’on lui doit');
await page.goto(`${SITE}/driver/login`);
await page.fill('input[type="email"]', emailLivreur);
await page.fill('input[type="password"]', MDP);
await page.click('button[type="submit"]');
await page.waitForURL('**/driver', { timeout: 15000 });
// Laisser le tableau de bord finir ses appels avant de le quitter : une
// navigation qui part trop tôt annule les requêtes en vol, et le
// « Failed to fetch » qui en résulte ressemble à une panne de la page.
await page.waitForTimeout(2500);

await page.goto(`${SITE}/driver/earnings`);
await page.waitForTimeout(2500);

const revenus = await page.locator('body').innerText();
// Un seul « total gagné » ne disait pas si l'argent était arrivé.
check('le dû non arrêté est affiché', /Pas encore arrêté/.test(revenus), revenus.slice(0, 700));
check('l’attente de versement aussi', /En attente de versement/.test(revenus), revenus.slice(0, 700));
check('et ce qui a été versé', /Déjà versé/.test(revenus), revenus.slice(0, 700));
check('le nombre de courses dues est dit', /2 courses livrées/.test(revenus), revenus.slice(0, 900));
check('aucun relevé pour l’instant', /Aucun relevé pour le moment/.test(revenus), revenus.slice(0, 900));

const situation = await appeler('/api/drivers/payouts', { jeton: D });
check('le serveur confirme deux courses dues', situation.donnees?.data?.coursesDues === 2, `${situation.donnees?.data?.coursesDues}`);

const duInitial = situation.donnees.data.duNonArrete;
check('avec un montant', duInitial > 0, `${duInitial}`);

// ===== Côté plateforme : l'arrêté =====

titre('La plateforme ouvre les versements');
// Son propre contexte : deux pages du même contexte partagent le
// `localStorage`, donc le jeton. La connexion de la plateforme écrasait celui
// du livreur, et l'espace livreur repartait ensuite avec le mauvais compte.
const contextePlateforme = await nav.newContext();
const pagePlateforme = await contextePlateforme.newPage();
const erreursPlateforme = [];
pagePlateforme.on('console', (m) => {
  if (m.type() === 'error') erreursPlateforme.push(m.text());
});

await pagePlateforme.goto(`${SITE}/login`);
await pagePlateforme.fill('input[type="email"]', emailPlateforme);
await pagePlateforme.fill('input[type="password"]', MDP);
await pagePlateforme.click('button[type="submit"]');
await pagePlateforme.waitForURL('**/superowner**', { timeout: 15000 });
await pagePlateforme.waitForTimeout(1500);

const menu = await pagePlateforme.locator('aside').innerText();
check('« Versements » figure au menu', menu.includes('Versements'), menu.slice(0, 500));

await pagePlateforme.click('aside a:has-text("Versements")');
await pagePlateforme.waitForURL('**/superowner/payouts', { timeout: 15000 });
await pagePlateforme.waitForTimeout(2500);

const vue = await pagePlateforme.locator('main').innerText();
check('le reste à devoir est chiffré', /Reste à devoir/.test(vue), vue.slice(0, 700));
check('le nombre de courses non payées aussi', /Courses non payées/.test(vue), vue.slice(0, 700));
check('et le nombre de livreurs concernés', /Livreurs concernés/.test(vue), vue.slice(0, 700));
check('aucun relevé encore', /Aucun relevé dans cet état/.test(vue), vue.slice(0, 900));

titre('Une période est proposée d’avance');
const debut = await pagePlateforme.locator('#periode-debut').inputValue();
const fin = await pagePlateforme.locator('#periode-fin').inputValue();
check('la borne de début est pré-remplie', /^\d{4}-\d{2}-\d{2}$/.test(debut), debut);
check('la borne de fin aussi', /^\d{4}-\d{2}-\d{2}$/.test(fin), fin);
check('et le début précède la fin', debut < fin, `${debut} → ${fin}`);

titre('Elle arrête le relevé de la période');
// Les courses viennent d'être livrées : la semaine proposée est déjà close, on
// élargit jusqu'à demain pour les prendre.
const demain = new Date(Date.now() + 86400000);
const champFin = `${demain.getFullYear()}-${String(demain.getMonth() + 1).padStart(2, '0')}-${String(
  demain.getDate()
).padStart(2, '0')}`;

await pagePlateforme.fill('#periode-fin', champFin);
await pagePlateforme.click('button:has-text("Arrêter les relevés")');
await pagePlateforme.waitForTimeout(3000);

const apresArrete = await pagePlateforme.locator('main').innerText();
check('un relevé est annoncé arrêté', /1 relevé arrêté/.test(apresArrete), apresArrete.slice(0, 600));
check('le livreur y figure', apresArrete.includes(`Karim ${uniq}`), apresArrete.slice(0, 900));
check('avec son nombre de courses', /2 courses/.test(apresArrete), apresArrete.slice(0, 900));
check('et l’état « à verser »', /À verser/.test(apresArrete), apresArrete.slice(0, 900));

titre('Le livreur voit son relevé arrêté');
await page.reload();
await page.waitForTimeout(2500);

const cotéLivreur = await page.locator('body').innerText();
check('un relevé apparaît', !/Aucun relevé pour le moment/.test(cotéLivreur), cotéLivreur.slice(0, 900));
check('il attend le versement', /En attente de versement/.test(cotéLivreur), cotéLivreur.slice(0, 900));

const apresArreteApi = await appeler('/api/drivers/payouts', { jeton: D });
check('plus rien n’est dû', apresArreteApi.donnees?.data?.duNonArrete === 0, `${apresArreteApi.donnees?.data?.duNonArrete}`);
check(
  'le montant arrêté est celui qui était dû',
  Math.abs(apresArreteApi.donnees.data.enAttenteDeVersement - duInitial) < 0.01,
  `${apresArreteApi.donnees.data.enAttenteDeVersement} vs ${duInitial}`
);

titre('Un second arrêté ne reprend rien');
// C'est l'invariant : une course déjà portée par un relevé n'est jamais payée
// deux fois.
await pagePlateforme.fill('#periode-fin', champFin);
await pagePlateforme.click('button:has-text("Arrêter les relevés")');
await pagePlateforme.waitForTimeout(3000);

const second = await pagePlateforme.locator('main').innerText();
check('rien de nouveau n’est arrêté', /Aucune course à payer/.test(second), second.slice(0, 600));

const toujours = await appeler('/api/superowner/payouts?status=PENDING', { jeton: TP });
check('un seul relevé en attente', (toujours.donnees?.payouts || []).length === 1, `${(toujours.donnees?.payouts || []).length}`);

// ===== Le versement =====

titre('Elle marque le relevé versé');
await pagePlateforme.click('button:has-text("Marquer versé")');
await pagePlateforme.waitForTimeout(1200);

await pagePlateforme.fill('input[id^="reference-"]', `VIR-${uniq}`);
await pagePlateforme.click('button:has-text("Confirmer le versement")');
await pagePlateforme.waitForTimeout(3000);

const verse = await appeler('/api/superowner/payouts?status=PAID', { jeton: TP });
const paye = (verse.donnees?.payouts || []).find((p) => p.driverEmail === emailLivreur);
check('le relevé est versé', paye !== undefined, JSON.stringify((verse.donnees?.payouts || []).map((p) => p.status)));
check('la référence est gardée', paye?.reference === `VIR-${uniq}`, paye?.reference);
check('le moyen est dit en français', paye?.methodLibelle === 'Virement bancaire', paye?.methodLibelle);

titre('Le livreur le voit sur son écran');
await page.reload();
await page.waitForTimeout(2500);

const cotéLivreurVerse = await page.locator('body').innerText();
check('le relevé est marqué versé', /Versé le/.test(cotéLivreurVerse), cotéLivreurVerse.slice(0, 1000));
check('avec le moyen', /Virement bancaire/.test(cotéLivreurVerse), cotéLivreurVerse.slice(0, 1000));
check('et la référence', cotéLivreurVerse.includes(`VIR-${uniq}`), cotéLivreurVerse.slice(0, 1000));

const situationFinale = await appeler('/api/drivers/payouts', { jeton: D });
check('le montant est passé en versé', situationFinale.donnees?.data?.verse > 0, `${situationFinale.donnees?.data?.verse}`);
check('et a quitté l’attente', situationFinale.donnees?.data?.enAttenteDeVersement === 0, `${situationFinale.donnees?.data?.enAttenteDeVersement}`);

titre('Le relevé versé ne propose plus de versement');
await pagePlateforme.click('button:has-text("Versés")');
await pagePlateforme.waitForTimeout(2500);

const listeVerses = await pagePlateforme.locator('main').innerText();
check('il figure parmi les versés', listeVerses.includes(`Karim ${uniq}`), listeVerses.slice(0, 900));
check(
  'et n’offre plus de le marquer versé',
  (await pagePlateforme.locator('button:has-text("Marquer versé")').count()) === 0,
  'bouton encore présent'
);

titre('Rien n’a cassé en chemin');
check('aucune erreur JavaScript côté livreur', erreurs.length === 0, erreurs.join(' | '));
check('aucune erreur JavaScript côté plateforme', erreursPlateforme.length === 0, erreursPlateforme.join(' | '));

await nav.close();

console.log(`\n=== ${ok} réussites, ${echecs.length} échecs ===`);

if (echecs.length) {
  console.log(echecs.map((nom) => `  - ${nom}`).join('\n'));
  process.exit(1);
}
