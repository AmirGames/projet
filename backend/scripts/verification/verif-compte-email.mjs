// Mot de passe oublié et confirmation d'adresse, de bout en bout : le lien
// est lu dans le courriel réellement envoyé.

import { titre, check, j, uniq, post, get, sqlScalaire, terminer, API } from './outils.mjs';
import { ouvrirBoiteAuxLettres } from './boite-aux-lettres.mjs';

const boite = await ouvrirBoiteAuxLettres(1025);

const email = `oubli-${uniq}@test.fr`;
const motDePasseInitial = 'Password123!';
const nouveauMotDePasse = 'NouveauPass456!';

// ===== Inscription =====

titre('Inscription');
const inscription = await j(
  await post('/api/auth/signup', { email, password: motDePasseInitial, name: `Oubli ${uniq}` })
);
check('compte créé', !!inscription?.accessToken, JSON.stringify(inscription)?.slice(0, 150));

const courrielConfirmation = await boite.attendre((m) => m.destinataire.includes(email));
check('un courriel de confirmation part à l\'inscription', !!courrielConfirmation);
check(
  'son objet parle de confirmation',
  /confirmez|confirmation/i.test(courrielConfirmation?.sujet || ''),
  courrielConfirmation?.sujet
);

const lienConfirmation = courrielConfirmation?.lien('/verifier-email');
check('il contient un lien de confirmation', !!lienConfirmation, courrielConfirmation?.contenu?.slice(0, 200));

// ===== Le jeton n'est pas en base =====

titre('Le jeton ne se trouve pas en base');
const jetonConfirmation = lienConfirmation ? new URL(lienConfirmation).searchParams.get('jeton') : '';
check('le lien porte un jeton', (jetonConfirmation || '').length >= 32, `longueur=${jetonConfirmation?.length}`);

const empreinteStockee = await sqlScalaire(
  `SELECT "emailTokenHash" FROM "User" WHERE email = '${email}'`
);
check('une empreinte est stockée', empreinteStockee.length === 64, `longueur=${empreinteStockee.length}`);
check(
  'le jeton en clair n\'est pas en base',
  empreinteStockee !== jetonConfirmation && !empreinteStockee.includes(jetonConfirmation || 'x'),
  empreinteStockee.slice(0, 20)
);

// ===== Confirmation d'adresse =====

titre('Confirmation de l\'adresse');
const avant = await sqlScalaire(`SELECT "emailVerified" FROM "User" WHERE email = '${email}'`);
check('adresse non confirmée au départ', avant === 'false', avant);

const mauvaisJeton = await post('/api/auth/verify-email', { jeton: 'f'.repeat(64) });
check('un jeton inventé est refusé', mauvaisJeton.status === 400, `statut=${mauvaisJeton.status}`);

const confirmation = await post('/api/auth/verify-email', { jeton: jetonConfirmation });
check('le lien confirme l\'adresse', confirmation.status === 200, `statut=${confirmation.status}`);

const apres = await sqlScalaire(`SELECT "emailVerified" FROM "User" WHERE email = '${email}'`);
check('la base enregistre la confirmation', apres === 'true', apres);

const rejoue = await post('/api/auth/verify-email', { jeton: jetonConfirmation });
check('le même lien ne resert pas', rejoue.status === 400, `statut=${rejoue.status}`);

// ===== Mot de passe oublié =====

titre('Demande de réinitialisation');
boite.vider();

const inconnue = await post('/api/auth/forgot-password', { email: `fantome-${uniq}@test.fr` });
const corpsInconnue = await j(inconnue);
check('une adresse inconnue renvoie 200', inconnue.status === 200, `statut=${inconnue.status}`);

const demande = await post('/api/auth/forgot-password', { email });
const corpsDemande = await j(demande);
check('une adresse connue renvoie 200', demande.status === 200, `statut=${demande.status}`);
check(
  'la réponse est la même dans les deux cas',
  corpsInconnue?.message === corpsDemande?.message,
  `${corpsInconnue?.message} / ${corpsDemande?.message}`
);

const courrielReinit = await boite.attendre((m) => m.destinataire.includes(email));
check('le courriel de réinitialisation part', !!courrielReinit);
check('aucun courriel pour l\'adresse inconnue', boite.messages.length === 1, `n=${boite.messages.length}`);

const lienReinit = courrielReinit?.lien('/reinitialiser');
const jetonReinit = lienReinit ? new URL(lienReinit).searchParams.get('jeton') : '';
check('il contient un lien de réinitialisation', !!lienReinit, courrielReinit?.contenu?.slice(0, 200));

