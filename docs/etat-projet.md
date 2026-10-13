# État du projet et travail restant

> **Point de situation — 13 octobre 2026.** Les statuts ci-dessous sont des relevés historiques par SHA et environnement, pas une certification du HEAD actuel. Les correctifs A02/A03 doivent être soumis à des tests d'accès croisé et à une CI réussie sur leur SHA. Aucune validation de commande réelle complète, d'exploitation, de Stripe TEST/3DS externe ou de terminal physique n'est déduite d'une fusion GitHub. Les preuves manquantes sont détaillées dans [A16](RECETTE-PILOTE-A16-2026-10-12.md).


> **A03 — 13 octobre 2026 :** [correctifs initiaux des permissions sur les commandes](A03-SECURITE-COMMANDES.md). En attente des tests multi-tenant et de la CI ; ne pas considérer le parcours complet validé.


> **A02 — Investigation ouverte le 13 octobre 2026 :** [revue statique des autorisations](SECURITE-A02-2026-10-13.md), scénarios à reproduire avant correction. Aucune vulnérabilité confirmée, aucun test exécuté, aucun déploiement revendiqué.


> **Actualisation documentaire du 13 octobre 2026 :** [baseline A01](audit-rea-ubereats.md). Le pilote reste non validé en exploitation ; aucune nouvelle exécution de test ni preuve serveur n'a été produite pendant cette actualisation.


## État courant — 12 octobre 2026

