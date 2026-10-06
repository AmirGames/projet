# Plan de correction fusionné et priorisé

Date : 6 octobre 2026. Code de référence : `a4fc20d` (branche `claude/analyse-ca-hoh6i9`).

## 1. Sources fusionnées

| Sigle | Document | Contenu retenu |
|---|---|---|
| **M** | `docs/audit-complet-2026-10-06.md` (audit interne) | Fuites de données publiques, revue des routes, exploitation |
| **B** | Audit externe du 6 octobre (commit `310de4c`), constats F1 à F10 | Cloisonnement, droits, CI, mobile, dépendances |
| **A** | Audit externe du 5 octobre (commit `038d6fa`), constats F01 à F16 | Argent, concurrence, idempotence, sessions, exploitation |

**Niveau de preuve.** J'ai vérifié dans le code actuel tous les constats marqués ✔. Les autres sont repris des audits, avec le niveau de preuve qu'ils indiquent.

**Les trois audits se complètent peu :**
- M et B couvrent surtout la confidentialité et le cloisonnement.
- A couvre l'argent, la concurrence et la fiabilité des opérations.
- Les recoupements sont fusionnés ci-dessous : l'énumération d'e-mails (A-F11 et B-F10), les conteneurs en root (M et A), la formule de délai de `maps` (M et A).

## 2. Tableau des constats fusionnés

Gravité : **P0** = à corriger avant tout autre travail, **P1** = prioritaire, **P2** = important, **P3** = dette.
Effort : **S** (< 1 jour), **M** (1 à 3 jours), **L** (> 3 jours).
Pour **S/M/L**, ce sont des ordres de grandeur, pas des engagements.

| ID plan | Sujet | Sources | Gravité | Effort | Preuve |
|---|---|---|---|---|---|
| C-01 | `GET /api/stores/:id` public renvoie 10 commandes avec données clients | M | **P0** | S | ✔ lecture |
| C-02 | `GET /api/stores/org/:orgId` public (produits brouillons, champs internes) | M | **P0** | S | ✔ lecture |
| C-03 | Secret client Stripe renvoyé aux commerçants | B-F2 | P1 | S | ✔ lecture |
| C-04 | Commerce suspendu qui reçoit encore des commandes invitées | A-F01 | P1 | S | ✔ lecture |
| C-05 | Temps réel non cloisonné par boutique | B-F1 | P1 | M | ✔ lecture |
| C-06 | Remboursement `pending` enregistré comme `REFUNDED` | A-F03 | P1 | M | ✔ lecture |
| C-07 | Remboursements partiels absents des reversements | A-F04 | P1 | L | lecture |
| C-08 | Deux arrêtés simultanés → deux relevés | A-F02 | P1 | M | lecture |
| C-09 | Export SEPA sans lot durable et réservé | A-F15 | P1 | L | lecture |
| C-10 | Commande payée jamais annoncée après interruption | A-F07 | P1 | M | ✔ lecture, reproduit (A) |
| C-11 | Transitions de statut de commande incomplètes | B-F3 | P1 | M | ✔ lecture |
| C-12 | STAFF peut modifier réglages légaux et commerciaux | B-F4 | P1 | S | ✔ lecture |
| C-13 | Promotion limitée à certains produits réduit tout le panier | A-F05 | P1 | M | ✔ lecture |
| C-14 | Création de commande non idempotente | A-F08 | P2 | M | ✔ lecture |
| C-15 | Quota de promotion consommé sans commande, dépassable | A-F06 | P2 | S | lecture |
| C-16 | Capacité d'un livreur dépassable (deux acceptations simultanées) | A-F09 | P2 | M | lecture |
| C-17 | Pourboire : routes publiques sans jeton ni limiteur | M | P2 | S | ✔ lecture |
| C-18 | `maps` et `addresses` : routes publiques non bornées | M, A | P2 | S | ✔ lecture |
| C-19 | Mots de passe 128 caractères contre 72 octets bcrypt | A-F12 | P2 | S | ✔ lecture, reproduit (A) |
| C-20 | Confirmation d'e-mail contournée après inscription | A-F11 | P2 | M | lecture, reproduit (A) |
| C-21 | Énumération d'e-mails (`EMAIL_EXISTS`) | B-F10, A-F11 | P2 | S | ✔ lecture |
| C-22 | Renouvellements de session simultanés → déconnexion | A-F10 | P2 | M | reproduit (A) |
| C-23 | Mobile : pas de renouvellement de session en cours d'usage | A-F13 | P2 | M | lecture |
| C-24 | Changement de mot de passe : contrat serveur/mobile divergent | A-F14 | P2 | S | lecture |
| C-25 | Webhook Stripe : pas de table d'événements, litiges non gérés | M | P2 | M | ✔ lecture |
| C-26 | Arrêt du serveur sans attente des requêtes en cours | A-F16 | P2 | S | ✔ lecture |
| C-27 | Client créé à la main invisible jusqu'à sa première commande | B-F5 | P2 | S | lecture |
| C-28 | CI : intégrations RGPD/assistant ignorées, pas de CI mobile | B-F6, B-F7 | P1 | M | lecture |
| C-29 | Pas d'en-têtes CSP/HSTS pour le site | M | P2 | S | lecture |
| C-30 | Conteneurs en root, migrations dans le `CMD`, rôle SQL unique | M, A | P2 | M | ✔ lecture |
| C-31 | Sauvegardes : planification et restauration à prouver | A | P2 | M | à vérifier en exploitation |
| C-32 | Pages légales par défaut obsolètes (plateforme européenne de règlement des litiges) | A | P2 | S | lecture |
| C-33 | Supervision métier (commande payée non annoncée, webhook bloqué, remboursement en attente) | A | P2 | M | — |
| C-34 | Dépendances : `npm audit` à trier selon l'exposition | B-F9, M | P3 | S | audit |
| C-35 | Dette de typage et fichiers géants (313 `any`, 793 avertissements ESLint) | M, B-F8 | P3 | L | ✔ comptage |
| C-36 | Fichiers hors sujet suivis dans git (`output/`, maquette HTML) | M | P3 | S | ✔ |