const empreinteReinit = await sqlScalaire(`SELECT "resetTokenHash" FROM "User" WHERE email = '${email}'`);
check(
  'là encore, le clair n\'est pas en base',
  empreinteReinit.length === 64 && empreinteReinit !== jetonReinit,
  empreinteReinit.slice(0, 20)
);

// ===== Changement du mot de passe =====

titre('Changement du mot de passe');
const jetonBidon = await post('/api/auth/reset-password', {
  jeton: 'a'.repeat(64),
  password: nouveauMotDePasse,
});
check('un jeton inventé est refusé', jetonBidon.status === 400, `statut=${jetonBidon.status}`);

const tropCourt = await post('/api/auth/reset-password', { jeton: jetonReinit, password: '123' });
check('un mot de passe trop court est refusé', tropCourt.status === 400, `statut=${tropCourt.status}`);

const changement = await post('/api/auth/reset-password', {
  jeton: jetonReinit,
  password: nouveauMotDePasse,
});
check('le mot de passe est changé', changement.status === 200, `statut=${changement.status}`);

const ancienne = await post('/api/auth/login', { email, password: motDePasseInitial });
check('l\'ancien mot de passe ne marche plus', ancienne.status === 401, `statut=${ancienne.status}`);

const nouvelle = await j(await post('/api/auth/login', { email, password: nouveauMotDePasse }));
check('le nouveau permet de se connecter', !!nouvelle?.accessToken, JSON.stringify(nouvelle)?.slice(0, 120));
check('la connexion indique l\'adresse confirmée', nouvelle?.user?.emailVerified === true, `=${nouvelle?.user?.emailVerified}`);

const rejeu = await post('/api/auth/reset-password', {
  jeton: jetonReinit,
  password: 'EncoreAutre789!',
});
check('le lien de réinitialisation ne resert pas', rejeu.status === 400, `statut=${rejeu.status}`);

const empreinteApres = await sqlScalaire(`SELECT "resetTokenHash" FROM "User" WHERE email = '${email}'`);
check('l\'empreinte est effacée après usage', empreinteApres === '', empreinteApres);

// ===== Renvoi du lien de confirmation =====

titre('Renvoi du lien de confirmation');
boite.vider();

const jetonSession = nouvelle?.accessToken;
const dejaConfirme = await j(await post('/api/auth/resend-verification', null, jetonSession));
check(
  'un compte déjà confirmé le dit sans rien envoyer',
  dejaConfirme?.emailVerified === true,
  JSON.stringify(dejaConfirme)
);

// Sans session, la route reste utilisable : quelqu'un à qui l'on refuse la
// connexion faute de confirmation n'a justement pas de session.
const sansRien = await post('/api/auth/resend-verification', {});
check('sans session ni adresse, la demande est refusée', sansRien.status === 400, `statut=${sansRien.status}`);

const sansSession = await j(await post('/api/auth/resend-verification', { email }));
const adresseInconnue = await j(
  await post('/api/auth/resend-verification', { email: `jamais-${uniq}@test.fr` })
);
check(
  'sans session, la réponse ne dit pas si le compte existe',
  sansSession?.message === adresseInconnue?.message,
  `${sansSession?.message} / ${adresseInconnue?.message}`
);
check(
  'aucun courriel n\'est parti pour ces deux appels',
  boite.messages.length === 0,
  `n=${boite.messages.length}`
);

const jetonBidonSession = await post('/api/auth/resend-verification', { email }, 'jeton-invalide');
check(
  'une session invalide est refusée plutôt qu\'ignorée',
  jetonBidonSession.status === 401,
  `statut=${jetonBidonSession.status}`
);

const moi = await j(await get('/api/auth/me', jetonSession));
check('la fiche du compte expose la confirmation', moi?.user?.emailVerified === true, JSON.stringify(moi?.user));

// ===== Limitation de cadence =====

titre('Limitation de cadence');
const cadence = `cadence-${uniq}@test.fr`;
const statuts = [];

for (let essai = 0; essai < 5; essai++) {
  statuts.push((await post('/api/auth/forgot-password', { email: cadence })).status);
}

check('les premières demandes passent', statuts.slice(0, 3).every((s) => s === 200), statuts.join(','));
check('les suivantes sont refusées', statuts.slice(3).every((s) => s === 429), statuts.join(','));

const autreAdresse = await post('/api/auth/forgot-password', { email: `autre-${uniq}@test.fr` });
check(
  'la limite ne bloque pas une autre adresse',
  autreAdresse.status === 200,
  `statut=${autreAdresse.status}`
);

await boite.fermer();
await terminer();
