// Le profil du commerçant : ce qui le facture, ce qui le paie, et ses pièces.
//
// La plateforme lui prélevait une commission et lui devait des versements sans
// rien savoir de lui. Ce qui compte ici : que ce qu'il saisit soit relu tel
// quel, que l'IBAN ne ressorte jamais entier, et qu'une pièce déposée puisse
// vraiment être examinée.

import {
  titre,
  check,
  j,
  uniq,
  post,
  put,
  get,
  del,
  patch,
  terminer,
  sqlScalaire,
} from './outils.mjs';

const MDP = 'Password123!';

const plateforme = await j(
  await post('/api/auth/signup', { email: `p-${uniq}@t.fr`, password: MDP, name: `P ${uniq}` })
);
const TP = plateforme.accessToken;

const commercant = await j(
  await post('/api/auth/signup', { email: `m-${uniq}@t.fr`, password: MDP, name: `M ${uniq}` })
);
const T = commercant.accessToken;
const orgId = commercant.organization.id;

// ===== Ce qui manque, dit avant la facture =====

titre('Un profil vide se signale lui-même');
const vide = await j(await get(`/api/merchant-profile/${orgId}`, T));
check('le profil se lit', !!vide?.data?.id, JSON.stringify(vide)?.slice(0, 200));
check(
  'la raison sociale manque pour facturer',
  (vide?.data?.manquePourFacturer || []).some((manque) => /raison sociale/.test(manque)),
  JSON.stringify(vide?.data?.manquePourFacturer)
);
check(
  'l’IBAN manque pour être payé',
  (vide?.data?.manquePourEtrePaye || []).some((manque) => /IBAN/.test(manque)),
  JSON.stringify(vide?.data?.manquePourEtrePaye)
);
check(
  'la France et la Belgique sont proposées',
  (vide?.data?.paysConnus || []).join(',') === 'France,Belgique',
  JSON.stringify(vide?.data?.paysConnus)
);

// ===== L'enregistrement =====

titre('Le commerçant renseigne son profil');
const enregistre = await j(
  await put(
    `/api/merchant-profile/${orgId}`,
    {
      legalName: `Zupone Test ${uniq}`,
      registrationNumber: '81234567800015',
      vatNumber: 'FR12345678901',
      billingAddress: '20 Rue de la République',
      billingPostalCode: '69002',
      billingCity: 'Lyon',
      billingCountry: 'France',
      ownerFirstName: 'Amir',
      ownerLastName: 'Test',
      ownerEmail: `proprio-${uniq}@t.fr`,
      ownerPhone: '0600000000',
      ownerBirthDate: '1985-04-12',
      iban: 'FR7630006000011234567890189',
      bic: 'AGRIFRPP',
      accountHolder: `Zupone Test ${uniq}`,
    },
    T
  )
);

check('la raison sociale est relue', enregistre?.data?.legalName === `Zupone Test ${uniq}`, enregistre?.data?.legalName);
check('le numéro de TVA est relu', enregistre?.data?.vatNumber === 'FR12345678901', enregistre?.data?.vatNumber);
check('la ville de facturation est relue', enregistre?.data?.billingCity === 'Lyon', enregistre?.data?.billingCity);
check('le propriétaire est relu', enregistre?.data?.ownerFirstName === 'Amir', enregistre?.data?.ownerFirstName);
check(
  'la date de naissance est retenue',
  String(enregistre?.data?.ownerBirthDate || '').startsWith('1985-04-12'),
  enregistre?.data?.ownerBirthDate
);
check('rien ne manque plus pour facturer', (enregistre?.data?.manquePourFacturer || []).length === 0, JSON.stringify(enregistre?.data?.manquePourFacturer));
check('ni pour être payé', (enregistre?.data?.manquePourEtrePaye || []).length === 0, JSON.stringify(enregistre?.data?.manquePourEtrePaye));

