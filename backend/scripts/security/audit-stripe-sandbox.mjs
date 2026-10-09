/** Vrai Stripe TEST + PostgreSQL temporaire + API locale + Stripe CLI.
 * Usage depuis backend : node scripts/security/audit-stripe-sandbox.mjs --run
 * Ne lit que .env ; aucune valeur de secret n'est écrite dans le rapport.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import dotenv from 'dotenv';
import pg from 'pg';
import Stripe from 'stripe';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { writeAuditReport } from './audit-report.mjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

if (!process.argv.includes('--run')) throw new Error('Ajouter --run pour les opérations Stripe de test.');
const root = process.cwd();
if (!root.endsWith('backend')) throw new Error('Exécuter depuis backend.');
const config = dotenv.parse(await fs.readFile(path.join(root, '.env')));
const key = config.STRIPE_SECRET_KEY;
if (!/^(sk|rk)_test_/.test(key || '')) throw new Error('Clé Stripe test obligatoire.');
const adminUrl = new URL(config.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(adminUrl.hostname)) throw new Error('PostgreSQL local obligatoire.');
adminUrl.pathname = '/postgres';
const run = `saas_test_audit_stripe_${Date.now()}_${randomBytes(3).toString('hex')}`;
const testUrl = new URL(adminUrl); testUrl.pathname = `/${run}`;
const report = { run, startedAt: new Date().toISOString(), testMode: true, checks: [], stripeObjects: [], cleanup: {} };
const stripe = new Stripe(key, { maxNetworkRetries: 2, timeout: 15000 });
const admin = new pg.Client({ connectionString: adminUrl.href });
let prisma, apiChild, cliChild, created = false, api;
const intentions = new Set();
const childEnv = {
  ...process.env, DATABASE_URL: testUrl.href, NODE_ENV: 'test', LOG_LEVEL: 'error',
  JWT_SECRET: randomBytes(32).toString('hex'), JWT_REFRESH_SECRET: randomBytes(32).toString('hex'),
  ENABLE_STRIPE: 'true', ENABLE_EMAIL_VERIFICATION: 'false', STRIPE_SECRET_KEY: key,
  REDIS_URL: '', SMTP_HOST: '127.0.0.1', SMTP_PORT: '1', SMTP_USER: '', SMTP_PASSWORD: '',
  SMTP_SECURE: 'false', SENDGRID_API_KEY: '', PAYOUTS_START_DATE: '',
  STRIPE_API_KEY: key, STRIPE_DEVICE_NAME: 'zupeat-audit-isole',
};
delete childEnv.REDIS_URL;
delete childEnv.PAYOUTS_START_DATE;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  report.checks.push({ name, actual, expected, ok });
  console.log(`${ok ? 'OK' : 'ECHEC'} ${name}`);
  if (!ok) throw new Error(`Contrôle échoué : ${name}`);
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function attendre(name, lire, predicate, timeout = 45000) {
  const fin = Date.now() + timeout;
  while (Date.now() < fin) { const value = await lire(); if (predicate(value)) return value; await pause(300); }
  throw new Error(`Délai dépassé : ${name}`);
}
function enfant(args, env = childEnv) {
  return spawn(process.execPath, args, { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
}
async function terminerEnfant(child) {
  if (!child || child.exitCode !== null) return;
  const fini = new Promise((resolve) => child.once('exit', resolve));
  child.kill(); await Promise.race([fini, pause(5000)]);
}
async function portLibre() {
  const server = createServer(); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; await new Promise((resolve) => server.close(resolve)); return port;
}
async function call(method, route, body, token) {
  const response = await fetch(api + route, { method, redirect: 'error', signal: AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let data; try { data = await response.json(); } catch { data = null; }
  return { status: response.status, data };
}
async function evenement(type, objectId, status) {
  return attendre(type, async () => (await call('GET', '/audit/events')).data,
    (events) => events?.some((e) => e.type === type && e.objectId === objectId && e.status === status))
    .then((events) => events.find((e) => e.type === type && e.objectId === objectId && e.status === status));
}
async function creerCommande(storeId, label) {
  const trackingToken = randomBytes(32).toString('base64url');
  const order = await prisma.order.create({ data: {
    storeId, customerName: `Audit ${label}`, customerEmail: 'audit@example.invalid', customerPhone: '0400000000',
    deliveryType: 'PICKUP', totalAmount: 2, taxAmount: 0, feesAmount: 0, status: 'PENDING',
    submittedAt: null, trackingTokenHash: createHash('sha256').update(trackingToken).digest('hex'),
  } });
  return { id: order.id, trackingToken };
}
async function intention(order) {
  const r = await call('POST', '/api/payments/intent', { orderId: order.id, trackingToken: order.trackingToken });
  check('création HTTP intention', r.status, 201);
  intentions.add(r.data.paymentIntentId);
  return r.data.paymentIntentId;
}
try {
  const balance = await stripe.balance.retrieve(); check('Stripe authentifié exclusivement en test', balance.livemode, false);
  await admin.connect();
  await admin.query(`CREATE DATABASE "${run}"`); created = true;
  const migration = enfant(['node_modules/prisma/build/index.js', 'migrate', 'deploy']);
  // Les logs des sous-processus ne sortent pas : peuvent contenir secrets SQL.
  migration.stdout.resume(); migration.stderr.resume();
  const code = await new Promise((resolve, reject) => { migration.once('error', reject); migration.once('exit', resolve); });
  check('migrations sur base temporaire neuve', code, 0);
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl.href }) });
  const port = await portLibre(); api = `http://127.0.0.1:${port}`;
  childEnv.PORT = String(port); childEnv.API_URL = api; childEnv.FRONTEND_URL = api;
  cliChild = spawn(process.env.AUDIT_STRIPE_CLI || 'stripe', [
    '--config', path.join(root, 'node_modules', '.cache', `stripe-${run}.toml`),
    'listen', '--events', 'payment_intent.succeeded,payment_intent.payment_failed,payment_intent.canceled,charge.refunded,refund.failed,refund.updated',
    '--forward-to', `${api}/api/payments/webhook`,
  ], { cwd: root, env: childEnv, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const secret = await new Promise((resolve, reject) => {
    let buffer = ''; const timer = setTimeout(() => reject(new Error('Stripe CLI non prêt')), 30000);
    const recevoir = (chunk) => { buffer += chunk.toString(); const trouve = buffer.match(/whsec_[A-Za-z0-9]+/); if (trouve) { clearTimeout(timer); resolve(trouve[0]); } };
    cliChild.stdout.on('data', recevoir); cliChild.stderr.on('data', recevoir);
    cliChild.once('error', () => { clearTimeout(timer); reject(new Error('Impossible de lancer Stripe CLI')); });
    cliChild.once('exit', () => { clearTimeout(timer); reject(new Error('Stripe CLI interrompu')); });
  });
  childEnv.STRIPE_WEBHOOK_SECRET = secret;
  apiChild = enfant(['--import', 'tsx', 'scripts/security/stripe-sandbox-server.ts']);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('API locale non prête')), 30000);
    apiChild.stdout.on('data', (chunk) => { if (chunk.toString().includes('AUDIT_READY:')) { clearTimeout(timer); resolve(); } });
    apiChild.stderr.resume();
    apiChild.once('exit', () => { clearTimeout(timer); reject(new Error('API locale interrompue')); });
  });
  check('API isolée disponible', (await call('GET', '/health/ready')).status, 200);
  const org = await prisma.organization.create({ data: { name: 'Audit Stripe temporaire', slug: run, approvedAt: new Date() } });
  const store = await prisma.store.create({ data: { orgId: org.id, name: 'Audit isolé', slug: run } });
  const user = await prisma.user.create({ data: { email: `${run}@example.invalid`, passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), 10), emailVerified: true, isSuperOwner: true } });
  const session = await prisma.sessionConnexion.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 3600000) } });
  const token = jwt.sign({ userId: user.id, sid: session.id }, childEnv.JWT_SECRET, { expiresIn: '1h' });
  const order = await creerCommande(store.id, 'paiement');
  const responses = await Promise.all([0, 1].map(() => call('POST', '/api/payments/intent', { orderId: order.id, trackingToken: order.trackingToken })));
  for (const response of responses) if (response.data?.paymentIntentId) intentions.add(response.data.paymentIntentId);
  check('deux créations concurrentes HTTP', responses.map((r) => r.status), [201, 201]);
  const piId = responses[0].data.paymentIntentId; intentions.add(piId);
  check('même intention Stripe pour deux appels', responses[1].data.paymentIntentId, piId);
  check('un seul paiement enregistré', await prisma.payment.count({ where: { orderId: order.id } }), 1);
  const paid = await stripe.paymentIntents.confirm(piId, { payment_method: 'pm_card_visa' });
  check('carte de test encaissée chez Stripe', paid.status, 'succeeded');
  check('aucun mode live', paid.livemode, false);
  const paidEvent = await evenement('payment_intent.succeeded', piId, 200);
  check('webhook réellement reçu et signé accepté', paidEvent.status, 200);
  const saved = await attendre('commande payée', () => prisma.order.findUnique({ where: { id: order.id } }), (o) => o.paymentStatus === 'SUCCEEDED' && !!o.submittedAt);
  check('montant encaissé exact', paid.amount_received, 200);
  check('paiement confirmé en base', (await prisma.payment.findUnique({ where: { orderId: order.id } })).status, 'SUCCEEDED');
  check('rejeu du webhook signé', (await call('POST', `/audit/replay/${paidEvent.id}`)).status, 200);
  check('transmission commerçant non doublée', (await prisma.order.findUnique({ where: { id: order.id } })).submittedAt.toISOString(), saved.submittedAt.toISOString());
  check('confirmation client légitime', (await call('POST', '/api/payments/confirm', { orderId: order.id, paymentIntentId: piId, trackingToken: order.trackingToken })).data.success, true);
  const refunded = await call('POST', `/api/superowner/orders/${order.id}/refund`, { raison: 'Fin du test Stripe isolé' }, token);
  check('remboursement HTTP autorisé', refunded.status, 200);
  const re = await stripe.refunds.retrieve(refunded.data.refundId);
  check('remboursement réellement réussi chez Stripe test', re.status, 'succeeded');
  check('montant restitué exact', re.amount, 200);
  const chargeId = typeof paid.latest_charge === 'string' ? paid.latest_charge : paid.latest_charge.id;
  await evenement('charge.refunded', chargeId, 200);
  check('commande remboursée en base', (await prisma.order.findUnique({ where: { id: order.id } })).paymentStatus, 'REFUNDED');
  check('répétition du remboursement refusée', (await call('POST', `/api/superowner/orders/${order.id}/refund`, { raison: 'Fin du test Stripe isolé' }, token)).status, 409);
  check('une seule restitution Stripe', (await stripe.refunds.list({ payment_intent: piId })).data.length, 1);
  check('ancien succès signé après remboursement', (await call('POST', `/audit/replay/${paidEvent.id}`)).status, 200);
  check('rejeu ne ressuscite pas la commande', (await prisma.order.findUnique({ where: { id: order.id } })).paymentStatus, 'REFUNDED');

  // Erreur PostgreSQL réelle après mise à jour de la commande, avant paiement.
  const rollback = await creerCommande(store.id, 'rollback');
  const rollbackPi = await intention(rollback);
  if (!/^[a-z0-9]+$/.test(rollback.id)) throw new Error('Identifiant de fixture invalide');
  await prisma.$executeRawUnsafe(`CREATE FUNCTION audit_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."orderId" = '${rollback.id}' AND NEW.status::text = 'SUCCEEDED' THEN RAISE EXCEPTION 'audit rollback attendu'; END IF; RETURN NEW; END $$`);
  await prisma.$executeRawUnsafe('CREATE TRIGGER audit_guard BEFORE INSERT OR UPDATE ON "Payment" FOR EACH ROW EXECUTE FUNCTION audit_guard()');
  const rollbackPaid = await stripe.paymentIntents.confirm(rollbackPi, { payment_method: 'pm_card_visa' });
  const failedEvent = await evenement('payment_intent.succeeded', rollbackPi, 500);
  check('incident SQL : webhook 500 pour réessai', failedEvent.status, 500);
  const rolledBack = await prisma.order.findUnique({ where: { id: rollback.id } });
  check('rollback réel du statut commande', rolledBack.paymentStatus, 'PENDING');
  check('rollback réel de la transmission', rolledBack.submittedAt, null);
  check('paiement non partiellement enregistré', (await prisma.payment.findUnique({ where: { orderId: rollback.id } })).status, 'PENDING');
  await prisma.$executeRawUnsafe('DROP TRIGGER audit_guard ON "Payment"');
  await prisma.$executeRawUnsafe('DROP FUNCTION audit_guard()');
  check('rejeu signé après réparation SQL', (await call('POST', `/audit/replay/${failedEvent.id}`)).status, 200);
  check('récupération après rollback', (await prisma.order.findUnique({ where: { id: rollback.id } })).paymentStatus, 'SUCCEEDED');
  const concurrent = await Promise.all([0, 1].map(() => call('POST', `/api/superowner/orders/${rollback.id}/refund`, { raison: 'Fin du test de concurrence' }, token)));
  check('remboursement concurrent sans erreur interne', concurrent.every((r) => [200, 409].includes(r.status)) && concurrent.some((r) => r.status === 200), true);
  check('une restitution malgré la concurrence', (await stripe.refunds.list({ payment_intent: rollbackPi })).data.length, 1);
  const secondCharge = typeof rollbackPaid.latest_charge === 'string' ? rollbackPaid.latest_charge : rollbackPaid.latest_charge.id;
  await evenement('charge.refunded', secondCharge, 200);
  check('statut final paiement du rollback', (await prisma.payment.findUnique({ where: { orderId: rollback.id } })).status, 'REFUNDED');
  check('statut final commande du rollback', (await prisma.order.findUnique({ where: { id: rollback.id } })).paymentStatus, 'REFUNDED');
  // A03 : paiement après refus, avec panne avant appel ou perte de réponse.
  // Le worker réel du serveur TEST reprend son registre PostgreSQL.
  for (const panne of ['before', 'after']) {
    const tardive = await creerCommande(store.id, `a03-${panne}`);
    await prisma.order.update({ where: { id: tardive.id }, data: { tipAmount: 1 } });
    const tardivePi = await intention(tardive);
    await prisma.order.update({ where: { id: tardive.id }, data: { status: 'REJECTED' } });
    check(`A03 injection ${panne}`, (await call('POST', `/audit/refund-fault/${panne}`)).status, 204);
    const encaissement = await stripe.paymentIntents.confirm(tardivePi, { payment_method: 'pm_card_visa' });
    check(`A03 montant commande et pourboire ${panne}`, encaissement.amount_received, 300);
    const event = await evenement('payment_intent.succeeded', tardivePi, 200);
    const operation = await attendre(`A03 remboursement durable ${panne}`,
      () => prisma.refundOperation.findFirst({ where: { paymentIntentId: tardivePi }, include: { history: true } }),
      o => o?.status === 'SUCCEEDED', 90000);
    check(`A03 panne inscrite puis reprise ${panne}`, operation.history.some(e => e.status === 'RETRY' && e.code === 'STRIPE_OR_DATABASE_UNAVAILABLE'), true);
    check(`A03 un seul remboursement Stripe ${panne}`, (await stripe.refunds.list({ payment_intent: tardivePi })).data.length, 1);
    check(`A03 restitution intégrale ${panne}`, (await stripe.refunds.retrieve(operation.stripeRefundId)).amount, 300);
    check(`A03 rejeu signé ${panne}`, (await call('POST', `/audit/replay/${event.id}`)).status, 200);
    const finale = await prisma.order.findUnique({ where: { id: tardive.id } });
    check(`A03 refus conservé ${panne}`, finale.status, 'REJECTED');
    check(`A03 aucune transmission commerçant ${panne}`, finale.submittedAt, null);
    check(`A03 remboursement confirmé ${panne}`, finale.paymentStatus, 'REFUNDED');
  }
  report.stripeObjects = [...intentions];
} catch (error) {
  // Ni message Stripe brut, ni paramètres SQL, ni secrets dans les sorties.
  report.error = error.type ? `Stripe ${error.type} (${error.code || 'sans code'})` :
    error.name?.startsWith('Prisma') ? `Prisma ${error.code || error.name}` : error.message;
  console.error(report.error);
} finally {
  // Annuler ou rembourser aussi les objets de test laissés par un échec.
  report.cleanup.stripe = [];
  for (const id of intentions) {
    try {
      const pi = await stripe.paymentIntents.retrieve(id, { expand: ['latest_charge'] });
      if (pi.status === 'succeeded') {
        const charge = pi.latest_charge;
        if (charge && typeof charge !== 'string' && charge.amount_refunded < charge.amount) {
          await stripe.refunds.create({ payment_intent: id }, { idempotencyKey: `audit-cleanup-${run}-${id}` });
        }
        const final = await stripe.paymentIntents.retrieve(id, { expand: ['latest_charge'] });
        report.cleanup.stripe.push({ id, refunded: typeof final.latest_charge !== 'string' && final.latest_charge?.amount_refunded === final.amount });
      } else if (pi.status !== 'canceled') {
        await stripe.paymentIntents.cancel(id); report.cleanup.stripe.push({ id, canceled: true });
      } else report.cleanup.stripe.push({ id, canceled: true });
    } catch (e) { report.cleanup.stripe.push({ id, error: e.type || 'cleanup failed' }); }
  }
  await terminerEnfant(cliChild); await terminerEnfant(apiChild);
  // Fichier CLI réservé à ce run, sous le workspace ; jamais le profil utilisateur.
  await fs.rm(path.join(root, 'node_modules', '.cache', `stripe-${run}.toml`), { force: true });
  if (prisma) await prisma.$disconnect();
  if (created && /^saas_test_audit_stripe_[a-z0-9_]+$/.test(run)) {
    try {
      await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()', [run]);
      await admin.query(`DROP DATABASE "${run}"`); report.cleanup.databaseDropped = true;
    } catch { report.cleanup.databaseDropped = false; }
  }
  await admin.end();
  report.finishedAt = new Date().toISOString();
  report.passed = report.checks.filter((c) => c.ok).length; report.failed = report.checks.filter((c) => !c.ok).length;
  const file = await writeAuditReport(`audit-stripe-sandbox-${Date.now()}.json`, report);
  console.log(`Rapport : ${file} ; ${report.passed} réussis, ${report.failed} échoués`);
  if (report.error || report.failed || report.cleanup.databaseDropped === false || report.cleanup.stripe.some((r) => r.error || (!r.refunded && !r.canceled))) process.exitCode = 1;
}
