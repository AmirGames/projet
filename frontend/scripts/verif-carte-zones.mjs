/**
 * La carte des zones de livraison.
 *
 * Les zones sont des anneaux autour de la boutique, et se réglaient dans un
 * champ : « 3 km ». Le commerçant ne voyait ni où était sa boutique, ni ce que
 * son rayon couvrait — il le découvrait à la première commande refusée. Et
 * quand la boutique n'avait pas de coordonnées, rien ne le lui disait ni ne lui
 * permettait d'y remédier.
 *
 * On vérifie ici qu'il pose sa boutique sur la carte, que la position part
 * vraiment au serveur, que ses anneaux sont dessinés, et que tirer la poignée
 * règle le rayon — celui qui sera enregistré.
 *
 * Le fond de carte vient d'OpenStreetMap. Les tuiles ne sont pas contrôlées
 * ici : elles appartiennent au fournisseur, et un bac à sable sans accès à
 * Internet ne doit pas faire échouer la suite. Ce qui est contrôlé, c'est ce
 * que le navigateur dessine et ce que le serveur enregistre.
 *
 * Suppose une base vierge : le premier compte inscrit devient la plateforme.
 *
 *   node scripts/verification/reinitialiser.mjs   (dans backend/)
 *   VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3001 \
 *     node scripts/verif-carte-zones.mjs
 */

import { chromium } from 'playwright';
import { inscriptionVia } from './inscription.mjs';
import { entrerEspaceCommercant } from './connexion.mjs';

const SITE = process.env.VERIF_SITE_URL || 'http://localhost:3000';
const API = process.env.VERIF_API_URL || 'http://localhost:3001';

const uniq = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const MDP = 'Password123!';

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

const boutiqueVue = async (storeId, jeton) => {
  const { donnees } = await appeler(`/api/stores/${storeId}`, { jeton });
  return donnees?.store || donnees;
};

// ===== Le décor =====

const emailCommercant = `m-${uniq}@t.fr`;

const plateforme = await inscriptionVia(appeler, {
  method: 'POST',
  corps: { email: `p-${uniq}@t.fr`, password: MDP, name: `Plateforme ${uniq}` },
});

if (!plateforme.donnees?.accessToken) {
  console.error(`Inscription impossible : ${JSON.stringify(plateforme.donnees)}`);
  console.error('La base doit être vierge : le premier compte inscrit devient la plateforme.');
  process.exit(1);
}

const commercant = await inscriptionVia(appeler, {
  method: 'POST',
  corps: { email: emailCommercant, password: MDP, name: `Commerce ${uniq}` },
});
const T = commercant.donnees.accessToken;
const orgId = commercant.donnees.organization.id;

// Sans adresse, la boutique n'est jamais située à la création : c'est le point
// de départ voulu, et il ne dépend pas d'un service d'adresses joignable.
const boutique = await appeler('/api/stores', {
  method: 'POST',
  jeton: T,
  corps: {
    orgId,
    name: `Pizzeria ${uniq}`,
    slug: `pizzeria-${uniq}`,
    phone: '0400000000',
  },
});
const storeId = boutique.donnees.store?.id || boutique.donnees.id;

const avant = await boutiqueVue(storeId, T);
check('la boutique naît sans coordonnées', avant?.latitude == null, `${avant?.latitude}`);

// ===== Le navigateur =====

const nav = await chromium.launch();
const page = await nav.newPage();

const erreurs = [];
page.on('console', (m) => {
  // Les tuiles d'OpenStreetMap sont hors du projet : un bac à sable sans accès
  // à Internet les refuse, et ce n'est pas un défaut de la page.
  const texte = m.text();
  const tuile = /tile\.openstreetmap|ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|net::ERR_/.test(texte);

  if (m.type() === 'error' && !tuile) {
    erreurs.push(`${new URL(page.url()).pathname} : ${texte.slice(0, 200)}`);
  }
});

titre('Le commerçant ouvre ses zones de livraison');
await page.goto(`${SITE}/login`);
await page.fill('input[type="email"]', emailCommercant);
await page.fill('input[type="password"]', MDP);
await page.click('button[type="submit"]');
await entrerEspaceCommercant(page);
await page.waitForTimeout(2000);

await page.goto(`${SITE}/merchant/${orgId}/delivery-zones`);
await page.waitForTimeout(5000);

const carte = page.locator('.leaflet-container');
check('une vraie carte est affichée', (await carte.count()) === 1, `n=${await carte.count()}`);

