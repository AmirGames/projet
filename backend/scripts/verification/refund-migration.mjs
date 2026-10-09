/** Vérifie la migration additive A03 sur une fixture historique, puis rollback. */
import pg from 'pg';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const url = new URL(process.env.DATABASE_URL || '');
if (!/test/i.test(url.pathname)) throw new Error('Base de test dédiée obligatoire');
const sql = await fs.readFile(new URL('../../prisma/migrations/20261009150000_durable_refunds/migration.sql', import.meta.url), 'utf8');
const schema = `a03_migration_${randomUUID().replaceAll('-', '')}`;
const client = new pg.Client({ connectionString: url.href });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET LOCAL search_path TO "${schema}"`);
  await client.query(`CREATE TABLE "Order" ("id" TEXT PRIMARY KEY, "status" TEXT, "deletedAt" TIMESTAMP);
    CREATE TABLE "Payment" ("id" TEXT PRIMARY KEY, "orderId" TEXT, "amount" NUMERIC(10,2), "currency" TEXT, "status" TEXT, "stripePaymentIntentId" TEXT, "stripeRefundId" TEXT);
    INSERT INTO "Order" VALUES ('refus','REJECTED',NULL), ('abandon','PENDING',CURRENT_TIMESTAMP), ('active','ACCEPTED',NULL), ('rendu','REJECTED',NULL);
    INSERT INTO "Payment" VALUES ('p1','refus',35.74,'EUR','SUCCEEDED','pi1',NULL), ('p2','abandon',10.99,'EUR','SUCCEEDED','pi2','re2'), ('p3','active',1,'EUR','SUCCEEDED','pi3',NULL), ('p4','rendu',3,'EUR','REFUNDED','pi4','re4');`);
  const avant = (await client.query('SELECT * FROM "Payment" ORDER BY "id"')).rows;
  await client.query(sql);
  assert.deepEqual((await client.query('SELECT * FROM "Payment" ORDER BY "id"')).rows, avant);
  const operations = (await client.query('SELECT * FROM "RefundOperation" ORDER BY "paymentId"')).rows;
  assert.equal(operations.length, 2);
  assert.equal(operations[0].amountCents, 3574);
  assert.equal(operations[0].stripeRefundId, null);
  assert.equal(operations[1].stripeRefundId, 're2');
  assert(operations.every(o => o.status === 'ABANDONED' && o.lastError === 'HISTORICAL_MANUAL_REVIEW' && o.firstCallAt.getUTCFullYear() === 1970));
  assert.equal((await client.query('SELECT count(*)::int AS n FROM "RefundOperationEvent"')).rows[0].n, 2);
  console.log('A03 migration PostgreSQL : montants/états conservés, cas historiques isolés, sans appel Stripe — OK');
} finally {
  await client.query('ROLLBACK');
  await client.end();
}
