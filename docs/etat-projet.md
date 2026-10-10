# État du projet et travail restant

## Étape 06 — A09 : rotation atomique des sessions (10 octobre 2026)

| État | Date | SHA / environnement | Preuve |
|---|---|---|---|
| Développé | 10 octobre 2026 | branche courante `claude/awesome-ride-m9lci8`, base `5c51fddd4882e7f720a201b620cb0ad915ee9b0e` ; aucun commit A09 | [contrat A09](ROTATION-SESSIONS-A09.md), code et migration locale |
| Testé | 10 octobre 2026, partiel | Windows local; mobile delivery 9/9; typecheck/lint delivery et admin; typecheck/lint frontend; Prisma validate | PostgreSQL non joint (`localhost:5432` fermé); Jest backend/web bloqué par `EPERM realpath`; Prisma generate bloqué par `EPERM realpath`; voir ci-dessous |
| Intégré | non | aucun SHA de fusion | PR non créée (branche dédiée refusée par permission Git) |
| Déployé | non | aucun environnement confirmé | aucune preuve |
| Validé en exploitation | non | aucun environnement confirmé | aucune preuve |

La demande A09 ne constitue pas une preuve de réussite. Les audits datés
restent conservés comme historique. `npx prisma migrate deploy` a échoué sans
appliquer la migration, car PostgreSQL `saas_dev` n'était pas joignable. Le
test PostgreSQL attend une base dont le nom contient `test`; le port local
était fermé. La suite Jest backend échoue avant découverte des tests par
`EPERM realpath` du répertoire temporaire Windows. `prisma generate` échoue par
`EPERM realpath` sur le chemin `@prisma/client`; le typecheck backend reflète
donc le client ancien et signale uniquement les nouveaux champs absents.
L'accès au dépôt Git refuse la création d'une branche dédiée; `gh` est absent
ou non authentifié, donc aucune PR n'a été créée. Voir les commandes et limites
dans [ROTATION-SESSIONS-A09.md](ROTATION-SESSIONS-A09.md).

## Étape 05 — A10 : liens de compte (10 octobre 2026)

| État | Date | SHA / environnement | Preuve |
|---|---|---|---|
| Développé | 10 octobre 2026 | branche `claude/awesome-ride-m9lci8-a10`, commit `acd9b600d345d7968f4b24b7ecc0cbe69bd92fbe` ; base `abd2d1e` | [code et contrat](LIENS-COMPTE-A10.md) |
| Testé | 10 octobre 2026 | Windows local, PostgreSQL `a10_test` isolé et migré | [commandes et résultats](preuves-a10-2026-10-10.md) : 2 987 tests backend passés, 91 ignorés ; types, lint, build passés |
| Intégré | non | aucun SHA de fusion | PR à créer |
| Déployé | non | aucun environnement confirmé | aucune preuve |
| Validé en exploitation | non | aucun environnement confirmé | aucune preuve |

La demande A10 ne constitue pas une preuve de réussite. Les audits précédents
conservent leur date et leur périmètre.

Mis à jour le **10 octobre 2026**. Ce document rassemble l'état connu du dépôt,
les résultats consignés dans les audits et les confirmations de l'opérateur.
Les validations A04 du 9 octobre et A05 du 10 octobre figurent en fin de
fichier ; les résultats des audits antérieurs conservent leur date et leur
périmètre. Le VPS n'a pas été
interrogé pendant A04. Les contrôles locaux sont consignés avec leurs limites.
Un déploiement annoncé ne prouve pas à lui seul le commit actif du serveur.

## Bloc prioritaire — Phase 0 sécurité

Le 5 octobre 2026, les correctifs locaux de la Phase 0 ont été ajoutés.
**La phase n'est pas validée** : 42 contrôles locaux avec dépendances simulées
passent, mais les suites complètes et le build sont bloqués par l'absence des
dépendances. L'énumération lors de l'inscription et la révocation des liens
signés restent ouvertes. Aucune nouvelle fonctionnalité métier ni ouverture
à grande échelle avant validation complète. Voir
[les corrections, preuves et blocages](phase-0-securite.md).


## Ce qui existe