## 3. Décisions métier à prendre avant de coder

Ces décisions bloquent une partie du plan. Sans elles, je risque d'implémenter la mauvaise règle.

| # | Question | Bloque | Recommandation |
|---|---|---|---|
| D1 | Que devient une commande déjà payée quand le commerce est suspendu ? (annuler et rembourser, ou honorer) | C-04 | Refuser les nouvelles commandes ; honorer ou rembourser les commandes en cours selon la raison de la suspension |
| D2 | Comment répartir un remboursement partiel entre commerçant, plateforme (commission) et livraison ? | C-07 | Au prorata de la part de chaque ligne, avec une règle d'arrondi explicite, documentée |
| D3 | Le retour `READY→PREPARING` est-il voulu ? Qui peut clore une livraison plateforme ? | C-11 | Autoriser le retour en préparation comme opération explicite ; clôturer la livraison plateforme uniquement par la validation de livraison |
| D4 | Quels réglages le STAFF peut-il modifier ? | C-12 | Seulement les réglages opérationnels (horaires, pauses) ; identité légale, TVA, devise, mode de livraison réservés au MANAGER |
| D5 | Une remise limitée à certains produits s'applique-t-elle aussi aux suppléments, et aux frais de livraison ? | C-13 | Aux lignes éligibles, suppléments inclus ; jamais aux frais de livraison |
| D6 | Le quota de promotion est-il consommé à la création, au paiement ou à l'acceptation ? | C-15 | Au paiement confirmé, avec réservation à la création et libération en cas d'échec |
| D7 | Un client créé à la main doit-il apparaître dans le carnet avant sa première commande ? | C-27 | Oui : le rattachement explicite `StoreCustomer` suffit |
| D8 | Après changement de mot de passe, la session courante reste-t-elle ouverte ? | C-24 | La fermer et ramener à la connexion : c'est ce que fait déjà le serveur |

## 4. Phases

### Phase 0 — Confidentialité immédiate (1 à 2 jours)

**Objectif :** plus aucune donnée de client ou de commande lisible sans droit. Rien d'ici ne dépend d'une décision métier.

