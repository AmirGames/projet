/**
 * La fiche d'une boutique, côté plateforme.
 *
 * La liste des boutiques était un cul-de-sac : des noms et des compteurs, rien
 * à ouvrir. On vérifie ici qu'elle mène à une fiche, que la plateforme y
 * corrige la courte liste de champs dont elle répond, et que le commercial —
 * nom, prix, horaires — n'y est qu'en lecture.
 *
 * Suppose une base vierge : le premier compte inscrit devient la plateforme.
 *
 *   node scripts/verification/reinitialiser.mjs   (dans backend/)
 *   VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3001 \
 *     node scripts/verif-fiche-boutique.mjs
 */

import { chromium } from 'playwright';
import { inscriptionVia } from './inscription.mjs';

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

// ===== Le décor =====

const emailPlateforme = `p-${uniq}@t.fr`;

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

const nomBoutique = `Trattoria ${uniq}`;
const slug = `trattoria-${uniq}`;

// Sans adresse, la boutique n'est jamais située à la création : c'est le point
// de départ voulu pour vérifier l'avertissement, et il ne dépend pas d'un
// service d'adresses joignable. Une adresse aurait été géocodée d'office.
const boutique = await appeler('/api/stores', {
  method: 'POST',
  jeton: T,
  corps: {
    orgId: commercant.donnees.organization.id,
    name: nomBoutique,
    slug,
    phone: '0400000000',
  },
});
const storeId = boutique.donnees.store?.id || boutique.donnees.id;

await appeler('/api/products', {
  method: 'POST',
  jeton: T,
  corps: { storeId, name: `Lasagnes ${uniq}`, price: 14, status: 'ACTIVE' },
});

// ===== Le navigateur =====

const nav = await chromium.launch();
const contexte = await nav.newContext();
const page = await contexte.newPage();

const erreurs = [];
page.on('console', (m) => {
  // Le script tente exprès une adresse publique déjà prise : le 400 qui en
  // résulte est ce qu'on vérifie, pas un défaut de la page. Les tuiles de la
  // carte viennent d'OpenStreetMap : hors du projet, et refusées dans un bac à
  // sable sans accès à Internet.
  if (m.type() === 'error' && !/400|tile\.openstreetmap|net::ERR_/.test(m.text())) {
    erreurs.push(`${new URL(page.url()).pathname} : ${m.text()}`);
  }
});

const texte = () => page.locator('main').innerText();

titre('La plateforme ouvre la liste des boutiques');
await page.goto(`${SITE}/login`);
await page.fill('input[type="email"]', emailPlateforme);
await page.fill('input[type="password"]', MDP);
await page.click('button[type="submit"]');
await page.waitForURL('**/superowner**', { timeout: 15000 });
await page.waitForTimeout(1500);

await page.click('aside a:has-text("Boutiques")');
await page.waitForURL('**/superowner/stores', { timeout: 15000 });
await page.waitForTimeout(2500);

const liste = await texte();
check('la boutique est listée', liste.includes(nomBoutique), liste.slice(0, 500));

titre('Son nom ouvre sa fiche');
// La liste ne menait nulle part : ni fiche, ni détail.
await page.click(`a:has-text("${nomBoutique}")`);
await page.waitForURL(`**/superowner/stores/${storeId}`, { timeout: 15000 });
await page.waitForTimeout(2500);

const fiche = await texte();
check('la fiche porte le nom du commerce', fiche.includes(nomBoutique), fiche.slice(0, 400));
check('son commerçant est nommé', fiche.includes(`M ${uniq}`), fiche.slice(0, 500));
check('son activité est chiffrée', /Produits/.test(fiche) && /Commandes/.test(fiche), fiche.slice(0, 900));
check('son adresse publique est rappelée', fiche.includes(`/store/${slug}`), fiche.slice(0, 900));
check('le compte à contacter est donné', fiche.includes(`m-${uniq}@t.fr`), fiche.slice(0, 1200));

