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
    prisma = new PrismaClient();
  }
  return prisma;
}
const suffixe = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export async function inscriptionVia(appeler, options) {
  const inscription = await appeler('/api/auth/signup', options);
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
