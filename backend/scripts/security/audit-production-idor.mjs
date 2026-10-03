// Audit HTTP autonome : aucun accès SQL, aucun reset, aucune commande/paiement.
// Usage : node scripts/security/audit-production-idor.mjs https://api.zupeat.com --run
// Les ouvertures de tickets peuvent laisser des notifications/traces d'audit.
import https from 'node:https';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const target = new URL(process.argv[2] || 'https://api.zupeat.com');
if (!process.argv.includes('--run')) throw new Error('Exécution explicite requise : URL --run');
if (target.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(target.hostname)) {
  throw new Error('HTTPS requis hors localhost');
}
if (target.username || target.password || target.pathname !== '/' || target.search || target.hash) {
  throw new Error('Fournir uniquement l’origine de l’API');
}
const run = `audit-idor-${Date.now()}-${randomBytes(4).toString('hex')}`;
const report = { run, target: target.origin, startedAt: new Date().toISOString(), fixtures: [], checks: [], cleanup: [] };
const accounts = [];

// http.request permet aussi de tester un GET avec corps, interdit par fetch.
// Pas de redirection : un jeton ne doit jamais être envoyé à une autre origine.
async function request(method, path, account, body) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = (target.protocol === 'https:' ? https : http).request(new URL(path, target), {
      method,
      headers: {
        ...(account ? { Authorization: `Bearer ${account.token}` } : {}),
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
      timeout: 20000,
    }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { text += chunk; if (text.length > 2000000) req.destroy(new Error('Réponse trop grande')); });
      res.on('end', () => {
        let data;
        try { data = JSON.parse(text); } catch { data = null; }
        resolve({ status: res.statusCode, data });
      });
    });
    req.on('timeout', () => req.destroy(new Error('Délai HTTP dépassé')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}
function check(name, actual, expected) {
  const ok = actual === expected;
  report.checks.push({ name, actual, expected, ok });
  console.log(`${ok ? 'OK' : 'ECHEC'} ${name} : ${actual}`);
}
async function status(name, method, path, account, body, expected) {
  const r = await request(method, path, account, body);
  check(name, r.status, expected);
  return r;
}
function ticketBody(account) {
  return { orgId: account.orgId, subject: `[AUDIT AUTOMATISE] ${run}`, description: 'Test de sécurité autorisé, aucune demande client. Suppression à la fin du test.', priority: 'LOW', category: 'TECHNICAL' };
}
try {
  for (const name of ['alice', 'bob']) {
    const signup = await request('POST', '/api/auth/signup', undefined, {
      name: `Audit IDOR ${name}`, email: `${name}-${run}@example.invalid`,
      password: `Aa1!${randomBytes(24).toString('hex')}`, conditionsAcceptees: true,
    });
    if (signup.status !== 201 || !signup.data?.accessToken || !signup.data?.user?.id) {
      throw new Error(`Inscription ${name} : HTTP ${signup.status} (${signup.data?.code || signup.data?.error?.code || 'sans code'})`);
    }
    const account = { name, token: signup.data.accessToken, userId: signup.data.user.id, tickets: new Set() };
    accounts.push(account);
    const fixture = { name, userId: account.userId };
    report.fixtures.push(fixture);
    const org = await request('POST', '/api/organizations', account, { name: `Audit temporaire ${name}`, slug: `${run}-${name}` });
    if (org.status !== 201 || !org.data?.org?.id) throw new Error(`Organisation ${name} : HTTP ${org.status}`);
    account.orgId = org.data.org.id;
    fixture.orgId = account.orgId;
    const created = await request('POST', '/api/support/tickets', account, ticketBody(account));
    if (created.status !== 201 || !created.data?.data?.id) throw new Error(`Ticket ${name} : HTTP ${created.status}`);
    account.ticketId = created.data.data.id;
    account.tickets.add(account.ticketId);
    fixture.ticketId = account.ticketId;
  }
  const [alice, bob] = accounts;
  for (const owner of accounts) {
    const intruder = owner === alice ? bob : alice;
    const base = `/api/support/tickets/${owner.ticketId}`;
    const operations = [
      ['lecture', 'GET', base],
      ['liste', 'GET', `/api/support/tickets?orgId=${owner.orgId}`],
      ['archives', 'GET', `/api/support/tickets?orgId=${owner.orgId}&archived=true`],
      ['création', 'POST', '/api/support/tickets', ticketBody(owner)],
      ['statut', 'PATCH', `${base}/status`, { status: 'IN_PROGRESS' }],
      ['suppression', 'DELETE', base],
      ['messages', 'GET', `${base}/messages`],
    ];
    for (const [name, method, path, body] of operations) {
      for (const actor of [undefined, intruder]) {
        const r = await status(`${owner.name} ${name} ${actor ? 'inter-tenant' : 'sans jeton'}`, method, path, actor, body, actor ? 403 : 401);
        // Si une création intrusive réussit, ne laisser aucun ticket ajouté par le test.
        if (method === 'POST' && r.data?.data?.id) owner.tickets.add(r.data.data.id);
      }
    }
    const intact = await status(`${owner.name} ticket toujours lisible`, 'GET', base, owner, undefined, 200);
    check(`${owner.name} statut intact`, intact.data?.status, 'OPEN');
    const list = await status(`${owner.name} liste légitime`, 'GET', `/api/support/tickets?orgId=${owner.orgId}`, owner, undefined, 200);
    check(`${owner.name} un seul ticket`, list.data?.data?.length, 1);
    await status(`${owner.name} changement légitime`, 'PATCH', `${base}/status`, owner, { status: 'IN_PROGRESS' }, 200);
    const updated = await request('GET', base, owner);
    check(`${owner.name} statut enregistré`, updated.data?.status, 'IN_PROGRESS');

    for (const route of ['organizations', 'Organizations', '%6frganizations']) {
      await status(`${owner.name} organisation ${route} inter-tenant`, 'GET', `/api/${route}/${owner.orgId}`, intruder, undefined, 403);
    }
    await status(`${owner.name} organisation sans jeton`, 'GET', `/api/organizations/${owner.orgId}`, undefined, undefined, 401);
    await status(`${owner.name} organisation légitime`, 'GET', `/api/organizations/${owner.orgId}`, owner, undefined, 200);
    // Liste sensible : le corps ne doit jamais sélectionner l'utilisateur voisin.
    const anonymous = await request('GET', '/api/organizations', undefined, { userId: owner.userId });
    check(`${owner.name} liste organisations sans jeton`, anonymous.status, 401);
    const injected = await request('GET', '/api/organizations', intruder, { userId: owner.userId });
    check(`${owner.name} liste organisations identité injectée ignorée`,
      injected.status === 200 && Array.isArray(injected.data) && injected.data.length === 1 && injected.data[0].id === intruder.orgId, true);
  }
  for (const path of ['/api/admin/config', '/api/superowner/dashboard', '/api/zupdrive/admin/chauffeurs']) {
    await status(`${path} compte ordinaire`, 'GET', path, bob, undefined, 403);
  }
} catch (error) {
  report.error = error.message;
  console.error(`Audit interrompu : ${error.message}`);
} finally {
  // Suppression uniquement des identifiants obtenus en réponse à nos créations.
  for (const account of accounts.reverse()) {
    try {
      for (const id of account.tickets) {
        const deletion = await request('DELETE', `/api/support/tickets/${id}`, account);
        check(`${account.name} suppression légitime`, deletion.status, 200);
        const after = await request('GET', `/api/support/tickets/${id}`, account);
        check(`${account.name} ticket supprimé`, after.status, 404);
        report.cleanup.push({ type: 'ticket', id, status: deletion.status });
      }
      if (account.orgId) {
        const deletion = await request('DELETE', `/api/organizations/${account.orgId}`, account);
        report.cleanup.push({ type: 'organization', id: account.orgId, status: deletion.status });
        if (deletion.status !== 200) throw new Error(`Suppression organisation : ${deletion.status}`);
        const after = await request('GET', `/api/organizations/slug/${run}-${account.name}`);
        check(`${account.name} organisation supprimée`, after.status, 404);
      }
      const deletion = await request('POST', '/api/client/me/suppression', account, { motif: `Fin du test autorisé ${run}` });
      report.cleanup.push({ type: 'account', id: account.userId, status: deletion.status, entireAccountDeleted: deletion.data?.data?.compteEntierSupprime });
      check(`${account.name} compte supprimé`, deletion.status === 200 && deletion.data?.data?.compteEntierSupprime === true, true);
      const after = await request('GET', '/api/client/me', account);
      check(`${account.name} session révoquée`, after.status, 401);
    } catch (error) {
      report.cleanup.push({ type: 'error', account: account.name, message: error.message });
      console.error(`Nettoyage ${account.name} incomplet : ${error.message}`);
    }
  }
  report.finishedAt = new Date().toISOString();
  report.passed = report.checks.filter(c => c.ok).length;
  report.failed = report.checks.filter(c => !c.ok).length;
  const output = `${run}.json`;
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(`Rapport : ${output} ; ${report.passed} réussis, ${report.failed} échoués`);
  if (report.error || report.failed || report.cleanup.some(c => c.type === 'error')) process.exitCode = 1;
}
