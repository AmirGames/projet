/**
 * Inscription telle que les vérifications ont été écrites : un compte, et une
 * organisation sans boutique dont il est administrateur.
 *
 * Avant la refonte d'identité, /auth/signup créait lui-même cette
 * organisation ; il ne crée plus que le compte et sa fiche client, et le
 * produit passe ensuite par /auth/me/become-merchant — qui ouvre aussi une
 * boutique. Les suites créent leurs boutiques elles-mêmes, avec ce qu'elles
 * vérifient : une boutique imposée fausserait leurs comptes et mangerait le
 * quota de la formule.
 *
 * Les deux passent par la vraie API — /auth/signup, puis /organizations, qui
 * crée l'organisation au nom de l'appelant comme le faisait l'ancienne
 * inscription —, avec l'`appeler` de la suite elle-même. La réponse garde
 * le statut et le corps de l'inscription, augmentés de `organization`.
 *
 * Même outil côté API : backend/scripts/verification/outils.mjs.
 */

import { createRequire } from 'node:module';

let numero = 0;
let prisma = null;

/**
 * Le client Prisma du backend : valider un commerce passe par la base, les
 * suites navigateur n'ont pas d'autre accès. Demande DATABASE_URL.
 */
function base() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL manque : les suites valident leurs commerces en base.');
  }
  if (!prisma) {
    const exiger = createRequire(new URL('../../backend/package.json', import.meta.url));
    const { PrismaClient } = exiger('@prisma/client');
    const { PrismaPg } = exiger('@prisma/adapter-pg');
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  }
  return prisma;
}
/** Pour les suites qui doivent agir derrière l'API (vieillir une commande). */
export const baseDeDonnees = base;

const suffixe = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/**
 * Le premier compte inscrit devient la plateforme — dans les vérifications
 * seulement.
 *
 * L'API ne donne plus aucun droit à l'inscription (SEC-03) : le superowner se
 * crée avec `npm run create-superowner`. Les suites ont été écrites pour un
 * premier inscrit qui est la plateforme, sur une base vidée : on le promeut
 * ici, en base, et on corrige la réponse pour qu'elle le dise. À appeler
 * après chaque inscription qui peut être la première.
 */
export async function plateformeSiAucune(inscription) {
  const userId = inscription.donnees?.user?.id;
  if (!userId) return inscription;

  const promu = await base()
    .$executeRaw`UPDATE "User" SET "isSuperOwner" = true, "isSystemAdmin" = true
      WHERE id = ${userId} AND NOT EXISTS (SELECT 1 FROM "User" WHERE "isSuperOwner" = true)`
    // Deux inscriptions simultanées : l'index unique garde la première.
    .catch(() => 0);

  if (promu !== 1) return inscription;
  return {
    ...inscription,
    donnees: { ...inscription.donnees, user: { ...inscription.donnees.user, isSuperOwner: true, isSystemAdmin: true } },
  };
}

export async function inscriptionVia(appeler, options) {
  const inscription = await plateformeSiAucune(
    await appeler('/api/auth/signup', {
      ...options,
      corps: { conditionsAcceptees: true, ...options.corps },
    })
  );
  const jeton = inscription.donnees?.accessToken;

  if (!jeton) return inscription;

  const nom = options.corps?.name?.length >= 2 ? options.corps.name : `Organisation ${suffixe}`;
  const creation = await appeler('/api/organizations', {
    method: 'POST',
    jeton,
    corps: { name: nom, slug: `org-${suffixe}-${++numero}` },
  });
  const org = creation.donnees?.org;

  if (!org?.id) {
    throw new Error(`Organisation non créée : statut ${creation.statut} ${JSON.stringify(creation.donnees)}`);
  }

  // Un commerce attend désormais la validation de la plateforme avant de
  // vendre ; les suites ont été écrites pour un commerce qui vend. Il est
  // validé d'office, comme la migration l'a fait pour les commerces existants.
  await base().organization.update({ where: { id: org.id }, data: { approvedAt: new Date() } });

  return {
    ...inscription,
    donnees: { ...inscription.donnees, organization: { id: org.id, name: org.name, slug: org.slug } },
  };
}