| Étape | Correction | Test de sortie |
|---|---|---|
| C-01 | Retirer `orders` de `StoreService.getById`, utiliser un `select` public explicite, filtrer `deletedAt`. Réserver la version complète aux routes de gestion authentifiées | Visiteur anonyme : réponse sans `customerEmail`, `customerPhone`, `deliveryAddress`, `trackingTokenHash` |
| C-02 | `authMiddleware` + appartenance à l'organisation sur `GET /stores/org/:orgId`, ou `select` public sans produits non actifs | Anonyme : 401 ; membre d'une autre organisation : refus |
| C-03 | `select` explicite du paiement dans `order-management.service.ts` (lignes 116 et 163), sans `stripeClientSecret` | La réponse de gestion ne contient jamais ce champ, y compris dans les objets imbriqués |
| C-04 | Lire `Organization.status` dans `OrderService.create` et refuser si l'organisation n'est pas active | Boutique ouverte d'une organisation suspendue : refus (4xx) |
| Test de balayage | Test qui parcourt la table des routes Express et exige que toute route sans authentification soit dans une liste blanche explicite. Test « visiteur anonyme » avec liste noire de champs | Il aurait détecté C-01 et C-02 |

**Critère de sortie de la phase :** les tests ci-dessus passent en CI, et la liste blanche des routes publiques est relue et validée.

### Phase 1 — Argent et reversements (2 à 4 semaines)

**Objectif :** pas de double relevé, pas de double versement, état de remboursement exact. À faire dans l'ordre : chaque étape prépare la suivante. Les décisions D1 et D2 doivent être prises avant C-07.

| Étape | Correction | Test de sortie |
|---|---|---|
| C-06 | Distinguer demandé, en attente, réussi, échoué, annulé ; n'écrire `REFUNDED` qu'à la confirmation ; traiter les événements `refund.updated`, `refund.failed` ; rapprocher périodiquement les remboursements non terminés avec Stripe | Remboursement `pending` : la commande n'est pas `REFUNDED` ; passage à `succeeded` : elle le devient |
| C-25 | Table `StripeEvent` (identifiant, type, reçu le, traité le, résultat) ; déduplication explicite ; gestion de `charge.dispute.created/closed` | Même événement envoyé deux fois : un seul effet ; litige : visible dans la base |
| C-08 | Verrou du bénéficiaire (ou transaction sérialisable avec reprise) ; rattachement conditionnel « encore non rattaché » avec contrôle du nombre de lignes ; contrainte d'unicité par bénéficiaire et période | Deux appels réellement concurrents sur PostgreSQL : un seul relevé |
| C-07 | Écritures d'ajustement pour les remboursements partiels, reportées au relevé suivant ; correction après un versement déjà fait par une écriture compensatrice, jamais par suppression | Remboursement partiel avant et après versement : chaque centime expliqué |
| C-09 | Lot bancaire persistant et immuable (états préparé, approuvé, exporté, transmis, confirmé/rejeté) ; une ligne dans un seul lot actif ; IBAN et montants figés ; réauthentification forte pour l'approbation et les changements d'IBAN | Deux exports consécutifs : aucune ligne dans deux lots actifs |
| C-10 | Intention d'annonce durable écrite dans la même transaction que `submittedAt` (outbox existante) ; worker avec reprise et déduplication | Interruption après l'écriture : l'annonce part au redémarrage, une seule fois |
| C-13 | Remise calculée sur les lignes éligibles côté serveur (produits, catégories, suppléments selon D5) ; arrondis explicites | Panier mixte : remise de 20 % sur un article à 10 € dans un panier à 100 € = 2 € |

**Règles à respecter (CLAUDE.md) :** montants en `Decimal`, jamais de suppression d'un mouvement financier, appels externes en dehors des transactions longues, idempotence testée par rejeu.

**Critère de sortie de la phase :** tests concurrents verts sur PostgreSQL ; un relevé explicable écriture par écriture ; aucun état intermédiaire présenté comme final.

### Phase 2 — Cloisonnement et droits (1 à 2 semaines)

**Objectif :** une seule règle d'accès, appliquée de la même façon par HTTP, socket, assistant et jobs. Les décisions D3 et D4 doivent être prises avant C-11 et C-12.

