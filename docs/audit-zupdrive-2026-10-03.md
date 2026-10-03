# Audit ZupDrive : accès entre comptes — 3 octobre 2026

## Périmètre

Lecture des routes chauffeur, société, passager et administration ZupDrive,
des services d'onboarding, sociétés, courses, notes et documents, ainsi que
de la présentation et des droits de lecture des fichiers privés. Les tests
ajoutés portent sur les invitations et les identifiants de ressources
voisines. Ils sont locaux, avec une base simulée ; aucune course, invitation
par courriel ni pièce de production n'a été créée pour cet audit.

## Faille corrigée localement : invitations d'une adresse non confirmée

La liste et la réponse aux invitations utilisaient l'adresse du compte sans
vérifier `emailVerified`. L'inscription donne une session avant confirmation
de l'adresse. Une personne pouvait donc inscrire une adresse qu'elle ne
contrôle pas (si aucun compte ne la réserve), voir les invitations adressées
à cette boîte, puis accepter ou refuser l'une d'elles.

`SocieteDriveService` centralise maintenant la résolution du destinataire :
l'e-mail doit être confirmé en base avant consultation, acceptation ou refus.
Un compte non confirmé reçoit 403 `EMAIL_NOT_VERIFIED`, avec un message
invitant à confirmer l'adresse. Un compte confirmé doit toujours avoir
l'adresse destinataire exacte. Les invitations déjà traitées restent
refusées. La vérification ne dépend pas du paramètre qui rend la confirmation
facultative pour la connexion : ici, la boîte mail établit un droit d'accès.

Les scénarios légitimes du test d'intégration société créent désormais des
destinataires explicitement confirmés. Ce changement de fixture ne modifie
aucun compte de production.

## Contrôles examinés

- Le dossier chauffeur est résolu depuis le compte de la session. Son
  profil ne peut pas fournir un statut, une société ou un rôle : schéma strict.
- La société est résolue par son gérant. Les véhicules et chauffeurs sont
  recherchés dans cette société, pas uniquement par identifiant.
- Une invitation émise ne s'annule que dans la société du gérant.
- L'attribution d'un véhicule vérifie la société du chauffeur et celle du
  véhicule. Le rattachement d'un chauffeur par invitation est transactionnel
  et exige qu'il soit encore sans société.
- Les uploads de documents reçoivent des octets ; ils ne rattachent pas une
  URL privée arbitraire fournie par le client. L'examen vérifie le dossier
  propriétaire du document. Le dossier chauffeur ne charge pas les documents
  de sa société ou de ses collègues ; les liens signés portent ses pièces.
- Le passager lit, annule et note uniquement sa propre course. Le chauffeur
  répond uniquement à sa proposition et fait avancer/annule/note sa course.
  Les opérations sur une course étrangère répondent 404.
- L'acceptation d'une course utilise une écriture conditionnelle dans une
  transaction : proposition encore ouverte, course en recherche sans chauffeur.
- Les routes d'administration utilisent l'authentification et les permissions
  de la plateforme DRIVE. Leur examen détaillé, notamment les élévations de
  privilèges, appartient à l'étape suivante ; ce passage ne les certifie pas.

## Validation

**71 tests réussis dans 4 suites**, dont **23 nouveaux tests** : adresse non
confirmée, invitation d'un autre compte, réponses légitimes, véhicule ou
chauffeur d'une autre société, pièce d'un autre dossier, course et note
d'une autre personne. Les tests existants couvrent aussi l'onboarding,
l'expiration des pièces et les itinéraires. TypeScript et build réussis.

La suite existante d'onboarding signale un handle SMTP ouvert lors de
l'import de l'application, sans échec de test. Les nouveaux tests simulent
les notifications et n'envoient pas de courriel.

La suite PostgreSQL `societe-drive.integration.test.ts`, dont une fixture a
été adaptée, n'a pas été exécutée : Docker local est indisponible. Le résultat
ne constitue pas un pentest authentifié de production ni un essai concurrent
PostgreSQL. Ne pas lancer le runner de vérification qui réinitialise la base
contre la base de production.

## Fichiers de ce passage

- `backend/src/modules/zupdrive/societe-drive.service.ts` : contrôle commun
  de l'adresse confirmée.
- `backend/src/modules/zupdrive/__tests__/zupdrive-idor.test.ts` : régressions.
- `backend/src/modules/zupdrive/__tests__/societe-drive.integration.test.ts` :
  destinataires confirmés dans les fixtures légitimes.
- `docs/audit-drivers-2026-10-03.md` : ajout du déploiement annoncé et des
  sondes HTTP externes.

Le correctif des invitations est **local, non publié et non déployé** au
moment de ce rapport. Il faut le valider avec la suite société sur une base
dédiée, puis publier/déployer. Les tests authentifiés de production,
la concurrence, les permissions admin/superowner, Socket.IO et les scénarios
paiement/webhook/abus restent à poursuivre selon l'ordre convenu.
