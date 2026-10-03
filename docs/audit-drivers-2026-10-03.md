# Audit ciblé livreurs et livraisons — 3 octobre 2026

## Déploiement annoncé ensuite par l'opérateur

L'opérateur a confirmé le déploiement des corrections ; le dépôt local est
au commit `d5994b8b` (Update drivers). La vérification externe suivante a
constaté `/health/ready` en 200 et les accès anonymes à `/api/organizations`,
`/api/drivers/deliveries`, `/api/drivers/documents`,
`/api/zupdrive/chauffeur/me` et `/api/zupdrive/admin/chauffeurs` en 401.
Ces sondes sans écriture n'attestent pas le commit actif par l'API et ne
remplacent pas les scénarios livreurs authentifiés, de concurrence et de
preuve photo avec une vraie base dédiée. Les mentions « locales, non
déployées » plus bas décrivent le statut au moment de la correction initiale.

## Point de départ et périmètre

Le résultat de production support/organisations transmis par l'opérateur est
67/67 au commit `c82513c7`, nettoyage confirmé. Ce passage suivant examine
`drivers.routes.ts`, les services de dispatch, documents, preuve de livraison,
support livreur et contrôle des fichiers privés. Les nouveaux tests s'exécutent
localement ; aucune course réelle ni document de production n'a été utilisé.

## Corrections

### Rattachement d'une pièce privée par URL

`DriverApprovalService.deposerPiece` acceptait une URL privée sans vérifier sa
propriété avant création du `CourierDocument`. Or l'autorisation de lecture
des fichiers repose sur ce rattachement. Un livreur connaissant l'URL du
document d'un autre pouvait donc se créer un droit de lecture.

Le service vérifie désormais une référence préexistante au même fichier dans
le dossier du livreur, avant toute écriture. Les fichiers des autres dossiers
privés sont refusés. Une référence propre est réutilisable et normalisée vers
l'URL de stockage ; un lien externe continue d'être accepté comme auparavant.
Ce contrôle concerne le stockage privé local, pas la confidentialité propre
à un hébergeur externe.

### Photo de dépôt non rattachée à sa course d'origine

Une photo locale déjà enregistrée comme preuve d'une autre course était
refusée, mais une photo fraîchement envoyée n'était pas encore référencée en
base. Son URL pouvait être soumise comme preuve d'une autre course.

L'upload donne désormais un reçu HMAC lié à l'URL exacte et à l'identifiant de
la course, valable 24 heures. La preuve locale exige ce reçu et le vérifie
avant rattachement, puis stocke l'URL sans reçu. Une substitution de fichier,
une autre course, un reçu expiré ou des paramètres répétés sont refusés.
Les clients web et mobile transmettent déjà la chaîne `photoUrl` reçue :
aucun nouveau champ ni migration n'est nécessaire. Une photo locale envoyée
avant déploiement devra être envoyée à nouveau pour obtenir son reçu.

Les liens externes sans reçu, historiquement acceptés, restent autorisés.
Cette compatibilité ne garantit donc pas l'authenticité de toute preuve
hébergée ailleurs. Les uploads externes effectués par le serveur portent
aussi un reçu, qui est vérifié s'il est fourni.

### Attribution entre le contrôle et l'écriture

Le dispatch vérifiait l'absence de livreur, puis attribuait par une écriture
inconditionnelle. Une attribution intercalée pouvait être écrasée.

La transaction exige maintenant que la course soit encore PENDING et sans
livreur, et que la proposition appartienne au demandeur, soit encore PENDING
et non expirée. Un échec annule la transaction et n'écrase pas l'attribution.
Le statut ACTIVE du livreur est aussi revérifié dans la transaction : une
proposition ancienne n'ouvre pas de course à un compte suspendu/inactif.

### URL de fichier sous Windows

Le chemin disque était utilisé tel quel dans l'URL. Les antislashs sous
Windows empêchaient la reconnaissance de la référence privée. Les URLs
utilisent maintenant des slashs, indépendamment du système.

## Vérifications

Les tests HTTP du routeur couvrent dix accès/actions sans jeton et les mêmes
accès/actions depuis Bob sur les ressources d'Alice : détail, acceptation par
course, statut, position, annulation, attente, photo, acceptation/refus d'offre
et relevé de paiement. Ils vérifient aussi l'absence d'écriture intrusive,
l'accès légitime, la proposition personnelle et l'identité injectée ignorée.
L'authentification est simulée dans ces tests HTTP ; le routeur et ses
contrôles d'appartenance sont réels, la base est simulée.

Les tests de services vérifient la propriété des documents avant écriture,
les reçus de photos, l'échec d'une attribution intercalée, les propositions
fermées et les statuts de compte. La concurrence est simulée par le résultat
de l'écriture conditionnelle ; aucun essai concurrent PostgreSQL réel n'a
été exécuté dans ce passage. Les règles d'attente et de fichiers privés
existantes sont aussi rejouées.

Le moteur Docker local n'étant pas disponible, les suites HTTP avec une vraie
base dédiée n'ont pas été relancées. Ne pas exécuter le lanceur `npm run verif`
sur la base de production : il réinitialise la base de vérification.

Résultats : **49 nouveaux tests réussis** (3 suites), **33 tests existants
réussis** (attente et fichiers privés), contrôle TypeScript et build réussis.
La suite existante de fichiers privés signale un handle SMTP ouvert à
l'import de l'application, sans échec de test ; les nouvelles suites
n'ouvrent pas cette connexion.

## Fichiers

- `backend/src/modules/drivers/driver-approval.service.ts`
- `backend/src/modules/drivers/delivery-proof.service.ts`
- `backend/src/modules/drivers/drivers.routes.ts`
- `backend/src/modules/drivers/dispatch.service.ts`
- `backend/src/modules/files/fichiers-prives.service.ts`
- `backend/src/modules/files/file-upload.service.ts`
- `backend/src/modules/drivers/__tests__/documents-preuves-idor.test.ts`
- `backend/src/modules/drivers/__tests__/drivers-idor.test.ts`
- `backend/src/modules/drivers/__tests__/dispatch-attribution-idor.test.ts`

## Limites et reprise

Les corrections de ce passage sont locales, non publiées et non déployées.
L'audit reste ciblé : il ne certifie pas tout `drivers`. La capacité maximale
de tournée sous acceptations simultanées, les courses réattribuées pendant
une autre mutation, les changements de statut et les informations nominatives
dans les propositions avant acceptation méritent des scénarios supplémentaires.
Les propositions exposent notamment une adresse lisible malgré des coordonnées
obfusquées : cette obfuscation ne protège donc pas à elle seule l'adresse.

Avant validation de production : rejouer sur une base dédiée les parcours
livreur, preuve de livraison, attribution et cloisonnement, notamment un lot
de plusieurs courses ; vérifier la concurrence avec PostgreSQL. Puis publier
et déployer les corrections. L'audit ZupDrive complet, les permissions
admin/superowner, Socket.IO et les paiements restent les étapes suivantes.