titre('L’IBAN est bien enregistré, mais jamais rendu');
const ibanEnBase = await sqlScalaire(`SELECT iban FROM "Organization" WHERE id = '${orgId}'`);
check('il est stocké', ibanEnBase === 'FR7630006000011234567890189', ibanEnBase);

// C'est tout l'enjeu : une coordonnée bancaire ne repart pas à chaque
// ouverture de page.
const brut = JSON.stringify(enregistre);
check('il ne repart pas dans la réponse', !brut.includes('FR7630006000011234567890189'), brut.slice(0, 200));
check('seuls les quatre derniers sont montrés', enregistre?.data?.ibanMasque?.endsWith('0189'), enregistre?.data?.ibanMasque);
check('et le compte est signalé comme renseigné', enregistre?.data?.ibanRenseigne === true, `${enregistre?.data?.ibanRenseigne}`);

const relu = await j(await get(`/api/merchant-profile/${orgId}`, T));
check(
  'une relecture ne le rend pas davantage',
  !JSON.stringify(relu).includes('FR7630006000011234567890189'),
  'IBAN présent dans la relecture'
);

// ===== Les refus =====

titre('Les saisies invraisemblables sont refusées');
const tvaFausse = await put(`/api/merchant-profile/${orgId}`, { vatNumber: 'FR1' }, T);
check('une TVA au mauvais format est refusée', tvaFausse.status === 400, `statut ${tvaFausse.status}`);
check(
  'et le format attendu est donné',
  /FR12345678901/.test((await j(tvaFausse))?.error || ''),
  'message sans exemple'
);

// Une TVA belge sur un profil français ne doit pas passer : c'est le pays qui
// décide du format.
const tvaBelgeEnFrance = await put(`/api/merchant-profile/${orgId}`, { vatNumber: 'BE0123456789' }, T);
check('une TVA belge sur un profil français est refusée', tvaBelgeEnFrance.status === 400, `statut ${tvaBelgeEnFrance.status}`);

const enBelgique = await put(
  `/api/merchant-profile/${orgId}`,
  { billingCountry: 'Belgique', vatNumber: 'BE0123456789' },
  T
);
check('la même acceptée quand le pays suit', enBelgique.status === 200, `statut ${enBelgique.status}`);

const paysInconnu = await put(`/api/merchant-profile/${orgId}`, { billingCountry: 'Suisse' }, T);
check('un pays hors couverture est refusé', paysInconnu.status === 400, `statut ${paysInconnu.status}`);

const ibanFaux = await put(`/api/merchant-profile/${orgId}`, { iban: 'pas-un-iban' }, T);
check('un IBAN illisible est refusé', ibanFaux.status === 400, `statut ${ibanFaux.status}`);

const ibanApresRefus = await sqlScalaire(`SELECT iban FROM "Organization" WHERE id = '${orgId}'`);
check('et l’ancien reste en place', ibanApresRefus === 'FR7630006000011234567890189', ibanApresRefus);

const naissanceFuture = await put(`/api/merchant-profile/${orgId}`, { ownerBirthDate: '2030-01-01' }, T);
check('une naissance dans le futur est refusée', naissanceFuture.status === 400, `statut ${naissanceFuture.status}`);

const courrielFaux = await put(`/api/merchant-profile/${orgId}`, { ownerEmail: 'pas-un-email' }, T);
check('un e-mail invalide est refusé', courrielFaux.status === 400, `statut ${courrielFaux.status}`);

// ===== Chacun chez soi =====

titre('Le profil du voisin reste hors de portée');
const voisin = await j(
  await post('/api/auth/signup', { email: `v-${uniq}@t.fr`, password: MDP, name: `V ${uniq}` })
);
const lectureVoisine = await get(`/api/merchant-profile/${orgId}`, voisin.accessToken);
check('un autre commerçant ne le lit pas', lectureVoisine.status === 403, `statut ${lectureVoisine.status}`);