| Étape | Correction | Test de sortie |
|---|---|---|
| C-05 | Fonction unique « périmètre de boutiques » réutilisée par le middleware HTTP, `accesCommande`, `emitMerchantEvent` **et** `emitOrgEvent` (que l'audit B ne cite pas). ADMIN : toute l'organisation ; MANAGER/STAFF : leurs `storeIds` | Employé limité à la boutique A : refusé sur le salon d'une commande de B, ne reçoit pas les notifications spontanées de B ; retrait d'attribution pris en compte |
| C-12 | Droit de gestion exigé pour `PUT /store-settings/:storeId` (identité légale, TVA, devise, mode de livraison) ; STAFF conserve les droits opérationnels (selon D4) | Test par action sensible et par rôle |
| C-11 | Matrice de transitions selon acteur et mode de livraison ; clôture d'une livraison plateforme réservée au parcours de validation ; retour en préparation traité comme opération métier (selon D3) | `ACCEPTED→COMPLETED` refusé sur une livraison plateforme ; test à plusieurs acteurs et deux boutiques |
| C-27 | Rattachement explicite `StoreCustomer` accepté en lecture, en plus des commandes (selon D7) | Création → liste → lecture → modification |

**Critère de sortie de la phase :** matrice rôle × action × ressource écrite et testée ; plus d'écart entre HTTP et socket.

### Phase 3 — Fiabilité des opérations répétées (2 à 3 semaines)

| Étape | Correction | Test de sortie |
|---|---|---|
| C-14 | Clé de tentative par achat, persistée avec contrainte d'unicité ; même clé et même panier = même résultat ; même clé et panier différent = refus ; acceptation des conditions dans la même transaction | Deux POST identiques : une seule commande |
| C-15 | Réservation de l'utilisation et création de la commande dans une transaction ; incrément conditionnel au plafond (selon D6) | Deux appels simultanés sur la dernière utilisation : un seul passe ; échec : quota rendu |
| C-16 | Sérialisation de l'acceptation par livreur, recomptage de la capacité dans la transaction | Deux offres pour un livreur à une place : une seule acceptée |
| C-22 | Distinguer concurrence immédiate d'une réutilisation suspecte du jeton de rafraîchissement | Deux renouvellements simultanés : session conservée ; jeton volé réutilisé : session fermée |
| C-23, C-24 | Gestion de session partagée dans les apps mobiles : un seul renouvellement à la fois, sauvegarde atomique, rejeu limité ; contrat de changement de mot de passe aligné (selon D8) | Usage de plus de 15 min sans déconnexion injustifiée |
| C-19 | Politique alignée sur les octets réellement traités (72 octets) ou migration vers un hachage adapté avec compatibilité des comptes existants | Deux mots de passe au même préfixe de 72 octets ne sont plus tous deux acceptés |
| C-20, C-21 | Accès limité aux opérations de confirmation après inscription ; réponse d'inscription uniforme, parcours envoyé au titulaire ; minimisation et durée de conservation des traces | Compte non confirmé refusé sur les routes sensibles |
| C-26 | Arrêt gracieux : fermer le serveur HTTP, attendre les requêtes en cours (délai maximal), arrêter les workers, puis déconnecter la base | Déploiement pendant une commande et un webhook sans perte |
| C-17, C-18 | Jeton de suivi ou session sur le pourboire, limiteur dédié ; limiteur, rayon borné et pagination sur `maps` ; limiteur et gestion d'erreur sur `addresses` ; correction de la formule de délai (`maps.routes.ts:24`) | Tests de limite ; anonyme sans jeton : refus |

### Phase 4 — Exploitation, CI et preuves (en parallèle de la phase 1)

| Étape | Correction |
|---|---|
| C-28 | CI : activer `PRIVACY_INTEGRATION` et `ASSISTANT_TEST_DATABASE_URL` sur bases dédiées ; job `typecheck` pour les 4 apps mobiles ; corriger l'erreur TS2591 (`process`) de l'app admin ; ESLint suivi dans chaque app pour que `npm ci` suffise ; rendre `SafetyCheck` autonome |
| C-29 | CSP, HSTS, `frame-ancestors`, `Referrer-Policy` pour le site (via `proxy.ts` ou Caddy) ; vérifier en production |
| C-30 | `USER` non-root et `HEALTHCHECK` dans les Dockerfiles ; migrations dans une étape de déploiement unique avec un rôle SQL dédié, rôle d'exécution distinct sans droit de schéma ; limites de ressources |
| C-31 | Planifier `deploy/zup.sh backup`, copier hors serveur, conserver les clés ailleurs, exécuter `restore-test` et chronométrer la restauration (base et documents privés) |
| C-32 | Relire les pages légales effectivement publiées en base ; compléter identité et contacts ; retirer la référence à l'ancienne plateforme européenne de règlement en ligne des litiges ; faire valider pour la Belgique et la France |
| C-33 | Alertes métier : commande payée non annoncée, annonce en retard, webhook bloqué, relevé non créé, remboursement en attente, écart Stripe/banque, sauvegarde complète trop ancienne |
| SHA | Exposer la révision de build (SHA) dans `/health` ou une attestation de déploiement, pour savoir quel correctif est actif |

### Phase 5 — Dette et croissance (après stabilisation)

| Étape | Contenu |
|---|---|
| C-34 | Cartographier les chemins d'exposition des alertes `npm audit` ; mettre à jour sans `--force` |
| C-35 | Geler le nombre d'avertissements ESLint (793), puis le réduire ; supprimer les `any` des contrats sensibles ; découper `drivers.routes.ts`, `dispatch.service.ts`, `surveillance-courses.service.ts`, `TunnelCommande.tsx` au fil des corrections |
| C-36 | Retirer `output/` et `MERCHANT_APP_DESIGN.html` du suivi git |
| Tests | Tests pour les modules à zéro : `catalog`, `admin`, `superowner`, `marketing`, `plans`, `reports`, `support`, `maps` ; tests mobiles ; recette sur appareils réels (arrière-plan, GPS, notifications, réseau instable) |
| Chantiers | Centre de rapprochement financier, API d'intégration réellement branchée (`api-key.service.ts` n'est pas utilisé par un middleware), pilotage opérationnel, contrats d'API partagés générés depuis les schémas Zod, mode d'entraînement isolé des flux financiers, ZupDrive avec un jalon de lancement distinct |