La version A16 examinée est intégrée à `claude/awesome-ride-m9lci8` au commit
`6439e36a51c6262b4781937c217a4063df6a90db` (PR #222). Le compte rendu de
recette ci-dessous décrit un pilote fermé ZupEat avec ZupDrive explicitement
exclu. **Décision : bloqué pour démarrer la recette utilisateur**, faute de
SHA/environnement accessible, base représentative et preuves des parcours
externes. Le résultat CI ne prouve ni déploiement ni exploitation. Les audits
A01–A16 restent datés ; consulter [la décision et sa matrice A01–A16](RECETTE-PILOTE-A16-2026-10-12.md).
Les états « développé », « testé », « intégré », « déployé » et « validé en
exploitation » sont indépendants. Le [registre spécialisé de lancement UE](registre-lancement-ue.md)
reste la liste de conformité et ne constitue pas une preuve à lui seul.

## Étape 16 — A16 : vérification du pilote et décision de lancement

| État | Date, SHA, environnement | Preuve |
|---|---|---|
| Développé | 12 octobre 2026, branche `claude/awesome-ride-m9lci8-a16-config-docs`, code initial `7ba6fab46a1129508cb1a66541e5e809a54c44ee`; dernière tête avant fusion `3085ff4dc09974fc99d6c7361cff79fbe67dff15` | Configuration backend, stockage privé vérifié au démarrage, sonde SQL en lecture seule, CSP progressive et guide [CONFIGURATION-A16](CONFIGURATION-A16.md) |
| Testé localement | 12 octobre 2026, Windows, SHA testé `be7f6c5ceba3aedd2a7ed3e18b58b26447e25be9`, Node 24.21.0, npm 12.0.2, Prisma 7.10.0, Next.js 16.4.0 | Backend config/Stripe/dépendances activées/stockage **10/10**; TypeScript, lint complet backend et build réussis; frontend TypeScript et lint ciblé réussis; assertions CSP Node et liens Markdown réussis. Jest/build frontend bloqués par le binding natif SWC absent. Cette preuve locale précède des commits A16 ultérieurs. |
| Testé en CI | 12 octobre 2026, GitHub Actions, head PR `3085ff4dc09974fc99d6c7361cff79fbe67dff15` | **11/11 jobs réussis** : build backend/frontend, migrations PostgreSQL base vide, A01/A02/A09, A04/A05, E2E navigateur, types/lint mobiles et suites mobiles sélectionnées; [run 38287957646](https://github.com/AmirGames/projet/actions/runs/38287957646). Stripe est coupé dans l'E2E. |
| Intégré | 12 octobre 2026 | [PR #222 fusionnée](https://github.com/AmirGames/projet/pull/222), merge commit `6439e36a51c6262b4781937c217a4063df6a90db` |
| Déployé | Non établi | Aucun SHA d'environnement ni image active fournis |
| Validé en exploitation | Non établi | Aucune base de recette représentative, navigation web live, Stripe TEST/3DS externe ou appareil lié à ce SHA |

ZupDrive est explicitement hors périmètre du pilote ; voir la [décision A16](RECETTE-PILOTE-A16-2026-10-12.md#périmètre-décidé).
La PR A15 #221 est intégrée avant la PR #222. La CI A16 et la vérification
locale sont des preuves distinctes et n'attestent pas le serveur. Les dates des
audits antérieurs restent conservées.

## Étape 14 — A15 : rapports bornés et coûts de lecture (12 octobre 2026)

| État | Date | SHA / environnement | Preuve |
|---|---|---|---|
| Développé | 12 octobre 2026 | Code `f87c42e9055bb1237a6ce09dc096e7c1cb06ff66` sur base `0dad7379e89128ee143a226341e46b6ed2bb005c`; PR synchronisée avec cible `02111181197407ed8cc0829c90fab008d6eaa874` | [PR A15 #221 en brouillon](https://github.com/AmirGames/projet/pull/221), agrégations PostgreSQL, bornes/pagination API, UI et protocole [A15](RAPPORTS-A15.md) |
| Testé localement | 12 octobre 2026, partiel | SHA testé `f87c42e9055bb1237a6ce09dc096e7c1cb06ff66`, Windows, Node 24.21.0/npm 12.0.2, Prisma/client 7.10.0 | Backend : typecheck, lint, build et 130 tests ciblés réussis. Frontend : typecheck et lint ciblé réussi. Lint global échoue sur 6 avertissements `coverage/`; build bloqué par SWC natif manquant. Types mobile bloqués par `@types/jest` absent, lint par ESLint absent. SQL/charge non exécutés |
| Intégré | 12 octobre 2026 | [PR #221 fusionnée](https://github.com/AmirGames/projet/pull/221), merge commit `32b6251c65dacf2ffd2a3d48797edab49eb17b90` |
| Déployé | Non établi | SHA d'environnement absent | Aucune preuve |
| Validé en exploitation | Non établi | Copie représentative / instance instrumentée absente | Aucune preuve |

Le rapport A15 conserve l'authentification et le cloisonnement existants et
n'ajoute aucun cache de droits. Les agrégats financiers incluent tout le
périmètre demandé malgré la pagination. Les plans `EXPLAIN`, mesures mémoire,
latence/débit et comparaisons SQL restent à faire sur une base représentative;
aucune capacité n'est revendiquée. La base A12 est déjà intégrée par la [PR
#220](https://github.com/AmirGames/projet/pull/220); aucune dépendance à la branche
locale A14 (sonde santé) n'est requise.

## Étape 11 — A08 : sauvegardes distantes et restauration (12 octobre 2026)

| État | Date | SHA / environnement | Preuve |
|---|---|---|---|
| Développé | 12 octobre 2026 | Branche `claude/awesome-ride-m9lci8-a08-backup-restore`, commit d'implémentation `990db45c` sur la base `18e2503e2e792323c9e74445b89baa8d60900fe4` | Script, contrats de statuts, seuil santé, protections API/UI et [procédure A08](SAUVEGARDES-RESTAURATION-A08.md) |
| Testé localement | 12 octobre 2026 | Windows, Node `24.21.0`, npm `12.0.2`, backend Prisma `7.10.0`, Jest `30.5.2`, frontend Next `16.4.0` | Backend A08 + Vigie **24/24** ; tests contractuels Bash avec doubles **7 cas (5 injections)** ; bash -n, TypeScript backend/frontend, lint backend/frontend ciblé et build backend réussis. Build frontend bloqué avant compilation : binding SWC natif Windows absent. Voir les limites ci-dessous. |
| Intégré | 12 octobre 2026 | [PR #217 fusionnée](https://github.com/AmirGames/projet/pull/217), merge commit `b303ac0b2a45ee224216b479089bc083e94ae0c2` |
| Déployé | Non | Aucun accès serveur accordé dans cette session | Aucune preuve |
| Validé en exploitation | Non | Bucket/identité de restauration/base isolée non accessibles | Aucune preuve ; consulter les prérequis dans la procédure A08 |

Le commit `COMPLETED` n'est écrit qu'après copie distante vérifiée des deux
archives et publication du manifeste. Une absence de destination ou une erreur
retourne un code non nul en politique production, conserve le local en
`REMOTE_FAILED` et laisse la sauvegarde hors du contrôle de santé. Le mode
explicitement local conserve `LOCAL_ONLY`. Le contrôle de fraîcheur est à 24 h
(RPO de travail), en panne au-delà de 48 h. La cible RTO de 8 h est provisoire
et non mesurée. Aucun exercice sur une base de test ou contrôle applicatif
restauré n'a pu être exécuté pendant le relevé local initial. La PR A08 #217
est depuis intégrée (merge `b303ac0b2a45ee224216b479089bc083e94ae0c2`) ; cela
n'ajoute aucune preuve de copie distante ou restauration du serveur. Le RPO/RTO
doit être approuvé et réévalué après mesures réelles.

Les sept cas mockés couvrent destination absente, mode local explicite,
transfert interrompu, erreur de lecture rclone, objet tronqué, publication
distante valide et archive age corrompue ; ils ne contactent aucun fournisseur et ne remplacent pas un test
age/rclone réel. `rclone` et `age` sont absents localement ; aucun serveur,
bucket ou PostgreSQL isolé n'est connecté. Le build frontend `next build` n'a
pas démarré, car `@swc/core` ne trouve pas son binding `swc.win32-x64-msvc.node`
et sa cache native locale échoue au contrôle ACL. Aucun test d'intégration
distante, restauration réelle, déploiement ou validation en exploitation n'est
revendiqué ; l'intégration #217 est consignée ci-dessus. Le run CI A16 applique
les migrations sur base vide mais ne teste pas une restauration A08.

## Étape 10 — A07 : facturation structurée et pages légales (12 octobre 2026)

Le code de génération UBL existant ne suffit pas à attester le transport ou la
conformité réelle. A07 rend le choix d'un fournisseur explicite : sans
`PEPPOL_PROVIDER`, pas d'envoi ; une valeur inconnue est refusée. Les données
UBL vides, non finies, négatives ou avec un taux de TVA hors bornes sont
refusées. Il n'existe toujours pas d'adaptateur fournisseur ni de réception,
d'accusés, de rapprochement ou de reprise automatique en sandbox. Les sources
officielles Belgique/France et les opérations requises figurent dans le
[guide A07](FACTURATION-STRUCTUREE-A07.md). Les pages publiques et versions
acceptées n'ont pas été accessibles/attestées ; les données opérateur et l'avis
du comptable sont à obtenir avant publication et ouverture.

| État | Date | SHA / environnement | Preuve |
|---|---|---|---|
| Développé | 12 octobre 2026 | Branche `claude/awesome-ride-m9lci8-a07-facturation-structuree`, commit code `d6c9480a92a1ea1ce1a577e609fb1be040efc765`, base `0dad7379e89128ee143a226341e46b6ed2bb005c` | Refus fournisseur inconnu/incomplet ; entrées UBL gardées ; guide A07 |
| Testé localement | 12 octobre 2026 | Commit tests `516fee48d619cc4a37da7f8e94f20334c70efb3e` (code applicatif `d6c9480a92a1ea1ce1a577e609fb1be040efc765`), Windows, Node 24.21.0, npm 12.0.2, Prisma/client 7.10.0 | Jest facturation 15/15 (TVA 6/12/21 %, EUR) et droits/journalisation 177/177 ; typecheck, lint, build backend réussis. Sandbox/réception externe et validation EN 16931 non exécutées. |
| CI GitHub | 12 octobre 2026 | Head observé `7bc79199993f6082759c878cf240c132275cbf27` | Run [38179656367](https://github.com/AmirGames/projet/actions/runs/38179656367) en attente lors de la vérification. |
| Intégré | 12 octobre 2026 | [PR #216 fusionnée](https://github.com/AmirGames/projet/pull/216), merge commit `d4cd525f6b806965fc328fc594fe5f4e51f80fe8` |
| Déployé | Non | Aucun environnement confirmé | Aucune |
| Validé en exploitation | Non | Fournisseur/opérateur/sandbox indisponibles | Aucune ; essais externes bloqués |

## Étape 08 — A06 : contrat de l’application chauffeur ZupDrive (11 octobre 2026)

| État | Date | SHA / environnement | Preuve |
|---|---|---|---|
| Développé | 11 octobre 2026 | Branche `claude/awesome-ride-m9lci8-a06-zupdrive-driver`, commit `15f53d14d4c10ac709b168296e4241ce0c4ea381`, base `db38c1cdfe62dfa46a8933fc6d8d1eb43116b544` | `mobile/apps/zupdrive-driver/lib/chauffeur.ts`, écran `app/index.tsx`, test d’URLs, [README mobile](../mobile/apps/zupdrive-driver/README.md). Dépendance rotation auth A09 intégrée par [PR #209](https://github.com/AmirGames/projet/pull/209), merge `6fdb546c8bbbe9af61de00777051f17b9a81e5aa` |
| Testé localement | 11 octobre 2026 | SHA `15f53d14d4c10ac709b168296e4241ce0c4ea381`, Windows, Node 24.21/npm 12, Expo `~57.0.25` | Mobile : typecheck, lint, export Expo web et Jest **49/49** ; test montage routeur **4/4** ; intégration PostgreSQL tentée mais échec d’authentification à la base `.env.test` (25 cas bloqués) |
| Testé en CI | En attente | Contrôle de statut du 11 octobre sur le head PR `28246c45187f08930d600de04824a8a9725b0d8b` | Aucun statut CI n’était publié au relevé ; [PR A06](https://github.com/AmirGames/projet/pull/212) |
| Intégré | 12 octobre 2026 | [PR #212 fusionnée](https://github.com/AmirGames/projet/pull/212), merge commit `9869e32d16ef27b3909f8eb196ab629172c09d1f` |
| Déployé | Non | Aucun environnement A06 confirmé | Aucune preuve |
| Validé en exploitation | Non | Aucun appareil/backend réel de test observé | Aucune preuve |

L’ancien OTP fictif, l’historique passager utilisé par le chauffeur et l’URL d’acceptation inexistante sont remplacés par l’auth commune, le tableau chauffeur et l’acceptation par ID de proposition. Les états non validés bloquent la disponibilité. Les appels chauffeur, étapes, position au premier plan, revenus et tests d’URL sont documentés dans le [contrat mobile](../mobile/apps/zupdrive-driver/README.md). Le dossier, l’acceptation concurrente et les droits restent à prouver contre PostgreSQL : l’accès `.env.test` configuré a répondu par échec d’authentification et aucun secret n’a été modifié. L’essai sur appareil/émulateur reste à faire selon le guide ; l’app est **hors périmètre du pilote** jusque-là. Il n’y a pas de migration pour A06.
## Étape 09 — A11 : exécution des webhooks sortants ZupDrive (11 octobre 2026)

Le transport persistant, la signature, le worker supervisé, l'inspection et la
reprise autorisée sont développés. Les intentions sont créées avec l'événement
dans une transaction et la prise PostgreSQL est atomique. Aucun service métier
ZupDrive ne déclenche aujourd'hui ces événements : `ZUPDRIVE_WEBHOOKS_ENABLED`
reste donc `false`, l'intégration est hors périmètre fonctionnel et aucun succès
en production n'est annoncé. Les tests et leur état réel figurent dans le
[contrat A11](WEBHOOKS-ZUPDRIVE-A11.md).

| État | Date | SHA / environnement | Preuve |
|---|---|---|---|
| Développé | 11 octobre 2026 | branche `claude/awesome-ride-m9lci8-a11-drive-webhooks`, SHA `633f3afd52b38b76d595213a0fa434c8abd84c02` | Service, migration et procédure A11 |
| Testé localement | 11 octobre 2026 | SHA `633f3afd52b38b76d595213a0fa434c8abd84c02`, Windows, Node 24.21.0, npm 12.0.2, Prisma/client 7.10.0 | 63/63 tests ciblés ; Prisma validate, TypeScript, lint et build backend réussis |
| CI GitHub | 11 octobre 2026, run courant en attente | [#38176898421](https://github.com/AmirGames/projet/actions/runs/38176898421), head `6c256ebeb9e7f995beb82d3d67fa5aa0fd96df0a` | Le run précédent #38176640071 a été annulé après la mise à jour documentaire ; aucune validation CI finale revendiquée |
| Intégré | 12 octobre 2026 | [PR #215 fusionnée](https://github.com/AmirGames/projet/pull/215), merge commit `05acf2dc4564451d316ca16531d8897957f94901` |
| Déployé | Non déployé | VPS inchangé | Aucune |
| Validé en exploitation | Non validé ; flag désactivé | Aucun environnement de recette | Aucune |

## Étape 07 — A13 : contrats API, parcours et CI (11 octobre 2026)

| État | Date | SHA / environnement | Preuve |
|---|---|---|---|
| Développé | 11 octobre 2026 | branche dédiée A13, base `b73707d39abf56241aa06e0fcef14d104aaab9f8` | [contrat HTTP, matrice, CI, exclusions et procédures](CONTRATS-API-A13.md) |
| Testé localement | 11 octobre 2026, partiel | Windows, Node 24.21/npm 12, contenu A13 basé sur `b73707d39abf56241aa06e0fcef14d104aaab9f8` | Contrats/paiement **51/51**, couverture route/service mesurée et seuils satisfaits; backend build/typecheck/lint réussis; Delivery tests **16/16**, types/lint réussis; YAML et liens vérifiés |
| Testé CI | 11 octobre 2026, GitHub Actions / Ubuntu / PostgreSQL 16 | SHA `bb3c3d2b9e221e6216920e8afd5ab923368ae2c8`, 11 jobs réussis | [run #38158760374](https://github.com/AmirGames/projet/actions/runs/38158760374) : backend/tests/couverture/build, PostgreSQL dédié, E2E, MFA, types/lint sur six apps et tests Customer/Merchant/Delivery/ZupDrive Passenger |
| Tests locaux non exécutables | 11 octobre 2026, Windows | Jest/types Customer/Merchant absents localement; aucun PostgreSQL/Docker local | Les suites concernées passent dans la CI ci-dessus; aucun succès local n'est revendiqué |
| Non exécuté localement / externe | 11 octobre 2026 | Pas de PostgreSQL/Docker local; Jest/types Customer/Merchant incomplets localement; aucune configuration Stripe TEST ou appareil disponible | Les suites PostgreSQL passent en CI; Stripe TEST/3DS interactif et essais sur appareil restent non exécutés |
| Intégré | 11 octobre 2026 | [PR #211 fusionnée](https://github.com/AmirGames/projet/pull/211), merge commit `5250ad7369beddbe16810f3cd0e7ec62a72ae50c` |
| Déployé | Non exécuté | Aucun environnement A13 confirmé | Aucune preuve |
| Validé en exploitation | Non exécuté | Stripe TEST externe, 3DS et appareils restent à exécuter | Aucune preuve |

La CI ajoute un PostgreSQL dédié au cycle des inscriptions, liens,
renouvellements et à une concurrence de livraison. Le run GitHub du SHA
`bb3c3d2b9e221e6216920e8afd5ab923368ae2c8` a réussi ses 11 jobs. Le test HTTP de paiement et le scénario
`requires_action` sont simulés; ils ne constituent pas une preuve Stripe
TEST/3DS. Voir les suites exclues, commandes et procédure externe dans
[CONTRATS-API-A13.md](CONTRATS-API-A13.md).

## Étape 06 — A09 : rotation atomique des sessions (10 octobre 2026)

| État | Date | SHA / environnement | Preuve |
|---|---|---|---|
| Développé | 10 octobre 2026 | PR #209, branche `claude/awesome-ride-m9lci8-a09-refresh-ci`, correctif `4a69a161175fb6e591821955bcaaca4780c06cae` sur la base A09 `1405a3da` | [contrat A09](ROTATION-SESSIONS-A09.md), code et migration |
| Testé | 10 octobre 2026, partiel | CI du commit `1405a3da` : build backend, migration et build frontend réussis, parcours navigateur échoué ; correctif ciblé : route auth 40/40, typecheck/lint frontend et lint backend réussis | [job E2E en échec](https://github.com/AmirGames/projet/actions/runs/38085740711/job/114311729021) ; le test Jest du relais n'a pas pu démarrer localement (chargement binding natif SWC impossible sous Windows) |
| Intégré | 11 octobre 2026 | Merge `6fdb546c8bbbe9af61de00777051f17b9a81e5aa` | [PR #209 fusionnée](https://github.com/AmirGames/projet/pull/209) |
| Déployé | non | aucun environnement confirmé | aucune preuve |
| Validé en exploitation | non | aucun environnement confirmé | aucune preuve |

La demande A09 et un build vert ne constituent pas une preuve de parcours réussi.
La CI de `1405a3da` a échoué sur plusieurs scénarios navigateur dont les
connexions, car le relais web filtrait `X-Refresh-Request`; le correctif de la branche PR #209 transmet l'en-tête et conserve
`requestId` lors de la validation du corps (commit `4a69a161`). Le test PostgreSQL attend une base dont le nom
contient `test` ; elle n'a pas été exécutée localement. Le test Jest frontend
du relais est ajouté, mais son exécution locale reste bloquée par le binding
natif SWC ; le contrôle backend ciblé, les types/lint frontend et le lint backend
passent. Le job CI doit être relancé sur le correctif avant de conclure. Voir
les commandes et limites dans [ROTATION-SESSIONS-A09.md](ROTATION-SESSIONS-A09.md). Mise à jour du registre au 11 octobre : la PR #209 a été fusionnée au SHA `6fdb546c8bbbe9af61de00777051f17b9a81e5aa`; elle satisfait la dépendance d’auth commune utilisée par A06. L’audit daté des échecs CI initiaux est conservé.

## Étape 05 — A10 : liens de compte (10 octobre 2026)

| État | Date | SHA / environnement | Preuve |
|---|---|---|---|
| Développé | 10 octobre 2026 | branche `claude/awesome-ride-m9lci8-a10`, commit `acd9b600d345d7968f4b24b7ecc0cbe69bd92fbe` ; base `abd2d1e` | [code et contrat](LIENS-COMPTE-A10.md) |
| Testé | 10 octobre 2026 | Windows local, PostgreSQL `a10_test` isolé et migré | [commandes et résultats](preuves-a10-2026-10-10.md) : 2 987 tests backend passés, 91 ignorés ; types, lint, build passés |
| Intégré | 11 octobre 2026 | [PR #208 fusionnée](https://github.com/AmirGames/projet/pull/208), merge commit `5c51fddd4882e7f720a201b620cb0ad915ee9b0e` |
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
| Intégré | 10 octobre 2026 | [PR #203 fusionnée](https://github.com/AmirGames/projet/pull/203), merge commit `e66cd0e3f676b7e06c2d783dc53e71f780b41128` |
| Déployé | Non exécuté | Aucun déploiement A04 ; aucune migration propre à cette étape |
| Validé en exploitation | Non exécuté | Accès de lecture VPS et pièces bancaires nécessaires au rapprochement des historiques |

La PR A03 #202 (merge `564f63dbba5c2c9fe3b6a8b5865d98139b84e9b1`) est intégrée ;
A04 l'est par PR #203 au merge `e66cd0e3f676b7e06c2d783dc53e71f780b41128`.
Aucun virement réel ou déploiement n'est attesté.
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

## Étape 12 — A14 : indicateurs de santé représentatifs (12 octobre 2026)

La liveness ne dépend que du processus. La readiness générale vérifie PostgreSQL
et Redis en production, avec états publics expurgés; ClamAV est un état propre au
dépôt de documents, qui reste refusé en absence d'antivirus. SMTP et les services
externes ne retirent pas la readiness. Les délais, cache, matrice, seuils et
procédures sont dans [DEPENDANCES-SANTE](DEPENDANCES-SANTE.md).

| État | Date, SHA, environnement | Preuve |
|---|---|---|
| Développé | 12 octobre 2026, branche `claude/awesome-ride-m9lci8-a14-health`, commit `55a7d90113d814c7a23f3aac400317a9110dafe0`, base `b303ac0b2a45ee224216b479089bc083e94ae0c2` | Contrats liveness/readiness, sondes PostgreSQL/Redis PING/ClamAV, retrait des dépendances Redis/ClamAV au démarrage du backend; [commit code A14](https://github.com/AmirGames/projet/commit/55a7d90113d814c7a23f3aac400317a9110dafe0) |
| Testé localement | 12 octobre 2026, Windows, Node 24.21.0, npm 12.0.2, Prisma 7.10.0 | Tests ciblés **11/11**, routes publiques **5/5**, TypeScript, lint et build backend réussis sur le commit code; Docker daemon absent, donc coupures PostgreSQL/Redis/SMTP sur instance isolée et réception d'alertes non éprouvées |
| CI / PR | 12 octobre 2026, GitHub | [PR #218](https://github.com/AmirGames/projet/pull/218), branche synchronisée avec base à la création; aucun statut CI publié au relevé |
| Intégré | 12 octobre 2026 | [PR #218 fusionnée](https://github.com/AmirGames/projet/pull/218), merge commit `adb811805afe38ffe7a4dc6b90406bfe8b618708` |
| Déployé | Non | Aucun déploiement ni migration A14 |
| Validé en exploitation | Non | Aucune instance isolée avec coupures des quatre dépendances; aucune réception d'alerte vérifiée |

Le relevé local A14 et l'absence de statut CI correspondent à l'instantané
initial. La PR #218 est depuis intégrée au merge
`adb811805afe38ffe7a4dc6b90406bfe8b618708`; cela ne prouve pas le déploiement,
les coupures isolées ni la réception d'alertes. Ces états restent distincts.

## Étape 13 — A12 : audit et correction des dépendances (12 octobre 2026)

| État | Date / SHA | Environnement et preuve |
|---|---|---|
| Développé | 12 octobre 2026, [SHA `e4d55431c13dd927b16960693c3b9c68fe4b348d`](https://github.com/AmirGames/projet/commit/e4d55431c13dd927b16960693c3b9c68fe4b348d), branche `claude/awesome-ride-m9lci8-a12-dependances` | Worktree isolé à partir du tronc `adb811805afe38ffe7a4dc6b90406bfe8b618708`; overrides et lockfile backend |
| Testé localement | 12 octobre 2026, [SHA `e4d55431c13dd927b16960693c3b9c68fe4b348d`](https://github.com/AmirGames/projet/commit/e4d55431c13dd927b16960693c3b9c68fe4b348d) | Node 24.21.0/npm 12.0.2; `npm ci`, génération Prisma 7.10.0, lint et build réussis; simulation `npm ci --omit=dev` et audit runtime à zéro. Jest local bloqué par l’absence d’identifiants PostgreSQL valides. |
| Testé en CI | 12 octobre 2026, SHA `b4ee2888ac20cf0dffd40d4c2ca823870cde04b0` | 11/11 checks réussis, migrations PostgreSQL dédiées et E2E inclus : [run 38265964207](https://github.com/AmirGames/projet/actions/runs/38265964207). |
| Intégré | 12 octobre 2026 | [PR #219 fusionnée](https://github.com/AmirGames/projet/pull/219), merge commit `374229621ee573ccee8ad06391851655b3a8da89` |
| Déployé | Non | Aucun déploiement effectué |
| Validé en exploitation | Non | Aucune instance de production ni image exécutée |

Les migrations sur bases vides et les suites PostgreSQL du workflow ont réussi;
le scan et la construction de l’image OCI production ainsi que la mise à niveau
d’une base préexistante ne sont pas couverts par ce run. Les 6 lockfiles mobiles conservent
des alertes de production, suivies à part avec échéance de revue. Voir
[l’inventaire détaillé, chemins et limites A12](AUDIT-DEPENDANCES.md). Il n’y a
pas de changement d’API, de schéma, de permission ou de configuration métier.