const texte = await page.locator('body').innerText();
// Le commerçant ne savait pas que sa boutique n'était pas située : rien ne le
// lui disait, et ses zones ne s'appliquaient à personne.
check('elle dit que la boutique n’est pas située', /n’est pas située|n'est pas située/.test(texte), texte.slice(0, 800));
check(
  'et prévient que rien ne s’applique',
  /aucune zone ne s’applique|aucune zone ne s'applique/.test(texte),
  texte.slice(0, 800)
);
check('aucun point de boutique n’est posé', (await page.locator('.leaflet-marker-icon').count()) === 0, 'un point existe déjà');
check(
  'un bouton propose de la situer depuis son adresse',
  (await page.locator('button:has-text("Situer depuis mon adresse")').count()) === 1,
  'bouton absent'
);

titre('Il pose sa boutique d’un clic sur la carte');
const cadre = await carte.boundingBox();
await page.mouse.click(cadre.x + cadre.width / 2, cadre.y + cadre.height / 2);
await page.waitForTimeout(2500);

const posee = await boutiqueVue(storeId, T);
check('le serveur a enregistré une latitude', posee?.latitude != null, `${posee?.latitude}`);
check('et une longitude', posee?.longitude != null, `${posee?.longitude}`);

const apresPose = await page.locator('body').innerText();
check('la page le confirme', /Position de la boutique enregistrée/.test(apresPose), apresPose.slice(0, 900));
check('un point apparaît sur la carte', (await page.locator('.leaflet-marker-icon').count()) >= 1, 'aucun point');

await page.reload();
await page.waitForTimeout(5000);
const rechargee = await page.locator('body').innerText();
check(
  'l’avertissement a disparu',
  !/n’est pas située|n'est pas située/.test(rechargee),
  rechargee.slice(0, 800)
);

titre('Il règle un rayon en le voyant');
await page.click('button:has-text("Ajouter Zone")');
await page.waitForTimeout(800);
await page.fill('#zone-nom', 'Centre');
await page.fill('#zone-frais', '2.50');
await page.fill('#zone-rayon', '2');
await page.waitForTimeout(1500);

const anneaux = await page.locator('.leaflet-overlay-pane path').count();
// Le rayon n'était qu'un nombre dans un champ : rien ne le montrait.
check('l’anneau de la zone est dessiné', anneaux >= 1, `n=${anneaux}`);

const poignee = page.locator('.leaflet-marker-icon[title*="rayon"]');
check('une poignée permet de le tirer', (await poignee.count()) === 1, `n=${await poignee.count()}`);

const avantTirage = await page.inputValue('#zone-rayon');

await carte.scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
const positionPoignee = await poignee.boundingBox();

await page.mouse.move(
  positionPoignee.x + positionPoignee.width / 2,
  positionPoignee.y + positionPoignee.height / 2
);
await page.mouse.down();
// Vers l'est, en deux temps : Leaflet suit le déplacement, pas le saut.
await page.mouse.move(positionPoignee.x + 60, positionPoignee.y + positionPoignee.height / 2, { steps: 10 });
await page.mouse.move(positionPoignee.x + 120, positionPoignee.y + positionPoignee.height / 2, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(1200);

const apresTirage = await page.inputValue('#zone-rayon');
check('tirer la poignée change le rayon', apresTirage !== avantTirage, `${avantTirage} → ${apresTirage}`);
check('et l’agrandit', parseFloat(apresTirage) > parseFloat(avantTirage), `${avantTirage} → ${apresTirage}`);

titre('Le rayon tiré est celui qui est enregistré');
await page.click('button:has-text("Créer")');
await page.waitForTimeout(3000);

const zones = await appeler(`/api/delivery-zones?storeId=${storeId}`, { jeton: T });
const enregistree = (zones.donnees?.zones || [])[0];
check('la zone est créée', !!enregistree, JSON.stringify(zones.donnees)?.slice(0, 200));
check(
  'avec le rayon montré à l’écran',
  Math.abs(Number(enregistree?.radiusKm) - parseFloat(apresTirage)) < 0.011,
  `${enregistree?.radiusKm} ≠ ${apresTirage}`
);

titre('Une deuxième zone s’ajoute au dessin');
await page.click('button:has-text("Ajouter Zone")');
await page.waitForTimeout(800);
await page.fill('#zone-nom', 'Large');
await page.fill('#zone-frais', '4.50');
await page.fill('#zone-rayon', '8');
await page.waitForTimeout(1200);
await page.click('button:has-text("Créer")');
await page.waitForTimeout(3000);

const deuxAnneaux = await page.locator('.leaflet-overlay-pane path').count();
check('les deux anneaux sont dessinés', deuxAnneaux >= 2, `n=${deuxAnneaux}`);

titre('Une fois située, la boutique ne bouge plus');
// Le point se pose une fois, quand l'adresse n'a pas pu être située ; ensuite
// il suit l'adresse du commerce. Le déplacer changerait en silence la portée
// de toutes les zones : cela passe par l'adresse, dans les réglages.
const point = page.locator('.leaflet-marker-icon[title*="boutique"]');
check('le point de la boutique est affiché', (await point.count()) === 1, `n=${await point.count()}`);
check(
  'il n’est plus déplaçable',
  !(await point.evaluate((el) => el.classList.contains('leaflet-marker-draggable'))),
  'encore déplaçable'
);
check(
  'la page dit que la position suit l’adresse',
  /Position fixée d'après l'adresse|Position fixée d’après l’adresse/.test(await page.locator('body').innerText()),
  'message absent'
);

const avantDeplacement = await boutiqueVue(storeId, T);

// La page s'est allongée en créant les zones : sans cela, la carte se retrouve
// hors de l'écran et la souris tire dans le vide.
await carte.scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
const positionPoint = await point.boundingBox();

// Un point fixe qu'on tire fait défiler la carte entière : il bouge à l'écran
// avec elle. Ce qui compte, c'est sa place sur la carte — mesurée par
// rapport au calque des tuiles, qui défile avec lui.
const placeSurLaCarte = () =>
  point.evaluate((el) => {
    const calque = el.closest('.leaflet-map-pane').querySelector('.leaflet-tile-pane, .leaflet-overlay-pane');
    const a = el.getBoundingClientRect();
    const b = calque.getBoundingClientRect();
    return { x: Math.round(a.left - b.left), y: Math.round(a.top - b.top) };
  });
const placeAvant = await placeSurLaCarte();

await page.mouse.move(
  positionPoint.x + positionPoint.width / 2,
  positionPoint.y + positionPoint.height / 2
);
await page.mouse.down();
await page.mouse.move(positionPoint.x + 40, positionPoint.y - 40, { steps: 10 });
await page.mouse.move(positionPoint.x + 80, positionPoint.y - 80, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(2500);

const placeApres = await placeSurLaCarte();
check(
  'le glisser ne le déplace pas sur la carte',
  Math.abs(placeApres.x - placeAvant.x) < 2 && Math.abs(placeApres.y - placeAvant.y) < 2,
  `${placeAvant.x},${placeAvant.y} → ${placeApres.x},${placeApres.y}`
);

const apresDeplacement = await boutiqueVue(storeId, T);
check(
  'ni en base',
  Number(apresDeplacement?.latitude) === Number(avantDeplacement?.latitude) &&
    Number(apresDeplacement?.longitude) === Number(avantDeplacement?.longitude),
  `${avantDeplacement?.latitude},${avantDeplacement?.longitude} → ${apresDeplacement?.latitude},${apresDeplacement?.longitude}`
);

titre('La boutique du voisin reste hors de portée');
// La carte écrit dans la boutique : le cloisonnement doit tenir là aussi.
const voisin = await inscriptionVia(appeler, {
  method: 'POST',
  corps: { email: `v-${uniq}@t.fr`, password: MDP, name: `Voisin ${uniq}` },
});
const intrusion = await appeler(`/api/stores/${storeId}`, {
  method: 'PUT',
  jeton: voisin.donnees.accessToken,
  corps: { latitude: 0, longitude: 0 },
});
check('un autre commerçant ne la déplace pas', intrusion.statut === 403, `statut ${intrusion.statut}`);

const intacte = await boutiqueVue(storeId, T);
check('et la position n’a pas bougé', Number(intacte?.latitude) === Number(apresDeplacement?.latitude), `${intacte?.latitude}`);

titre('Rien n’a cassé en chemin');
check('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));

await nav.close();

console.log(`\n=== ${ok} réussites, ${echecs.length} échecs ===`);

if (echecs.length) {
  console.log(echecs.map((nom) => `  - ${nom}`).join('\n'));
  process.exit(1);
}