titre('Une boutique sans coordonnées est signalée');
// Sans elles, aucun livreur ne lui est proposé et ses zones ne s'appliquent
// pas : c'est le premier point à regarder en support.
check('l’avertissement est affiché', /n’est pas située|n'est pas située/.test(fiche), fiche.slice(0, 900));

titre('La livraison est en lecture seule');
check(
  'il est dit que le commerçant la règle',
  /la plateforme ne le modifie pas/i.test(fiche),
  fiche.slice(0, 1400)
);

// ===== La correction =====

titre('Elle corrige le téléphone');
await page.click('button:has-text("Corriger")');
await page.waitForTimeout(800);

check('le champ du nom est absent du formulaire', (await page.locator('#champ-name').count()) === 0, 'présent à tort');
check('celui des horaires aussi', (await page.locator('#champ-operatingHours').count()) === 0, 'présent à tort');
check('mais le téléphone est là', (await page.locator('#champ-phone').count()) === 1, 'absent');
check('et l’adresse publique', (await page.locator('#champ-slug').count()) === 1, 'absent');

const formulaire = await texte();
check(
  'la limite est annoncée',
  /appartiennent au commerçant/i.test(formulaire),
  formulaire.slice(0, 900)
);

await page.fill('#champ-phone', '0478123456');
await page.click('button:has-text("Enregistrer la correction")');
await page.waitForTimeout(3000);

const apres = await texte();
check('la correction est confirmée', /corrigé/i.test(apres), apres.slice(0, 600));
check('et affichée sur la fiche', apres.includes('0478123456'), apres.slice(0, 900));

const vuServeur = await appeler(`/api/superowner/stores/${storeId}`, { jeton: TP });
check('le serveur l’a bien enregistrée', vuServeur.donnees?.store?.phone === '0478123456', vuServeur.donnees?.store?.phone);

titre('Poser la boutique sur la carte la situe');
/**
 * Une adresse que le service ne sait pas situer laissait le support sans
 * recours : il fallait trouver des coordonnées ailleurs et les recopier.
 *
 * Le géocodage automatique à la correction d'adresse est vérifié côté API
 * (`verif-fiche-boutique.mjs`, sur le faux fournisseur) : ici, c'est le geste
 * de secours qu'on contrôle, et il ne dépend d'aucun service extérieur.
 */
await page.click('button:has-text("Corriger")');
await page.waitForTimeout(1200);
await page.fill('#champ-address', '20 Rue de la République');

const carte = page.locator('.leaflet-container');
check('une carte est proposée', (await carte.count()) === 1, `n=${await carte.count()}`);

await carte.scrollIntoViewIfNeeded();
await page.waitForTimeout(3000);

const cadre = await carte.boundingBox();
await page.mouse.click(cadre.x + cadre.width / 2, cadre.y + cadre.height / 2);
await page.waitForTimeout(1000);

const latitudeSaisie = await page.inputValue('#champ-latitude');
check('le clic remplit la latitude', latitudeSaisie !== '', 'champ vide');
check('et la longitude', (await page.inputValue('#champ-longitude')) !== '', 'champ vide');

await page.click('button:has-text("Enregistrer la correction")');
await page.waitForTimeout(3500);

const situee = await appeler(`/api/superowner/stores/${storeId}`, { jeton: TP });
check('elle a des coordonnées', situee.donnees?.store?.situee === true, `${situee.donnees?.store?.situee}`);
check(
  'celles posées sur la carte',
  Math.abs(Number(situee.donnees?.store?.latitude) - Number(latitudeSaisie)) < 0.0001,
  `${situee.donnees?.store?.latitude} ≠ ${latitudeSaisie}`
);

const sansAvertissement = await texte();
check(
  'l’avertissement a disparu',
  !/n’est pas située|n'est pas située/.test(sansAvertissement),
  sansAvertissement.slice(0, 700)
);

titre('Une adresse publique déjà prise est refusée à l’écran');
const voisin = await inscriptionVia(appeler, {
  method: 'POST',
  corps: { email: `v-${uniq}@t.fr`, password: MDP, name: `V ${uniq}` },
});
await appeler('/api/stores', {
  method: 'POST',
  jeton: voisin.donnees.accessToken,
  corps: {
    orgId: voisin.donnees.organization.id,
    name: `Annexe ${uniq}`,
    slug: `annexe-${uniq}`,
    address: '2 rue Victor Hugo',
    city: 'Lyon',
    postalCode: '69002',
    phone: '0400000001',
  },
});

await page.click('button:has-text("Corriger")');
await page.waitForTimeout(800);
await page.fill('#champ-slug', `annexe-${uniq}`);
await page.click('button:has-text("Enregistrer la correction")');
await page.waitForTimeout(2500);

const refus = await texte();
check('le refus est affiché', /déjà utilisée/i.test(refus), refus.slice(0, 700));

const intact = await appeler(`/api/superowner/stores/${storeId}`, { jeton: TP });
check('l’adresse publique n’a pas bougé', intact.donnees?.store?.slug === slug, intact.donnees?.store?.slug);

// ===== Ouvrir et fermer =====

titre('La plateforme ferme la boutique depuis sa fiche');
/**
 * Le commerçant a ce bouton dans son espace ; la plateforme n'avait que le tout
 * ou rien de la suspension de compte — qui ferme aussi l'espace du commerçant,
 * et donc sa remédiation. Fermer une boutique pour l'après-midi est un autre
 * geste, et il manquait ici.
 */
await page.reload();
await page.waitForTimeout(2500);

const entete = await texte();
check('la fiche dit qu’elle est ouverte', /· ouverte/.test(entete), entete.slice(0, 400));
check(
  'le bouton de fermeture est là',
  (await page.locator('button:has-text("Fermer la boutique")').count()) === 1,
  'absent'
);

await page.click('button:has-text("Fermer la boutique")');
await page.waitForTimeout(600);

const confirmer = page.locator('button:has-text("Confirmer la fermeture")');
// Une boutique fermée sans explication se traduit par un appel au support.
check('sans motif, on ne peut pas confirmer', await confirmer.isDisabled(), 'active à tort');

await page.fill('#motif-fermeture', `Travaux ${uniq}`);
await page.waitForTimeout(300);
check('avec un motif, le bouton s’active', await confirmer.isEnabled(), 'inactive à tort');

await confirmer.click();
await page.waitForTimeout(3000);

const fermee = await texte();
check('la fiche la dit fermée', /· fermée/.test(fermee), fermee.slice(0, 400));

const vueFermee = await appeler(`/api/superowner/stores/${storeId}`, { jeton: TP });
check('le serveur l’a bien fermée', vueFermee.donnees?.store?.isOpen === false, `${vueFermee.donnees?.store?.isOpen}`);

titre('Et elle la rouvre');
check(
  'le bouton a changé de sens',
  (await page.locator('button:has-text("Rouvrir la boutique")').count()) === 1,
  'absent'
);

await page.click('button:has-text("Rouvrir la boutique")');
await page.waitForTimeout(3000);

const rouverte = await texte();
check('la fiche la dit rouverte', /· ouverte/.test(rouverte), rouverte.slice(0, 400));

const vueRouverte = await appeler(`/api/superowner/stores/${storeId}`, { jeton: TP });
check('le serveur l’a bien rouverte', vueRouverte.donnees?.store?.isOpen === true, `${vueRouverte.donnees?.store?.isOpen}`);

// ===== Le commerçant est prévenu =====

titre('Le commerçant reçoit un avis');
// Une modification muette se découvre par hasard, des semaines plus tard.
const avis = await appeler('/api/notifications', { jeton: T });
const liste2 = avis.donnees?.data || avis.donnees?.notifications || [];
check(
  'un avis de correction lui est adressé',
  liste2.some((n) => /a corrigé/i.test(n.title || '')),
  JSON.stringify(liste2.map((n) => n.title)).slice(0, 400)
);
check(
  'la fermeture lui est dite, avec son motif',
  liste2.some((n) => /a été fermée/i.test(n.title || '') && (n.message || '').includes(`Travaux ${uniq}`)),
  JSON.stringify(liste2.map((n) => n.title)).slice(0, 400)
);

titre('Rien n’a cassé en chemin');
check('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));

await nav.close();

console.log(`\n=== ${ok} réussites, ${echecs.length} échecs ===`);

if (echecs.length) {
  console.log(echecs.map((nom) => `  - ${nom}`).join('\n'));
  process.exit(1);
}