## 5. Ordre d'exécution et dépendances

```text
Phase 0 (C-01..C-04, test de balayage) ──┐
                                         ├─> Phase 2 (C-05, C-11, C-12, C-27)
Décisions D1..D8 ────────────────────────┤
                                         └─> Phase 1 (C-06 → C-25 → C-08 → C-07 → C-09, C-10, C-13)
Phase 4 (CI, SHA, sauvegardes) en parallèle de la phase 1
Phase 3 après les phases 1 et 2 (les tests concurrents réutilisent la CI PostgreSQL de la phase 4)
Phase 5 en continu, sans bloquer les précédentes
```

Les tests concurrents des phases 1 et 3 exigent la CI PostgreSQL : commencer la partie C-28 tôt.

## 6. Règles de conduite pour les correctifs

- **Une PR par constat** (ou par groupe très proche), avec le test de non-régression qui échoue avant et passe après.
- **Avant de pousser :** `npx tsc --noEmit`, `npm run lint`, `npx jest` du module touché, et un script `verif-*.mjs` pour les parcours utilisateurs importants.
- **Changement d'API :** chercher d'abord les consommateurs (frontend, `mobile/customer`, `mobile/merchant`, `mobile/delivery`, scripts). Signaler tout changement cassant, surtout C-01, C-02, C-03, C-24.
- **Schéma Prisma :** une migration nouvelle pour chaque contrainte (C-08, C-09, C-14, C-25), testée sur une copie réaliste ; ne jamais modifier une migration déjà appliquée.
- **Données financières :** corriger par écriture compensatrice, jamais par suppression.
- **Administration :** toute action d'administration nouvelle ou modifiée appelle `journaliser(...)`.

## 7. Ce que ce plan ne prouve pas

- Les concurrences (C-08, C-16, C-22) viennent de la lecture du code : à confirmer par des tests sur vraie base avant de les classer comme certaines.
- L'état du serveur de production (SHA actif, rôles SQL, sauvegardes effectives, pages légales publiées) n'est pas inspecté.
- Aucune évaluation juridique : C-32 demande une validation par un juriste.
- Les durées sont des ordres de grandeur ; elles dépendent de l'équipe et des décisions D1 à D8.

## 8. Suivi

| Phase | Statut | PR | Remarques |
|---|---|---|---|
| 0 | à faire | | |
| 1 | à faire | | |
| 2 | à faire | | |
| 3 | à faire | | |
| 4 | à faire | | |
| 5 | à faire | | |
