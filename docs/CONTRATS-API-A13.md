# A13 — contrats HTTP et preuves de non-régression

Mis à jour le 11 octobre 2026. Référence de code de départ :
`b73707d39abf56241aa06e0fcef14d104aaab9f8`. Les commits A01–A04, A09 et A10
présents dans cette base fournissent les mécanismes métiers et suites cités ici.
Ce document distingue les tests locaux simulés, les intégrations PostgreSQL,
les intégrations Stripe TEST externes et les essais sur appareils.

## Matrice des parcours, risques et suites

| Rôle / parcours | Risque principal | Preuve automatisée existante ou ajoutée | Limite |
|---|---|---|---|
| Client — inscription, confirmation, reprise de session | Compte/rôle partiel après panne, double création, réponse perdue | `auth/__tests__/inscriptions-atomiques.pg.test.ts`, `account-links.pg.test.ts`, `rotation-refresh.pg.test.ts`; `auth-routes-caracterisation.test.ts` | L'inscription et les sessions sont en PostgreSQL CI; l'envoi d'e-mail est simulé. |
| Client — commande invitée ou connectée | Usurpation de commande, montant modifié, webhook doublé ou hors ordre | `orders/__tests__/commande-fiche-client.test.ts`, `commande-montants-serveur.test.ts`, `payments/__tests__/payment.test.ts`; E2E `verif-commande-invite.mjs`, `verif-suivi-client.mjs` | Stripe et adresses sont simulés/coupés dans E2E. |
| Client — paiement carte et 3DS | Secret divulgué, intention étrangère, `requires_action` pris pour un succès, réponse perdue | `payments/__tests__/payment-routes-caracterisation.test.ts` (contrat HTTP); `payment.test.ts` (webhook/idempotence); `refund.integration.test.ts` (PostgreSQL et Stripe simulé) | Le cas `requires_action` est simulé. Le 3DS Stripe TEST externe reste non exécuté sans clés, URL publique et Stripe CLI. |
| Client — refus, remboursement et panne | Paiement tardif non remboursé, statut prématuré, double remboursement | `payment.test.ts`, `refund.integration.test.ts`, `refund-admin.test.ts`; contrôle ciblé A03 dans le job backend | Intégration Stripe distante non prouvée par ces mocks. |
| Commerçant — réception et transition de commande | Commande non payée visible, double annonce, fuite inter-commerce | `orders/__tests__/order-acceptance.test.ts`, `commande-gestion-paiement.test.ts`, `auth/__tests__/cloisonnement.test.ts`; E2E catalogue et commandes retenus | Les parcours E2E non stables sont exclus de la CI (voir ci-dessous). |
| Livreur — acceptation, remise, preuve de livraison | Deux courses au-delà de capacité, preuve réutilisée pour autrui, transitions hors ordre | `drivers/__tests__/acceptation-concurrente.pg.test.ts`, `documents-preuves-idor.test.ts`, `drivers-routes-caracterisation.test.ts`; tests Node `delivery` | Pas un essai GPS/push/appareil. |
| Livreur — gains et relevés | Course absente/doublée, gain modifié après clôture, paiement de relevé concurrent | `payouts/__tests__/payout-concurrence.pg.test.ts`, `concurrence.pg.test.ts`, `arrete-concurrent.test.ts` | Aucun virement bancaire réel. |
| Administrateur — remboursement, revue, reversement | Permission trop large, action sans audit, montant ou état incohérent | `payments/__tests__/refund-admin.test.ts`, `auth/__tests__/permissions-plateforme.test.ts`, tests A04 PostgreSQL | Aucun acte de production n'est simulé comme exécuté. |

Drive est hors du périmètre A13 : les parcours visés sont ceux de commande et
livraison ZupEat. Les apps Customer, Merchant et Delivery consomment les
contrats ci-dessous; l'API reste la frontière de permission.

## Contrats HTTP ciblés par le test de routes

Préfixe : `http://localhost:3001/api`. Les corps sont JSON. Les réponses
d'erreur suivent le middleware API (`error`, `code`). Toute lecture de commande
est filtrée par propriétaire connecté ou par jeton de suivi reconnu; une
commande étrangère/inconnue est masquée en `404 ORDER_NOT_FOUND`.