const ecritureVoisine = await put(`/api/merchant-profile/${orgId}`, { legalName: 'Détournée' }, voisin.accessToken);
check('et ne l’écrit pas', ecritureVoisine.status === 403, `statut ${ecritureVoisine.status}`);

const nomApres = await sqlScalaire(`SELECT "legalName" FROM "Organization" WHERE id = '${orgId}'`);
check('la raison sociale n’a pas bougé', nomApres === `Zupone Test ${uniq}`, nomApres);

// ===== Les pièces =====

titre('Déposer une pièce');
const depot = await j(
  await post(
    `/api/merchant-profile/${orgId}/documents`,
    { type: 'registration', documentUrl: 'https://exemple.fr/kbis.pdf', fileName: 'kbis.pdf' },
    T
  )
);
const documentId = depot?.document?.id;
check('la pièce est déposée', !!documentId, JSON.stringify(depot)?.slice(0, 200));
check('elle attend son examen', depot?.document?.status === 'PENDING', depot?.document?.status);

const avecPiece = await j(await get(`/api/merchant-profile/${orgId}`, T));
check('elle figure au dossier', (avecPiece?.data?.documents || []).length === 1, `${avecPiece?.data?.documents?.length}`);
check(
  'avec un libellé lisible',
  /immatriculation/i.test(avecPiece?.data?.documents?.[0]?.libelle || ''),
  avecPiece?.data?.documents?.[0]?.libelle
);

titre('Redéposer la même pièce la remplace');
// Sans cela, une pièce corrigée après un refus laisserait l'ancienne au dossier.
await post(
  `/api/merchant-profile/${orgId}/documents`,
  { type: 'registration', documentUrl: 'https://exemple.fr/kbis-corrige.pdf' },
  T
);
const apresRedepot = await j(await get(`/api/merchant-profile/${orgId}`, T));
check('le dossier n’en compte toujours qu’une', (apresRedepot?.data?.documents || []).length === 1, `${apresRedepot?.data?.documents?.length}`);
check(
  'et c’est la nouvelle',
  apresRedepot?.data?.documents?.[0]?.documentUrl === 'https://exemple.fr/kbis-corrige.pdf',
  apresRedepot?.data?.documents?.[0]?.documentUrl
);

titre('Les dépôts impossibles');
const lienFaux = await post(
  `/api/merchant-profile/${orgId}/documents`,
  { type: 'identity', documentUrl: 'kbis.pdf' },
  T
);
check('un lien qui n’en est pas un est refusé', lienFaux.status === 400, `statut ${lienFaux.status}`);

const dejaExpire = await post(
  `/api/merchant-profile/${orgId}/documents`,
  { type: 'identity', documentUrl: 'https://exemple.fr/cni.pdf', expiryDate: '2020-01-01' },
  T
);
check('une pièce déjà expirée est refusée', dejaExpire.status === 400, `statut ${dejaExpire.status}`);

const typeInconnu = await post(
  `/api/merchant-profile/${orgId}/documents`,
  { type: 'passeport-du-chien', documentUrl: 'https://exemple.fr/x.pdf' },
  T
);
check('un type de pièce inconnu est refusé', typeInconnu.status === 400, `statut ${typeInconnu.status}`);

// ===== L'examen par la plateforme =====

titre('La plateforme statue sur la pièce');
const piece = apresRedepot?.data?.documents?.[0];

const refusSansMotif = await patch(
  `/api/superowner/organizations/${orgId}/documents/${piece.id}`,
  { approuve: false },
  TP
);
// Un refus muet laisse le commerçant redéposer la même pièce à l'aveugle.
check('un refus sans motif est refusé', refusSansMotif.status === 400, `statut ${refusSansMotif.status}`);

