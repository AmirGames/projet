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

const plateforme = await appeler('/api/auth/signup', {
  method: 'POST',
  corps: { email: emailPlateforme, password: MDP, name: `Plateforme ${uniq}` },
});
const TP = plateforme.donnees?.accessToken;

if (!TP) {
  console.error(`Inscription de la plateforme impossible : ${JSON.stringify(plateforme.donnees)}`);
  process.exit(1);
}

const commercant = await appeler('/api/auth/signup', {
  method: 'POST',
  corps: { email: `m-${uniq}@t.fr`, password: MDP, name: `M ${uniq}` },
});
const T = commercant.donnees.accessToken;

const nomBoutique = `Trattoria ${uniq}`;
const slug = `trattoria-${uniq}`;

const boutique = await appeler('/api/stores', {
  method: 'POST',
  jeton: T,
  corps: {
    orgId: commercant.donnees.organization.id,
    name: nomBoutique,
    slug,
    address: '1 place Bellecour',
    city: 'Lyon',
    postalCode: '69002',
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
  // résulte est ce qu'on vérifie, pas un défaut de la page.
  if (m.type() === 'error' && !/400/.test(m.text())) {
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

titre('Corriger l’adresse situe la boutique');
await page.click('button:has-text("Corriger")');
await page.waitForTimeout(800);
await page.fill('#champ-address', '20 Rue de la République');
await page.fill('#champ-latitude', '');
await page.fill('#champ-longitude', '');
await page.click('button:has-text("Enregistrer la correction")');
await page.waitForTimeout(3500);

const situee = await appeler(`/api/superowner/stores/${storeId}`, { jeton: TP });
check('elle a des coordonnées', situee.donnees?.store?.situee === true, `${situee.donnees?.store?.situee}`);

const sansAvertissement = await texte();
check(
  'l’avertissement a disparu',
  !/n’est pas située|n'est pas située/.test(sansAvertissement),
  sansAvertissement.slice(0, 700)
);

titre('Une adresse publique déjà prise est refusée à l’écran');
const voisin = await appeler('/api/auth/signup', {
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

titre('Rien n’a cassé en chemin');
check('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));

await nav.close();

console.log(`\n=== ${ok} réussites, ${echecs.length} échecs ===`);

if (echecs.length) {
  console.log(echecs.map((nom) => `  - ${nom}`).join('\n'));
  process.exit(1);
}
