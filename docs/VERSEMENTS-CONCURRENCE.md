# Relevés livreurs et lots bancaires — A04

Référence actuelle ZupEat, 9 octobre 2026. Voir le [registre de livraison](etat-projet.md#étape-03--a04-concurrence-des-versements)
et les [preuves datées](preuves-a04-2026-10-09.md). ZupDrive conserve ses services distincts.

## Comportement et transactions

Un relevé libre est `PENDING` et `batchId = null`. Toute opération financière
le revendique avec ces deux conditions dans un `updateMany`, et exige exactement
une ligne modifiée. PostgreSQL verrouille la ligne et réévalue les conditions
après l'attente d'une écriture concurrente. La transaction perdante est annulée.

| Mutation | Écritures et protections |
|---|---|
| Arrêté livreur (`arreter`, manuel ou job hebdomadaire) | Lecture du livreur, des courses et pourboires dans la transaction ; création du relevé et montant figé ; rattachement seulement des courses `DELIVERED`, libres, sans `payoutHold`, et des pourboires `PAID` libres du livreur. Les nombres modifiés doivent égaler les nombres sélectionnés, sinon rollback de la création et des deux rattachements. |
| Préparation du lot | Verrou transactionnel historique `lot-bancaire` entre préparations ; lecture des candidats dans la transaction, copie chiffrée des IBAN/bénéficiaires/montants ; chaque relevé est rattaché sous `PENDING`, lot nul et montant égal au montant copié, exactement une ligne. Un conflit annule tout le lot. |
| Paiement manuel | Transaction : `PENDING` sans lot → `PAID`, référence, moyen, auteur et date ; lecture du résultat et diagnostic du refus dans cette transaction. Les gains restent rattachés. Notification après commit, une seule pour le gagnant. |
| Annulation du relevé | Transaction : `PENDING` sans lot → `CANCELLED` **avant** de libérer les courses et pourboires. Un conflit ou une erreur de libération annule toutes les écritures. Le montant archivé reste figé. |
| Approbation, export, transmission du lot | Transitions conditionnelles existantes, exactement un lot modifié. Approbation avec réauthentification. Premier export : date et SHA-256 figés ; réexport identique ou erreur `BATCH_TAMPERED`. |
| Confirmation | Transaction : `EXPORTED`/`SUBMITTED` → `CONFIRMED`, lecture du lot dans la transaction ; contrôle du nombre, total, doublons et ensemble exact des relevés ; chaque ligne figée `PENDING` rattachée à ce lot devient `PAID`, exactement une ligne et même montant. Tout écart annule la clôture et les paiements. |
| Refus bancaire / abandon du lot | Transaction : `EXPORTED`/`SUBMITTED` → `REJECTED`, ou `PREPARED`/`APPROVED` → `CANCELLED` ; mêmes contrôles que la confirmation ; seule la relation au lot est libérée, les gains restent sur leurs relevés `PENDING`. |

Les décisions de dépôt contesté modifient `payoutHold`, pas les liens de gains
des relevés : un arrêté ne prend que des courses sans retenue. Le webhook de
pourboire passe conditionnellement `PENDING` → `PAID` ; un arrêté ne prend que
les pourboires encaissés. L'effacement de profil peut pseudonymiser le
bénéficiaire, sans modifier montant, paiement ou copie bancaire du lot.

Les rejeux de paiement, annulation, confirmation et refus renvoient un conflit
si leur transition a déjà eu lieu. Ils ne modifient pas la première référence,
date ou note et ne libèrent pas les gains d'un nouvel arrêté/lot. Un relevé payé
ne peut donc jamais redevenir dû par ces opérations. Aucun service de cette
étape n'appelle une banque ou Stripe pour effectuer un virement.

## Contrats API et interface

Préfixe `/api/superowner`, authentification et garde d'équipe existantes :
permission de section `payouts`, lecture/écriture selon la méthode ; superowner
autorisé. Les opérations réussies restent journalisées dans `SystemAuditLog`.

| Méthode et chemin | Corps / résultat |
|---|---|
| `POST /payouts/draw` | `{periodStart, periodEnd, driverId?}` ; `201`, nombre de relevés. |
| `POST /payouts/:id/pay` | `{method, reference?, note?}` ; `200`, `{success, payout}`. Méthodes `BANK_TRANSFER`, `CASH`, `OTHER`. |
| `POST /payouts/:id/cancel` | `{raison}` non vide ; `200`, `{success, payout}`. |
| `GET /payouts?status=PENDING\|PAID\|CANCELLED\|ALL` | Chaque ligne expose aussi `batchId: string\|null` (ajout compatible). |
| `POST /versements/lots` | Aucun corps nécessaire ; `201`, lot et bénéficiaires écartés ; IBAN invalide reste hors lot. |
| `POST /versements/lots/:id/approuver` | `{motDePasse}`, réauthentification ; `200`, ID/état. |
| `GET /versements/lots/:id/sepa.xml` | XML figé ; état `EXPORTED` et empreinte lors du premier export. |
| `POST /versements/lots/:id/transmettre` | `200`, ID/état. |
| `POST /versements/lots/:id/confirmer` | `{reference?}` ; `200`, nombres commerçants/livreurs. |
| `POST /versements/lots/:id/rejeter`, `/annuler` | `{raison?}` ; `200`, `{success:true}`. |

Erreurs JSON existantes `{error, code}` : `404 PAYOUT_NOT_FOUND`/`BATCH_NOT_FOUND`,
`400` pour saisie invalide, période vide ou configuration SEPA manquante.
Les états déjà payés/annulés renvoient désormais **409** au lieu de 400 :
`ALREADY_PAID`, `PAYOUT_CANCELLED`, `PAYOUT_IN_BATCH`, `PAYOUT_STATE_CONFLICT`,
`PAYOUT_EARNINGS_CONFLICT`, `BATCH_CONFLICT`, `BATCH_STATE_CONFLICT` ou
`BATCH_CONTENT_CONFLICT`. Ce dernier demande un rapprochement, pas un retry aveugle.

L'écran des relevés affiche le rattachement et retire les actions individuelles
en présence d'un lot. Après 409, il ferme le formulaire obsolète et relit la
liste en conservant le message métier. L'écran SEPA relit également les lots
après un conflit de préparation ou de transition. Une relecture peut elle-même
échouer si le réseau est indisponible : réactualiser avant une nouvelle action.

## Configuration, migrations et tests

Aucune migration A04, dépendance nouvelle, configuration serveur ou état ajouté.
Conserver `SEPA_DEBTOR_NAME`, `SEPA_DEBTOR_IBAN`, `SEPA_DEBTOR_BIC`,
`PAYOUTS_START_DATE`, PostgreSQL et le trousseau de chiffrement existants.
`PAYOUT_INTEGRATION=true` est uniquement un opt-in de tests, pas un réglage serveur.

```bash
cd backend
npm ci
npx prisma generate
# DATABASE_URL désigne une base vierge dédiée dont le nom contient test.
npx prisma migrate deploy
PAYOUT_INTEGRATION=true npx jest src/modules/payouts/__tests__ --runInBand
npx tsc --noEmit
npm run lint
npm run build
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
cd ../frontend
npm ci
npx tsc --noEmit
npm run lint
npx jest --runInBand
npm run build
```

Sous PowerShell : `$env:PAYOUT_INTEGRATION='true'` avant Jest. La CI exécute A04
sur `payouts_test` dédiée, PostgreSQL 16. Les tests gardent une vraie transaction
ouverte après sa mutation, lancent le concurrent, attendent un verrou bloquant
visible par `pg_blocking_pids`, puis libèrent le gagnant. Quand le concurrent est
déjà inadmissible (relevé rattaché), son refus est vérifié pendant le verrou.
Les appels SQL, le chiffrement et les services métier sont réels ; banque et
notification temps réel ne sont pas contactées. Les fixtures sont supprimées.

## Diagnostic et rapprochement à examiner

Commande préparée, sans écriture, avec la configuration et les clés de lecture
de l'environnement visé ; privilégier un rôle PostgreSQL limité à `SELECT` :

```bash
cd backend
node --env-file=.env.production --import tsx scripts/diagnostic-versements.ts > diagnostic-versements.json
# Ou, environnement déjà chargé : npm run payouts:diagnostic
```

Le diagnostic impose `REPEATABLE READ, READ ONLY` et ne sort que date, nombres,
IDs et codes d'écart, aucun IBAN/nom/email. Codes : `CANCELLED_WITH_EARNINGS`,
`EARNINGS_MISMATCH`, `EARNINGS_OWNER_OR_STATE`, `PAID_WITHOUT_DATE`,
`PAYOUT_BATCH_STATE`, `INVALID_SNAPSHOT`, `BATCH_TOTAL_OR_COUNT`,
`MISSING_EXPORT_PROOF`, `BATCH_CONTENT_MISMATCH`. Sortie 0 sans écart, 2 avec
écarts, 1 si accès/déchiffrement impossible. Transaction limitée à 60 secondes ;
sur une grande base, prévoir une fenêtre de lecture adaptée et examiner le
volume avant lancement. Pas de pagination, réparation automatique ou preuve
qu'un gain détaché historiquement a effectivement été viré.

Procédure de rapprochement **à faire examiner par l'exploitation/comptabilité** :

1. Suspendre les arrêtés, préparations et mutations financières pendant l'examen ;
   sauvegarder selon [le guide VPS](../DEPLOIEMENT-SCALEWAY.md), noter SHA actif,
   environnement, date et opérateur. Ne pas démarrer une nouvelle série de virements.
2. Lancer le diagnostic et conserver le rapport dans un accès restreint. Pour
   chaque ID, collecter relevé, liens de courses/pourboires, anciennes valeurs
   du journal, copie du lot, XML archivé et empreinte. Ne jamais régénérer un
   fichier bancaire historique à partir des seuls gains actuels.
3. Rapprocher avec l'accusé et le relevé de la banque : importé, refusé ou exécuté,
   référence, bénéficiaire, montant exact. Une confirmation API est un état
   interne ; une exécution bancaire doit être appuyée par la pièce externe.
4. Si déjà exécuté, conserver les gains comme payés ; examiner une écriture
   corrective tracée ou une restauration justifiée du rattachement avec la
   comptabilité. Si l'exécution est incertaine, maintenir le blocage. Un refus
   bancaire confirmé peut justifier une remise en attente, jamais une simple
   annulation d'un relevé payé pour le payer de nouveau.
5. Préparer un dossier de correction par ID avec avant/après, pièces, montants,
   approbation et journal. Aucun SQL correctif générique n'est fourni : faire
   relire le dossier avant toute écriture et vérifier le diagnostic après.

Pour la validation externe, seul manque l'accès de lecture autorisé au VPS et
aux pièces bancaires des IDs signalés. Cette étape prépare la procédure sans
demander ni stocker des identifiants bancaires. Aucun mouvement réel requis.

## Mise en exploitation et limites

Après revue/CI, appliquer les migrations générales existantes si nécessaire,
puis déployer backend et frontend selon le guide VPS. Éviter la coexistence
d'instances backend anciennes : une écriture non conditionnelle de l'ancien
code pourrait encore contourner la protection. Faire le diagnostic avant
réouverture des versements, résoudre les anomalies, noter SHA/date/environnement.
Un rollback du code exige de suspendre les versements, car il réintroduit A04.

Les journaux administratifs et notifications restent post-commit comme dans
le système existant ; leur panne ne doit jamais conduire à refaire le paiement.
La transaction garantit les états financiers, pas la livraison exactement une
fois d'une notification. Les garanties concernent les services de ce module ;
une intervention SQL externe doit respecter le dossier de rapprochement.

Références techniques consultées après vérification des versions installées :
[verrous PostgreSQL 18](https://www.postgresql.org/docs/18/explicit-locking.html),
[transactions Prisma](https://www.prisma.io/docs/orm/fundamentals/transactions).
