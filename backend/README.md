# Backend ZupEat / ZupDrive

Monolithe modulaire Express/TypeScript, PostgreSQL/Prisma. Les règles et commandes
communes figurent dans [l'architecture](ARCHITECTURE.md) et le [CLAUDE racine](../CLAUDE.md).

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