| Méthode et URL | Payload / authentification | Réponse utile | Statuts / permission / domaine |
|---|---|---|---|
| `GET /payments/config` | Aucun; public. | `{ success: true, data: { enLigne, publishableKey } }`; clé nulle si désactivé. | `200`; domaine paiement. La clé publiable n'est pas un secret. |
| `POST /payments/intent` | `{ orderId, trackingToken? }`; client connecté propriétaire, ou invité avec jeton de suivi valide. Le montant n'est jamais accepté du client. | `201 { message, clientSecret, paymentIntentId, amount }`; montant calculé depuis commande et pourboire en cents. | `400` payload invalide; `404` commande/permission; `409 ORDER_NOT_PAYABLE` ou état financier incompatible; `201` créé/repris. Domaine paiement. |
| `POST /payments/confirm` | `{ orderId, paymentIntentId, trackingToken? }`; même permission. | `200 { message, success, status }`; `requires_action` reste `success: false`. La confirmation relit Stripe et le webhook signé reste l'autorité. | `400 INVALID_INPUT`; `404` commande/paiement non possédé; `200` pour l'état relu. Domaine paiement. |
| `GET /payments/status/:paymentIntentId?orderId=…&t=…` | Identifiant, `orderId` et jeton invité `t` facultatif si connecté propriétaire. | `{ paymentIntentId, status }`. | `400 INVALID_INPUT`; `404` si commande ou paiement étranger. Domaine paiement. |
| `POST /payments/webhook` | Corps brut signé `stripe-signature`; aucun jeton client. | `{ received: true, type }` après traitement durable. | `400` signature invalide; `503` webhook non configuré; `500` traitement échoué pour permettre le retry Stripe. Domaine paiement/webhooks. |

Le test de caractérisation HTTP vérifie les chemins config/intent/confirm, les
statuts, les corps utiles, le propriétaire, le jeton invité, le cloisonnement et
le maintien de `requires_action`. Les routes de remboursement/reprise
administratives sont caractérisées dans `refund-admin.test.ts` et gouvernées
par permission `billing`; les transitions de gains par A04/A03.

## CI et commandes ciblées

Le job `lifecycle-postgres` du workflow `CI` applique toutes les migrations sur
une base éphémère `lifecycle_test`, puis lance séparément A01/A02, A10, A09 et
l'acceptation de livraison concurrente. Les invocations sont séparées car les
fichiers ferment leur client Prisma dans `afterAll`. Le job Backend existant
exécute les contrats simulés et A03 contre PostgreSQL; les jobs A04/MFA
gardent leurs bases dédiées. Le job E2E garde Stripe désactivé et son service
d'adresse simulé. Les jobs mobiles font types/lint sur les six apps; seuls
Delivery et ZupDrive Passenger lancent aussi leurs scripts de test déclarés.

### Mesure et seuil de couverture critique

Sur les tests paiement ciblés, Jest a mesuré **75,30 % statements / 58,82 %
branches / 76,92 % fonctions / 77,02 % lignes** pour `payment.routes.ts`, et
**74,08 % / 65,95 % / 76,47 % / 79,02 %** pour `payment.service.ts`.
Le workflow fixe des seuils minimaux à 70/55/70/70 pour les routes et
70/60/70/75 pour le service (statements/branches/fonctions/lignes). Ces seuils
sont inférieurs à la mesure d'environ 3 à 6 points pour absorber une variation
mineure, mais empêchent une baisse sous la couverture mesurée. Ils s'appliquent
à ces fichiers avec les tests sélectionnés; ils ne signifient pas que tous les
chemins métier sont couverts. Les opérations de remboursement et reversement
ont leurs suites dédiées, référencées dans la matrice.

Les suites paiement ciblées ont également fini avec `--no-forceExit
--detectOpenHandles` sans rapport de handle. Les autres suites conservent la
configuration historique `forceExit: true`; leur fermeture n'est pas démontrée
par ce contrôle ciblé.

Depuis `backend/` :

```bash
npx jest src/modules/payments/__tests__/payment-routes-caracterisation.test.ts --runInBand
npx jest src/modules/payments/__tests__/payment.test.ts --runInBand
npx jest src/modules/payments/__tests__/refund.integration.test.ts --runInBand
# PostgreSQL dédiée migrée, dont le nom contient « test » :
npx jest src/modules/auth/__tests__/inscriptions-atomiques.pg.test.ts --runInBand
npx jest src/modules/auth/__tests__/account-links.pg.test.ts --runInBand
npx jest src/modules/auth/__tests__/rotation-refresh.pg.test.ts --runInBand
npx jest src/modules/drivers/__tests__/acceptation-concurrente.pg.test.ts --runInBand
```