const refus = await j(
  await patch(
    `/api/superowner/organizations/${orgId}/documents/${piece.id}`,
    { approuve: false, note: 'Document illisible' },
    TP
  )
);
check('le refus motivé passe', refus?.document?.status === 'REJECTED', refus?.document?.status);
check('et le motif est enregistré', refus?.document?.reviewNote === 'Document illisible', refus?.document?.reviewNote);

const vuParLeCommercant = await j(await get(`/api/merchant-profile/${orgId}`, T));
check(
  'le commerçant lit le motif',
  vuParLeCommercant?.data?.documents?.[0]?.reviewNote === 'Document illisible',
  vuParLeCommercant?.data?.documents?.[0]?.reviewNote
);

const prevenu = await sqlScalaire(
  `SELECT count(*) FROM "Notification" WHERE "recipientEmail" = 'm-${uniq}@t.fr' AND message LIKE '%refusé%'`
);
check('et il en est prévenu', prevenu === '1', prevenu);

titre('Une pièce corrigée repart en attente');
await post(
  `/api/merchant-profile/${orgId}/documents`,
  { type: 'registration', documentUrl: 'https://exemple.fr/kbis-net.pdf' },
  T
);
const remise = await j(await get(`/api/merchant-profile/${orgId}`, T));
check('elle attend de nouveau', remise?.data?.documents?.[0]?.status === 'PENDING', remise?.data?.documents?.[0]?.status);
check('et le motif du refus est effacé', remise?.data?.documents?.[0]?.reviewNote === null, remise?.data?.documents?.[0]?.reviewNote);

const validation = await j(
  await patch(
    `/api/superowner/organizations/${orgId}/documents/${remise.data.documents[0].id}`,
    { approuve: true },
    TP
  )
);
check('la validation passe', validation?.document?.status === 'APPROVED', validation?.document?.status);

titre('Le dossier vu par la plateforme');
const dossier = await j(await get(`/api/superowner/organizations/${orgId}/profile`, TP));
check('la plateforme lit le dossier', dossier?.data?.legalName === `Zupone Test ${uniq}`, dossier?.data?.legalName);
check('elle compte les pièces à examiner', dossier?.data?.piecesAExaminer === 0, `${dossier?.data?.piecesAExaminer}`);
// Elle a besoin de rapprocher un virement d'un compte, pas de l'IBAN entier.
check(
  'elle ne voit pas l’IBAN entier',
  !JSON.stringify(dossier).includes('FR7630006000011234567890189'),
  'IBAN présent'
);
check('mais reconnaît le compte', dossier?.data?.ibanMasque?.endsWith('0189'), dossier?.data?.ibanMasque);

const dossierParLeCommercant = await get(`/api/superowner/organizations/${orgId}/profile`, T);
check('un commerçant n’accède pas à cette vue', dossierParLeCommercant.status === 403, `statut ${dossierParLeCommercant.status}`);

// ===== La facture porte enfin les mentions =====

titre('La facture porte les mentions du commerçant');
const facture = await j(await get(`/api/superowner/billing/${orgId}`, TP));
check('la raison sociale y figure', facture?.organization?.legalName === `Zupone Test ${uniq}`, facture?.organization?.legalName);
check('le numéro de TVA aussi', facture?.organization?.vatNumber === 'BE0123456789', facture?.organization?.vatNumber);
check('et plus rien ne manque', (facture?.organization?.manquePourFacturer || []).length === 0, JSON.stringify(facture?.organization?.manquePourFacturer));

// ===== Retirer une pièce =====

titre('Retirer une pièce');
const aRetirer = remise.data.documents[0].id;
const retrait = await del(`/api/merchant-profile/${orgId}/documents/${aRetirer}`, null, T);
check('le retrait passe', retrait.status === 200, `statut ${retrait.status}`);

const reste = await sqlScalaire(
  `SELECT count(*) FROM "OrganizationDocument" WHERE id = '${aRetirer}'`
);
check('et la pièce a bien disparu', reste === '0', reste);

await terminer();