- **ZupEat** : catalogue, commande avec ou sans compte, paiement Stripe,
  remboursement, préparation, attribution aux livreurs, suivi et preuve de
  livraison, pourboires, reversements hebdomadaires et export SEPA.
- **Administration ZupOne** : équipe et permissions par plateforme,
  validation des dossiers, support, facturation, pages légales versionnées,
  journaux et surveillance.
- **Vitrine ZupOne** : page du groupe dans `frontend/app/zupone/page.tsx`.
- **ZupDrive V1** : dossiers chauffeurs et sociétés, véhicules et invitations,
  validation des pièces, tarifs régionaux, devis signés, attribution et suivi
  des courses, annulation et notes. Voir [le périmètre ZupDrive](zupdrive.md).
  La présentation publique l'annonce encore « Bientôt disponible ». Côté API,
  le paiement en ligne des courses est branché (webhook Stripe, versement du
  chauffeur) et les routes d'administration, de support, de conformité et de
  supervision sont montées : voir [`zupdrive-api-admin.md`](zupdrive-api-admin.md).
  Le formulaire de paiement est sur la page de suivi d'un trajet
  (`/trajet/[id]`) ; il reste désactivé tant que
  `ZUPDRIVE_PAIEMENT_OBLIGATOIRE` vaut `false`.
- **Applications mobiles** : client, commerçant et livreur écrits dans
  `mobile/apps/`. Leur publication dans les stores reste à réaliser. Une
  application d'administration existe aussi dans `mobile/apps/admin/`.

## Déploiement et validations acquises

Le site est **déployé sur un VPS**, avec l'API à `https://api.zupeat.com`.
L'infrastructure du dépôt utilise Docker Compose, Caddy, PostgreSQL et Redis.
Le déploiement et les correctifs de surveillance ont été confirmés par
l'opérateur. Voir [le guide d'exploitation](../DEPLOIEMENT-SCALEWAY.md).

| Périmètre | Résultat consigné | Limite de la preuve |
|---|---|---|
| Support et organisations sur le VPS | **67/67**, après déploiement du correctif | Audit HTTP ciblé avec deux comptes temporaires, pas un pentest complet |
| Invitations ZupDrive et refus administratifs sur le VPS | **12/12** | Compte ordinaire temporaire ; aucune course ni mutation administrative |
| Sondes Socket.IO et paiements sur le VPS | **10/10** après le déploiement annoncé | Refus et disponibilité ; ne couvrent pas les parcours authentifiés complets |
| Stripe TEST et PostgreSQL réels, en local isolé | **33/33** | Paiements, remboursements, concurrence, rejeu signé et rollback ; pas le formulaire de commande complet |
| Paiement Stripe TEST sur le VPS, le 4 octobre | Paiement réussi, webhook `payment_intent.succeeded` reçu et rejoué sans doublon visible côté client ou commerçant | Validation manuelle transmise par l'opérateur ; pas de contrôle SQL de tous les effets |

Pour le paiement TEST sur le VPS, le détail transmis est cohérent : articles
30,00 €, livraison 2,49 €, frais de service 0,25 €, soit 32,74 € pour la
commande, plus 3,00 € de pourboire, soit **35,74 € encaissés par Stripe**.
Le remboursement de cette commande sur le VPS reste à vérifier. Le mode LIVE
attend la validation du compte Stripe et sa propre configuration.

Les sources détaillées sont les audits [production](audit-production-2026-10-03.md),
[livreurs](audit-drivers-2026-10-03.md),
[ZupDrive](audit-zupdrive-2026-10-03.md),
[administration](audit-admin-2026-10-03.md),
[Socket.IO](audit-socket-2026-10-03.md) et
[paiements](audit-paiements-webhooks-2026-10-03.md).
Leurs sections initiales décrivent l'état au moment de chaque audit ; les
confirmations ultérieures et ce document donnent le suivi actuel.

## Priorités avant l'ouverture aux clients

- [ ] **Remboursement Stripe TEST sur le VPS** : montant de la commande et
  pourboire, réception de `charge.refunded`, état affiché et rejeu sans second
  remboursement. Les scénarios locaux sont déjà validés.
