# Remboursements ZupEat durables — A03

Référence actuelle au **9 octobre 2026**. Voir les [preuves datées](preuves-a03-2026-10-09.md)
et le [registre du projet](etat-projet.md#étape-02--a03-remboursements-durables).
Les audits précédents restent des preuves historiques, sans valider cette version.

## Comportement et garanties

Un paiement reçu après refus (`REJECTED`) ou abandon (`deletedAt`) conserve ces
états métier. La transaction qui inscrit l'encaissement inscrit également une
`RefundOperation`, avant l'acquittement du webhook. Le refus commerçant, le refus
automatique et l'échec de livraison avec remboursement demandé inscrivent la même
intention dans leur transaction métier. Un rollback conserve le webhook reprenable.

Le module `payments` garde une opération par paiement. Le montant en centimes,
la devise, le motif et la clé `a03-remboursement-<paymentId>` sont persistants.
La restitution couvre la commande **et le pourboire encaissé avec elle** ; elle
ne change ni prix, ni commissions, ni relevés passés. Les pourboires payés dans
une intention distincte après livraison gardent leur parcours existant.

| État en base | Signification | Suite |
|---|---|---|
| `REQUESTED` | Demandé, committé en PostgreSQL | Prise par le worker |
| `PROCESSING` | Bail de traitement de 2 minutes | Réconciliation puis appel externe |
| `WAITING_STRIPE` | Remboursement créé, en attente ou nécessitant une action | Relecture à 1 minute et réveil par webhook |
| `RETRY` | Panne technique, demande à reprendre | 30 s, 1 min, 2 min… maximum 1 h |
| `SUCCEEDED` | Total réellement restitué confirmé chez Stripe | Paiement et commande `REFUNDED` |
| `ABANDONED` | Incohérence, échec définitif, résultat incertain ou 12 tentatives épuisées | Alerte critique, examen et reprise autorisée |

`RefundOperationEvent` conserve les transitions de prise et de résultat, et les
reprises humaines. `attempts` et `version` augmentent ; une reprise ne remet pas
l'historique à zéro. Le bail expiré permet la reprise après redémarrage, avec une
comparaison atomique de version ; les écritures d'un ancien worker sont rejetées.
Le job est lancé par le leader déjà existant, toutes les 10 secondes, et déclaré
à `Surveillance` sous `remboursements`. Le verrou SQL protège aussi les appels
administratifs concurrents. L'outbox d'e-mails reste indépendante.

L'appel Stripe est **hors transaction**. `firstCallAt` est committé avant le
premier POST, avec la clé stable. À chaque reprise, le worker relit l'intention
et **toutes les pages** des remboursements, même sans `stripeRefundId` local.
Une réponse perdue après succès est donc retrouvée sans deuxième création.
Les événements `charge.refunded`, `refund.created`, `refund.updated` et
`refund.failed` réveillent la réconciliation ; leur payload ancien ne fait pas
revenir une restitution réussie à un état antérieur. Le cumul réussi en base
est monotone. ZupDrive garde son propre service et son aiguillage.

La création est bloquée 23 heures après `firstCallAt` : Stripe peut supprimer
une clé après au moins 24 heures. Un résultat toujours incertain ne permet donc
pas une recréation aveugle. Une référence enregistrée mais introuvable, un
remboursement partiel, un échec/cancellation confirmé et un montant/devise
incohérent demandent un examen humain. Cette version ne crée pas automatiquement
une nouvelle opération financière après un échec définitif Stripe. Une reprise
peut réconcilier un remboursement fait au tableau de bord ; elle conserve la
clé et la fenêtre d'origine.

## Contrats API et permissions

Toutes les routes ci-dessous utilisent l'authentification existante et le garde
d'équipe de ZupEat. Le superowner passe ; les autres membres doivent avoir
`billing: read` pour lire et `billing: write` pour modifier. Un commerçant ou un
livreur n'obtient pas cet accès. Les mutations inscrivent `SystemAuditLog` avec
l'acteur, la commande, l'opération et le motif dans la transaction de la demande.

| Méthode et route | Entrée | Réponse et effets |
|---|---|---|
| `GET /api/superowner/orders/refunds/review` | `limit` entier 1–100, défaut 50 ; `cursor` ID de paiement facultatif | 200 `{success, refunds, nextCursor}` ; paiements en ligne payés/refusés ou abandonnés, demandes non réussies et remboursements déjà référencés ; inclut aussi les cas sans ID de remboursement ou sans opération ; historique récent (20 transitions) |
| `POST /api/superowner/orders/:id/refund` | `{raison}` texte de 3–300 caractères | 200 `{success, refundId, amount, status, operationId, operationStatus}` ; `amount` reste en euros dans cette API, montant déterminé côté serveur ; `refundId` peut être null ; `status=succeeded` seulement après restitution effective, sinon `pending` indique la demande persistée |
| `POST /api/superowner/orders/:id/refund/retry` | `{raison}` texte de 3–300 caractères | 202 `{success, operationId, operationStatus}` ; remet la demande à reprendre sans changer montant, clé ou `firstCallAt` ; aucun POST Stripe dans la requête |

Erreurs : 401 sans authentification, 403 sans permission ; 400 validation ; 404
commande inconnue sur la demande initiale ; 409 déjà remboursée, opération absente
(`REFUND_NOT_RETRYABLE`) ou bail encore actif (`REFUND_BUSY`). La demande initiale
continue à refuser une commande non payée en ligne. Un champ `amount` envoyé par
l'appelant ne fixe jamais le montant remboursé. Aucun changement d'API mobile.
Une livraison n'annonce `REMBOURSEE` que si le remboursement a réellement réussi ;
le refus client ne promet plus un succès pour une simple réponse Stripe pending.

## Configuration et migration

Aucune nouvelle variable. Il faut la configuration serveur Stripe existante
(`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) et PostgreSQL accessible. Les
nouvelles colonnes sont dans les nouvelles tables ; `Payment`, `Order`, leurs
montants et leurs statuts ne sont pas réécrits par la migration.
Les intentions dues ont besoin des clés Stripe même lorsque les nouveaux
paiements sont désactivés. Redis ne porte pas l'état financier.

Migration : `backend/prisma/migrations/20261009150000_durable_refunds/migration.sql`.
L'application d'une migration en exploitation reste une opération séparée,
à préparer sur une copie restaurée avant déploiement.

```bash
cd backend
npm ci
npx prisma generate
npx prisma migrate deploy
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Le backfill sélectionne les paiements `SUCCEEDED` avec intention Stripe, montant
positif et commande refusée/abandonnée ou remboursement déjà référencé. Il les
inscrit `ABANDONED`, code `HISTORICAL_MANUAL_REVIEW`, `firstCallAt` périmé. Il ne
crée aucun remboursement et ne marque aucun ancien cas réussi sur simple demande.
Les paiements sans intention Stripe ou les données incohérentes restent visibles
via la liste de revue ; il faut rechercher leur preuve d'encaissement.

Les relations suivent le cycle de conservation comptable existant : suppression
avec le paiement lors de la purge légale de la commande, jamais pour corriger un
remboursement. Le journal ne contient pas la réponse SDK ni des données bancaires.
Ne pas modifier une clé, un montant, un historique ou `firstCallAt` pour forcer
une nouvelle restitution. En cas de retour applicatif, conserver les tables et
les demandes ; revenir au code précédent peut réintroduire A03 et son ancien
parcours de remboursement. Préférer corriger ou suspendre le worker et superviser
la dette conservée, puis reprendre avec cette version.

## Exploitation et cas historiques

La Vigie signale `metier:remboursements-a-reprendre` en **CRITIQUE** pour les
opérations abandonnées et les commandes payées/refusées sans restitution réussie
après 10 minutes, y compris sans ID Stripe. L'alerte donne les routes de revue et
de reprise. Les incidents et les envois d'alerte suivent le mécanisme existant ;
leur livraison effective doit être validée sur l'environnement déployé.

1. Consulter la liste de revue et les incidents ; relever commande, paiement,
   montant/devise, opération, clé, `firstCallAt`, `lastError` et historique.
2. Vérifier le bon compte Stripe et le mode TEST/LIVE ; rechercher l'intention,
   son encaissement et tous ses remboursements, y compris ceux du tableau de bord.
3. Si une panne technique est réparée, envoyer une reprise avec un motif précis.
   La réconciliation peut constater un succès retrouvé. Un 202 n'est pas une
   preuve que l'argent a été rendu.
4. Si le résultat reste incertain après la fenêtre, si Stripe a échoué
   définitivement ou si le remboursement est partiel, traiter le dossier
   financièrement avec ses preuves ; ne pas lever le garde d'idempotence par SQL.
   Toute restitution complémentaire est une opération distincte à contrôler
   chez Stripe et à journaliser. Le mouvement réel requiert sa propre autorisation.
5. Vérifier `SUCCEEDED`, le cumul `Payment.refundedAmount`, la commande
   `REFUNDED`, le pourboire et la résolution de l'alerte ; conserver les preuves.

## Validation reproductible

Utiliser une **base PostgreSQL de test dédiée**, migrée. La suite A03 refuse un
nom de base sans `test`. Stripe y est simulé, PostgreSQL et transactions sont réels.
La CI active explicitement `REFUND_INTEGRATION=true` dans le job Backend et
exécute aussi le test de migration historique.

```bash
cd backend
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/saas_test \
  REFUND_INTEGRATION=true npx jest src/modules/payments/__tests__/refund.integration.test.ts --runInBand
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/saas_test \
  node scripts/verification/refund-migration.mjs
npx tsc --noEmit
npm run lint
npm test
npm run build
```

Scénario externe préparé : le runner existant exige une base locale jetable,
une clé `sk_test_` ou `rk_test_`, le CLI Stripe et son forwarding. Préparer un
`backend/.env` local non committé avec la configuration de test complète et une
base PostgreSQL locale dont le compte peut créer une base temporaire. Autoriser
`api.stripe.com` et les destinations du CLI Stripe dans l'environnement. Aucune
clé LIVE n'est acceptée par ce runner.

```bash
cd backend
node scripts/security/audit-stripe-sandbox.mjs --run
```

Le runner lance l'API TEST avec le worker réel, encaisse une carte `pm_card_visa`,
fait recevoir le webhook signé réel après refus et injecte une panne avant appel
puis une perte de réponse après remboursement. Il vérifie reprise, unicité,
pourboire, montant, statut final et rejeu signé, en plus des contrôles historiques.
Les routes `/audit/refund-fault/*` existent uniquement dans le serveur de test
isolé, jamais dans `src/app.ts` ou le serveur de production. Il nettoie les objets
Stripe TEST et supprime sa base temporaire. Ce scénario n'est pas un parcours
navigateur complet et ne valide aucun mouvement LIVE. Voir les preuves pour ce
qui a réellement été exécuté.