L'intégration remboursement exige `REFUND_INTEGRATION=true`; les tests
PostgreSQL exigent une base dédiée migrée. Ne jamais utiliser une base de
production.

## Stripe TEST avec 3DS (externe, non simulé)

1. Utiliser une base dédiée de staging et les variables Stripe TEST existantes
   (`ENABLE_STRIPE=true`, `STRIPE_SECRET_KEY=sk_test_…`,
   `STRIPE_PUBLISHABLE_KEY=pk_test_…`, `STRIPE_WEBHOOK_SECRET=whsec_…`). Ne
   jamais transmettre de valeur secrète dans les logs ou commits.
2. Démarrer l'API et `stripe listen --forward-to <URL_API>/api/payments/webhook`;
   configurer le secret `whsec_…` indiqué par la CLI sur cette instance.
3. Avec une commande de test réelle dédiée, appeler `POST /payments/intent`,
   terminer le paiement avec la carte Stripe de test 3DS nécessitant
   authentification et traiter le challenge sur navigateur/appareil.
4. Vérifier l'état `requires_action`, puis le retour d'authentification,
   l'événement signé `payment_intent.succeeded`, l'unicité de la ligne Payment,
   le statut de commande et l'unique annonce commerçant. Rejouer le même
   événement signé et vérifier l'absence de second effet.
5. Exécuter aussi une carte de test refusée et vérifier `FAILED`, puis un
   remboursement via le parcours prévu et les états Stripe/DB concordants.

Ce protocole est un essai externe. Le test Jest avec `requires_action`, le faux
service de paiement E2E, et une clé factice ne valent pas exécution Stripe TEST.
Les essais appareil (Customer, Merchant, Delivery) exigent build de
développement et appareil physique; ils ne sont pas exécutés par GitHub Actions.

## Exclusions E2E connues

La CI n'exécute que les suites navigateur stables et reproductibles décrites
dans `.github/workflows/ci.yml`. Sont explicitement exclues actuellement :
assistant, carte-suivi, catalogue-support-direct, cloche, commandes-direct,
espace-administration, menu-merchant, note-livreur, preuve-livraison,
profil-commercant, validation-livreurs, zones-livraison,
zupdrive-chauffeur/courses/societe et les domaines configurés au build. Motif
consigné par la CI : échec constant ou prérequis local non établis (dépendance
au service, aux données, au domaine ou à la stabilité du scénario). Une suite
exclue n'est ni validée ni supposée réussie; elle doit être rendue répétable et
ajoutée avec un prérequis explicite.

## État A13 au 11 octobre 2026

| État | Date | SHA / environnement | Preuve |
|---|---|---|---|
| Développé | 2026-10-11 | branche dédiée A13, base `b73707d39abf56241aa06e0fcef14d104aaab9f8` | test HTTP paiement, job PostgreSQL de cycle de vie, présent contrat et procédure |
| Testé localement | 2026-10-11, Windows, Node 24.21/npm 12 | Contenu de la branche basé sur `b73707d39abf56241aa06e0fcef14d104aaab9f8` | Contrat + paiement 51/51 et seuils de couverture atteints; backend build/typecheck/lint; Delivery tests 16/16, typecheck/lint; YAML et liens vérifiés |
| Testé CI | 2026-10-11, GitHub Actions / Ubuntu / PostgreSQL 16 | SHA `76aa688ef81c34ffa1f113d955923bc789be70f0`, 11 jobs réussis | [run CI #38156637420](https://github.com/AmirGames/projet/actions/runs/38156637420) : backend complet/couverture, A01/A02/A09 et acceptation concurrente PostgreSQL, A04/A05, frontend, E2E, 6 apps mobiles |
| Non exécuté | 2026-10-11 | Aucune clé/URL publique Stripe TEST ni appareils de validation disponibles | Stripe TEST/3DS interactif et essais Customer/Merchant/Delivery sur appareil restent non exécutés; ce ne sont pas des validations simulées |
| Intégré | Non vérifié | SHA de fusion absent | aucune preuve |
| Déployé | Non exécuté | aucun environnement A13 confirmé | aucune preuve |
| Validé en exploitation | Non exécuté | aucun essai de staging/production A13 confirmé | aucune preuve |