- [ ] **Paiement LIVE**, après validation du compte Stripe : configurer les
  clés et le secret du webhook LIVE, puis vérifier paiement, état de commande
  et remboursement d'un faible montant.
- [ ] **Commande complète en conditions réelles** : client, commerçant,
  livreur, remise avec code ou photo ; refus, client absent, perte de réseau,
  téléphone verrouillé et tournée de plusieurs courses.
- [ ] **Accès authentifiés sur le déploiement** : deux comptes distincts pour
  les livreurs, ZupDrive et les salons Socket.IO ; retrait de droits et
  révocation de session. Compléter les scénarios de concurrence livreurs
  contre PostgreSQL réel, notamment la capacité de tournée.
- [ ] **Reversements et SEPA** : vérifier les relevés des commerçants et des
  livreurs, commissions, pourboires, report de solde et confirmation de
  versement sans double paiement, sur des données de test dédiées.
- [ ] **Pages légales publiées** : contrôler les versions en administration
  et remplacer les champs entre crochets encore présents dans les textes
  par défaut. La publication effective n'a pas été vérifiée lors de cette
  mise à jour.
- [ ] **Cartes et itinéraires** : préparer un service adapté à l'usage public
  pour remplacer les serveurs de démonstration/publics utilisés actuellement.
- [ ] **Applications mobiles** : icônes définitives, comptes des stores,
  configuration Firebase/push du livreur (accès EAS confirmé),
  essais sur appareils réels, puis soumission.
  Voir [la préparation de l'application livreur](../mobile/apps/delivery/PUBLICATION.md).

## Développements complémentaires ou reportés

- **Commandes d'entraînement** exclues des statistiques et des reversements.
  Le commerce de démonstration existant refuse les commandes ; il ne remplace
  pas ce mode d'entraînement. Un paiement Stripe TEST ne constitue pas non plus
  ce mode métier.
- **ZupDrive V2** : activer le paiement obligatoire après vérification sur le VPS avec Stripe, essai de l'app mobile passager sur téléphone avec une carte Stripe de test (écrans, formulaire de carte et nettoyage des écrans hérités de ZupEat, adresses favorites, SOS et chat faits), règles de
  facturation (émetteur de la facture, TVA), frais d'annulation éventuels
  (le remboursement d'une course non aboutie est total et automatique), et tables sans code à supprimer par migration
  (voir [`zupdrive-api-admin.md`](zupdrive-api-admin.md#routeurs-supprimés)).
- **Notifications fiables après interruption** : compléter les effets après
  paiement par une outbox transactionnelle ou un mécanisme persistant.
  Les webhooks sortants disposent déjà de relances en base ; cela ne garantit
  pas la livraison de toutes les notifications de commande.
- **Suivi des erreurs et stockage externe des images** : évaluer et configurer
  selon les besoins. Le code contient une intégration Cloudinary optionnelle ;
  sa configuration sur le VPS n'est pas attestée ici. `SENTRY_DSN` existe dans
  la configuration, sans preuve de remontée d'erreurs opérationnelle.
- **Tests de charge et plusieurs instances** : mesurer le coût des contrôles
  Socket.IO, vérifier Redis et l'invalidation des caches de permissions.
- **Notes dans l'attribution** : le dispatch départage les livreurs à la
  distance ; l'utilisation de leurs notes est un chantier complémentaire.
- **Stock par ingrédient** : volontairement reporté au profit du bouton
  disponible/épuisé.

## Comment maintenir cet état

Pour chaque validation, noter la date, le périmètre, l'environnement, le commit
s'il est attesté, le résultat et les limites. Les nombres de contrôles des
anciens passages restent des résultats datés, jamais une garantie pour tout
le dépôt actuel. Ne pas marquer une case terminée sur la seule présence du code.

Les suites générales de vérification réinitialisent leur base : les exécuter
sur une **base de test dédiée**, jamais sur la base du VPS en exploitation.
Les sondes ciblées de `backend/scripts/security/` ont leurs propres prérequis
et effets, décrits dans les audits correspondants.

## Contrôles de la mise à jour documentaire initiale

Le 4 octobre 2026, les liens locaux et les blocs de code des documents
modifiés ont été vérifiés ; `git diff --check` ne signale pas d'erreur.
Aucun code applicatif n'a été modifié.

Les règles des dossiers mobiles demandent lint et contrôle TypeScript :

- **Commerçant** : contrôle TypeScript réussi.
- **Livreur** : contrôle TypeScript en échec dans l'installation locale,
  car `expo-speech` est déclaré dans `package.json` mais absent des modules
  installés ; cela entraîne aussi une erreur de type dans `lib/voice.ts`.
- **Lint commerçant et livreur** : aucune configuration ESLint trouvée ;
  l'initialisation automatique par Expo échoue avec une erreur réseau
  `EACCES`. Le lint n'est donc pas validé.

Ces limites concernent l'environnement local et le code existant ; elles
ne sont pas une preuve d'échec de l'application déployée. Les dépendances et
la configuration de lint devront être préparées avant de valider les builds
mobiles. Aucun paquet n'a été installé pour cette mise à jour.

## Préparation mobile livreur — 4 octobre 2026

Après la mise à jour documentaire, la préparation de l'application livreur
a commencé. Les échecs locaux ci-dessus pour ce dossier ont été corrigés :
installation de `expo-speech`, ajout d'`expo-dev-client`, configuration ESLint
et corrections des hooks React. Les dépendances sont alignées sur Expo SDK 57.

- **TypeScript livreur** : réussi.
- **Lint livreur** : 0 erreur, 30 avertissements conservés et documentés.
- **Expo Doctor** : 21/21 contrôles réussis.
- **Export JavaScript Android** : réussi.
- **APK Android de test** : compilation réussie, ARM64, Android 10 minimum ;
  signature et présence de l'adresse VPS dans le JavaScript vérifiées.
  Reconstruit avec le logo bleu « Z Delivery ZupEat » choisi par l'opérateur ;
  icône inspectée et présence dans l'APK vérifiée.
- **Profils EAS** : development, preview et production pointent vers le VPS.
- **Firebase Android** : projet `zupeat-a1e82` créé avec accord de l'opérateur,
  application livreur enregistrée et API FCM V1 activée. Accès à
  `@zupone/zupeat-delivery` confirmé et clé FCM V1 attribuée. Le fichier
  Android fourni est intégré à `app.json` et au projet Android généré.
  Nouvel APK compilé avec Firebase : ressources du bon projet et signature
  vérifiées. L'essai de l'APK précédent sur son Android signale
  « Inactives » et une instance Firebase non initialisée ; les alertes ne
  fonctionnaient qu'au retour dans l'application. La configuration Firebase/FCM
  et le nouveau build sont prêts. L'opérateur confirme ensuite la réception
  d'une push ; l'affichage d'une fenêtre et la sonnerie hors application
  manquent encore dans cette première version Firebase.
- **Alertes livreur 1.0.1** : module Expo local Android pour « Nouvelle course »
  au-dessus des autres applications et sur le verrouillage, après autorisation
  explicite. Option de sonnerie avec le volume des alarmes en silencieux ;
  démonstration différée de 5 s, sans action réelle. Les propositions sont
  relues sur l'API authentifiée avant affichage, avec expiration et réponse
  par les endpoints existants. Les deux options sont désactivées par défaut ;
  aucun volume système ni règle « Ne pas déranger » n'est changé.
  Tests du payload, des propositions expirées/étrangères et des lots : 4/4.
  Correctif serveur : signal FCM de données pour réveiller Android, en plus
  de la notification visible compatible avec les anciennes versions ; 13/13
  tests ciblés, TypeScript et compilation backend réussis, sans migration.
  Correctif appliqué au VPS par SSH ; fichier notifier et source de l'image
  comparés au correctif local. API saine et `/health` répond `status: ok`.
  La source et l'image précédentes sont conservées pour un retour éventuel.
  L'affichage, le réveil et les actions restent à valider sur le téléphone.
- **Présentation livreur 1.0.2** : la fenêtre Android reprend la carte sombre
  et la fiche de proposition orange de l'application, avec montant garanti,
  trajet, adresses, arrêts et bouton d'acceptation avec délai. Leaflet embarqué,
  conservation des points de livraison obfusqués, actions visibles sur petits
  écrans. Rendu vérifié à 390 × 780 et 320 × 568 (lot et adresses longues),
  tests des alertes 6/6, TypeScript et compilation Android réussis, lint sans
  erreur avec 30 avertissements existants. APK ARM64 code 3 signé et comparé
  aux ressources sources ; essai sur téléphone encore nécessaire. Le correctif
  serveur déjà déployé suffit, sans nouveau déploiement.
- **Appareils réels** : l'opérateur dispose d'un Android, aucun téléphone
  connecté pendant la préparation ; installation, GPS, curseur de remise,
  notifications et parcours hors connexion restent à essayer.

Voir [le compte rendu du livreur](../mobile/apps/delivery/VALIDATION.md)
pour la compilation native et les essais à réaliser. Ces corrections ne
valident ni les autres applications mobiles ni les parcours du VPS.

## Étape 02 — A03 remboursements durables

**9 octobre 2026 — code `6e8139e8cf821690395c61692658f40cc499905e`.** Le paiement
reçu après refus ou abandon inscrit son remboursement dans la transaction métier
avant acquittement du webhook. Le worker PostgreSQL réconcilie Stripe hors
transaction avec une clé persistante, et distingue création/pending de succès.
Les reprises de worker, événements désordonnés, concurrence et réponses perdues
sont couvertes par des tests avec PostgreSQL réel et Stripe simulé. La liste de
revue et l'alerte incluent les commandes sans ID de remboursement ; la reprise
est réservée aux droits billing write et auditée.

| État | Date et environnement | SHA / preuve |
|---|---|---|
| Développé | 2026-10-09, branche `codex/a03-remboursements-durables` | `6e8139e8cf821690395c61692658f40cc499905e` ; [code/tests/migration](https://github.com/AmirGames/projet/commit/6e8139e8cf821690395c61692658f40cc499905e) |
| Testé localement | 2026-10-09, cloud/Linux/PostgreSQL 16 | **3 004 réussis, 36 ignorés**, 165 suites passées / 3 ignorées ; paiements 101/101, A03/permissions 29/29, types/lint/build ; [preuves et limites](preuves-a03-2026-10-09.md) |
| Proposé en PR | 2026-10-09 | [PR #202 en brouillon](https://github.com/AmirGames/projet/pull/202) ; CI déclenchée par la PR, résultat non attesté au moment de cette livraison |
| Intégré | 2026-10-09, branche principale | `564f63dbba5c2c9fe3b6a8b5865d98139b84e9b1`, fusion de [PR #202](https://github.com/AmirGames/projet/pull/202), constatée au départ A04 |
| Déployé | Non exécuté | Aucun déploiement A03 ni migration VPS |
| Validé en exploitation | Non exécuté | Stripe TEST externe, réception des alertes et VPS restent à valider |

La migration additive inscrit les historiques en examen sans nouvel appel
Stripe. Sa conservation des montants/états a été testée sur PostgreSQL ; le CLI
natif Prisma migrate/diff reste bloqué localement par `binaries.prisma.sh` (HTTP
403). Le build utilise le compilateur WASM installé, avec préchargement temporaire
pour éviter le téléchargement anticipé. Le runner Stripe TEST et la procédure
sont préparés, **non exécutés**, faute de configuration externe. Aucun mouvement
LIVE, aucune fusion ou aucun déploiement réalisés. Voir le
[guide de reprise/migration/API](REMBOURSEMENTS-REPRISE.md), le
[README backend](../backend/README.md) et les [preuves datées](preuves-a03-2026-10-09.md).
Les audits antérieurs restent des résultats historiques.

## Étape 03 — A04 concurrence des versements

Paiement manuel, annulation du relevé et préparation du lot revendiquent le
relevé sous `PENDING` et lot nul, avec exactement une ligne modifiée. L'annulation
protège le relevé et la libération de ses courses/pourboires ensemble. Confirmation,
refus et abandon contrôlent toutes les lignes et montants de la copie bancaire ;
un conflit annule la transaction complète. L'interface relit les états après 409.
Diagnostic en lecture seule et rapprochement historique préparés.

| État | Date et environnement | SHA / preuve |
|---|---|---|
| Développé | 2026-10-09, Windows, branche dédiée A04 | `6c25dac0271e65ff0db29427bb37898a6b8bcfc7` ; [commit code/tests](https://github.com/AmirGames/projet/commit/6c25dac0271e65ff0db29427bb37898a6b8bcfc7), [comportement](VERSEMENTS-CONCURRENCE.md) |
| Testé localement | 2026-10-09, PostgreSQL 18 isolé, `a04_final_test` | Versements **40/40**, dont A04 **16/16** ; backend **3 004 réussis / 52 ignorés** ; frontend **200/200** ; types/lint/build backend et frontend ; [preuves et limites](preuves-a04-2026-10-09.md) |
| CI / PR | 2026-10-09, Ubuntu / PostgreSQL 16, PR ouverte | **9 jobs réussis** au SHA `44008e82a9c0e7a064c527b9c3a661921bbfd7df` : backend, frontend, 6 applications mobiles, E2E ; A04 **16/16** sur `payouts_test`, parcours navigateur versements **37/37** ; [CI #196](https://github.com/AmirGames/projet/actions/runs/37979276245), [PR #203](https://github.com/AmirGames/projet/pull/203) |
| Intégré | Non exécuté | Aucun SHA d'intégration A04 |
| Déployé | Non exécuté | Aucun déploiement A04 ; aucune migration propre à cette étape |
| Validé en exploitation | Non exécuté | Accès de lecture VPS et pièces bancaires nécessaires au rapprochement des historiques |

La PR A03 #202 est intégrée au SHA de départ `564f63db` ; aucune dépendance
A04 non intégrée identifiée. Aucun virement réel, fusion ou déploiement réalisés.
Les cases de priorités ci-dessus restent des demandes, pas des preuves.
Consulter le [guide API/configuration/tests/exploitation et rapprochement](VERSEMENTS-CONCURRENCE.md),
les README [backend](../backend/README.md) / [frontend](../frontend/README.md) et
les [preuves datées](preuves-a04-2026-10-09.md). Les audits précédents sont conservés.

## Étape 04 — A05 MFA des comptes privilégiés

Le 10 octobre 2026 : MFA TOTP des superowners et équipes administratives EAT/DRIVE,
contrôle serveur de session et fraîcheur de cinq minutes pour actions sensibles,
interfaces web/admin Expo, récupération atomique et secours opérateur tracé.
Le guide [MFA](MFA.md) détaille périmètre, contrats, migration et exploitation.
La base A04 est intégrée (PR 203, `e66cd0e3f676b7e06c2d783dc53e71f780b41128`).

| État A05 | Date, environnement et preuve |
|---|---|
| Développé | 10 octobre 2026, branche locale A05 ; SHA et PR dans les [preuves datées](preuves-a05-2026-10-10.md) |
| Testé | Local Windows / PostgreSQL 18 : 17 tests MFA, 204 frontend, types/lint/builds et parcours web/admin Expo ; détails et limites dans les preuves |
| CI | 10 octobre 2026, code `7a2fe706`, [10/10 jobs réussis](https://github.com/AmirGames/projet/actions/runs/38038362129), dont MFA PostgreSQL et navigateur web/admin Expo ; détails dans les preuves |
| Intégré | 10 octobre 2026, [PR #204](https://github.com/AmirGames/projet/pull/204) fusionnée dans `claude/awesome-ride-m9lci8` sous `54592aeb5a5f31f87e15ab6131068de28609f4c4` ; complément de preuves déjà présent sous `2e32d9ccf46104f554efb82b87a6810b4b95c170` |
| Déployé | Non déployé, migration et configuration VPS non exécutées |
| Validé en exploitation | Non : enrôlement nominatif, secours, domaines réels et appareils Android/iOS à exercer |

Le mode préparatoire `enrollment` n'est pas l'obligation MFA : activer `enforced`
sur toutes les instances seulement après préparation documentée des titulaires
et du secours. Les audits historiques ci-dessus conservent leur date.
