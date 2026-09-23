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

let numero = 0;
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

  return {
    ...inscription,
    donnees: { ...inscription.donnees, organization: { id: org.id, name: org.name, slug: org.slug } },
  };
}
