# Backend ZupEat / ZupDrive

En production, l'API se connecte par `DATABASE_URL_APP`, et les migrations
par `DATABASE_URL_MIGRATION`; la configuration refuse leur absence. Contrôler
le rôle réellement ouvert, sans écriture, avec `npm run db:role` après
`npm run build`, sur une base isolée. `ENABLE_STRIPE=false` est le défaut ; son
activation exige les clés secrète/publique correspondantes et le secret webhook.
Voir le [guide A16](../docs/CONFIGURATION-A16.md) pour les contrats et limites.
La recette proposée est fermée et ZupEat uniquement (ZupDrive exclu) ; son
SHA intégré `6439e36a51c6262b4781937c217a4063df6a90db`, statut CI et essais externes en attente sont dans le
[compte rendu A16](../docs/RECETTE-PILOTE-A16-2026-10-12.md).

## A15 — Rapports bornés

`GET /api/reports/{sales,revenue,products/:storeId,customers/:storeId}` accepte
`startDate` et `endDate` (ISO-8601 ou date `YYYY-MM-DD`, bornes inclusives),
limite une période à 366 jours et utilise les 90 derniers jours par défaut.
Les listes utilisent `limit` (50 par défaut, max 100) et `offset` (max 100000).
Les exportations CSV sont limitées à 31 jours et 5000 lignes. `GET
/api/drivers/earnings` expose les 30 dernières courses par défaut (`limit` 1–100,
`offset` max 100000), avec totaux calculés sur tout l'historique. Erreurs :
`INVALID_REPORT_DATE`, `REPORT_PERIOD_OUT_OF_RANGE`, `INVALID_PAGINATION`.
Voir le [contrat et protocole A15](../docs/RAPPORTS-A15.md).

## Dépendances A12