/**
 * Ouvre une boutique de 00:00 à 23:59, tous les jours.
 *
 * La vitrine suit désormais l'état d'ouverture réel : hors des horaires, on ne
 * commande plus. Une boutique sans horaires prend ceux par défaut (9 h – 22 h),
 * et une suite lancée à 7 h échouait là où elle passait l'après-midi. Les
 * suites qui ne vérifient pas les horaires s'en affranchissent ainsi ; celles
 * qui les vérifient (creneaux-retrait, horaires-genre) posent les leurs.
 */
export async function ouvrirToutLeJour(appeler, storeId, jeton) {
  for (const jour of ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']) {
    const reponse = await appeler(`/api/store-hours/${storeId}/day/${jour}`, {
      method: 'PUT',
      jeton,
      corps: { open: '00:00', close: '23:59', closed: false },
    });

    if (reponse.statut >= 400) {
      throw new Error(`Horaires refusés (${jour}) : statut ${reponse.statut} ${JSON.stringify(reponse.donnees)}`);
    }
  }
}

/**
 * Écarte le bouton flottant de l'assistant ZupOne.
 *
 * Il est monté sur toutes les pages (RootLayoutContent), fixé en bas à droite
 * avec un z-index élevé : il recouvre le bouton « Passer la commande » de la
 * page de paiement, et Playwright, qui refuse de cliquer sous un autre
 * élément, attend alors jusqu'au délai. Les suites qui ne testent pas
 * l'assistant le masquent donc, sur toutes les pages que la page ouvre.
 *
 * À appeler juste après `newPage()`, avant la première navigation.
 */
export async function ecarterAssistant(page) {
  await page.addInitScript(() => {
    const poser = () => {
      const style = document.createElement('style');
      style.textContent = '[aria-label="Ouvrir Assistant ZupOne"] { display: none !important; }';
      document.documentElement.appendChild(style);
    };
    // Le script s'exécute avant que le document n'ait son élément racine.
    if (document.documentElement) poser();
    else document.addEventListener('DOMContentLoaded', poser);
  });
}

/**
 * Ouvre la session d'un compte dans une page, comme un vrai navigateur.
 *
 * Le jeton de renouvellement vit dans un cookie httpOnly, et le jeton d'accès
 * en mémoire seulement (lib/jeton-session.ts) : poser `accessToken` dans
 * localStorage ne suffit plus, l'appli renvoie vers la connexion. La page se
 * connecte donc par la même route que le formulaire, qui pose le cookie, puis
 * marque la session ouverte pour que l'appli la retrouve au chargement, et
 * retient le commerce du compte comme le fait le formulaire.
 *
 * À appeler avant d'ouvrir la page voulue. Renvoie le statut de la connexion.
 */
export async function connecterNavigateur(page, site, { email, password }) {
  await page.goto(`${site}/login`, { waitUntil: 'domcontentloaded' });
  return page.evaluate(
    async ([courriel, motDePasse]) => {
      const reponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Refresh-Transport': 'cookie' },
        body: JSON.stringify({ email: courriel, password: motDePasse }),
        credentials: 'same-origin',
      });
      if (reponse.ok) {
        localStorage.setItem('sessionOuverte', '1');
        // Comme le formulaire : le commerce du compte devient le commerce
        // courant, sans quoi l'espace commerçant n'a aucune boutique à montrer.
        const donnees = await reponse.json().catch(() => null);
        if (donnees?.organization?.id) localStorage.setItem('currentOrgId', donnees.organization.id);
        else localStorage.removeItem('currentOrgId');
      }
      return reponse.status;
    },
    [email, password]
  );
}