`backend/package.json` épingle par overrides les dépendances transitives du
CLI `prisma@7.10.0` à `mysql2 ^3.23.1` et `deepmerge-ts ^8.0.0`. Le lockfile
résout actuellement `3.24.5` et `8.0.2`. Cela corrige les avis
[mysql2 auth](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr),
[mysql2 inflate](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3) et
[deepmerge-ts](https://github.com/advisories/GHSA-ggr8-5vv4-36mx); Prisma,
PostgreSQL, son adaptateur, le schéma et les contrats HTTP ne changent pas.
L’image applicative inclut encore le CLI pour le service `migrate`; les
précautions et la revue des overrides au 12 novembre 2026 sont dans
[l’audit A12](../docs/AUDIT-DEPENDANCES.md).

```bash
npm ci
npm run prisma:generate
npm audit --omit=dev --audit-level=high
npm run lint && npm run build
```

## A08 — états des sauvegardes et exports partiels

`Backup.status=COMPLETED` pour `base-*` signifie que la copie distante chiffrée
a été vérifiée par SHA-256 et publiée avec son manifeste. `LOCAL_ONLY` et
`REMOTE_FAILED` n'alimentent pas le contrôle de santé. Les routes
`/api/superowner/backups` restent limitées aux exports partiels `export-partiel-*` ;
elles refusent la lecture, restauration et suppression des archives serveur
avec `409 BACKUP_MANAGED_EXTERNALLY`. Les archives complètes se restaurent avec
`deploy/zup.sh restore-test` dans une base dédiée isolée. Voir le
[contrat et la procédure A08](../docs/SAUVEGARDES-RESTAURATION-A08.md).

## A07 — Facturation structurée

Les factures plateforme enregistrent XML UBL et instantané des parties, mais
aucun Access Point n'est configuré et aucun adaptateur externe n'est livré.
`PEPPOL_PROVIDER` vide garde l'envoi désactivé ; une valeur inconnue échoue
explicitement. L'API factures reste réservée au superowner. La réception et les
accusés asynchrones ne sont pas implémentés. Contrats, contrôles, exploitation,
preuves réglementaires et blocages : [guide A07](../docs/FACTURATION-STRUCTUREE-A07.md).

## Santé des dépendances (A14)

`GET /health` est la liveness sans dépendance. `GET /health/ready` requiert
PostgreSQL et, en production, Redis; 503 indique que le trafic général ne peut
pas être garanti. La réponse reste générique et n'inclut aucun détail réseau.
ClamAV indisponible bloque les dépôts en refus sûr sans rendre l'API
indisponible; SMTP et les fournisseurs externes restent des capacités
dégradées. Matrice, délais/cache, reprises et limites des alertes :
[DEPENDANCES-SANTE](../docs/DEPENDANCES-SANTE.md).

```bash
npx jest src/modules/monitoring/__tests__/sondes.test.ts --runInBand
npx jest src/modules/files/__tests__/antivirus.test.ts --runInBand
```

## A11 — Webhooks sortants ZupDrive

Le worker PostgreSQL, la signature HMAC-SHA256, les reprises bornées, l'inspection
et la reprise superowner sont implémentés. `ZUPDRIVE_WEBHOOKS_ENABLED` vaut
`false` par défaut : les services métier n'émettent pas encore ces événements,
donc l'intégration n'est pas annoncée comme fonctionnelle. Migration additive
`20261011100000_durable_zupdrive_webhooks`. Voir le [contrat, l'API, les tests
et la procédure d'exploitation](../docs/WEBHOOKS-ZUPDRIVE-A11.md).

## A10 — liens de compte

Reset et confirmation exigent une mutation PostgreSQL d'exactement une ligne
avec empreinte et expiration encore valides. Leurs effets métier sont atomiques,
y compris révocation des sessions et rattachement de la fiche invitée.
[Contrats API, configuration, tests et exploitation](../docs/LIENS-COMPTE-A10.md).
Aucune migration ni nouvelle variable ; la validation PostgreSQL demande une
base de test dédiée migrée.

## MFA des comptes privilégiés (A05)

`/api/auth/mfa` gère TOTP via otplib 13.5.0 ; les gardes HTTP et Socket.IO
vérifient `SessionConnexion.mfaVerifiedAt/mfaVersion`. Migration `0068_mfa`,
secrets AES-GCM dans `MfaFactor` et récupération SHA256 à usage unique.
Enrôlement progressif `MFA_MODE=enrollment`, puis obligation `enforced` ;
les mutations privilégiées et lectures financières sensibles exigent cinq minutes.
`npm run mfa:operator -- inventory|recover …` / `node dist/mfa-operator.js …`
préparent le roster et le secours à deux opérateurs avec ticket.
Ne pas enlever une clé AES encore référencée par un facteur.
[Guide API/configuration/migration/exploitation](../docs/MFA.md),
[tests et preuves](../docs/preuves-a05-2026-10-10.md).

Monolithe modulaire Express/TypeScript, PostgreSQL/Prisma. Les règles et commandes
communes figurent dans [l'architecture](ARCHITECTURE.md) et le [CLAUDE racine](../CLAUDE.md).

## Relevés et lots bancaires A04

Paiement manuel, annulation et préparation utilisent des mutations conditionnelles
`PENDING` avec lot nul, exactement une ligne. L'annulation du relevé et la
libération de ses gains sont atomiques ; la clôture du lot contrôle l'ensemble
de ses lignes et leurs montants figés. Le perdant reçoit 409. Aucun virement
réel ni nouvelle migration/configuration serveur.

[Contrats API, commandes, diagnostic et exploitation](../docs/VERSEMENTS-CONCURRENCE.md),
[preuves datées](../docs/preuves-a04-2026-10-09.md).

```bash
# Base PostgreSQL dédiée contenant test dans son nom, migrée :
PAYOUT_INTEGRATION=true npx jest src/modules/payouts/__tests__ --runInBand
# Configuration PostgreSQL et chiffrement de l'environnement chargé :
npm run payouts:diagnostic
```

La CI réserve `payouts_test` aux courses A04 déterministes. Sans opt-in, elles
sont ignorées. Le diagnostic impose une transaction en lecture seule et retourne
0 sans écart, 2 avec écarts, 1 si indisponible ; les corrections historiques
restent à examiner avec les pièces bancaires.

## Paiements et remboursements A03

`payments/refund.service.ts` persiste l'intention dans les transactions métier,
réconcilie Stripe hors transaction et conserve la clé d'idempotence. Le job de
10 secondes suit le leader et la surveillance existants. L'outbox de notifications
ne porte aucune opération financière. Le montant inclut le pourboire de la même
intention ; seul un succès effectif marque `REFUNDED`.

Consulter le [guide de migration, API et reprise](../docs/REMBOURSEMENTS-REPRISE.md)
et les [preuves datées](../docs/preuves-a03-2026-10-09.md). Migration additive
`20261009150000_durable_refunds` à appliquer avant le nouveau code. Variables
Stripe existantes, aucune nouvelle variable. API de revue et reprise réservées
aux permissions `billing` ; demandes et reprises auditées.

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
npx tsc --noEmit
npm run lint
REFUND_INTEGRATION=true npm test
npm run build
# Sur DATABASE_URL de test dédiée :
node scripts/verification/refund-migration.mjs
# Stripe TEST externe, avec configuration locale complète et CLI :
node scripts/security/audit-stripe-sandbox.mjs --run
```

Les tests A03 d'intégration sont ignorés sans `REFUND_INTEGRATION=true` ; la CI les
active sur PostgreSQL de test. Le runner externe n'accepte pas de clé LIVE.
Un résultat local ne prouve ni intégration dans la branche principale, ni
migration/déploiement, ni bon acheminement des alertes en exploitation.
# Rotation A09

Le refresh est consommé et son successeur écrit atomiquement sous verrou
PostgreSQL. Le navigateur transmet `X-Refresh-Request` (et le corps mobile
`requestId`), preuve aléatoire réutilisée pour un retry après perte de réponse.
Reprise limitée à 10 secondes; une autre preuve rejouée révoque la session.
Migration additive `20261010120000_atomic_refresh_rotation`; appliquer avec
`npx prisma migrate deploy`. Contrat, codes API, précautions et tests :
[ROTATION-SESSIONS-A09](../docs/ROTATION-SESSIONS-A09.md).
