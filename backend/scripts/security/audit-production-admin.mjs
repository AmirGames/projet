// Sonde autorisée : un compte client temporaire, aucune mutation d'administration.
// node backend/scripts/security/audit-production-admin.mjs https://api.zupeat.com --run
import { randomBytes } from 'node:crypto';
import { writeAuditReport } from './audit-report.mjs';
const origin = new URL(process.argv[2] || 'https://api.zupeat.com');
if (!process.argv.includes('--run') || origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Origine HTTPS et --run requis');
const run = `audit-admin-${Date.now()}-${randomBytes(4).toString('hex')}`;
const report = { run, target: origin.origin, startedAt: new Date().toISOString(), checks: [] };
let token;
async function call(method, path, authenticated = false, body) {
  const r = await fetch(new URL(path, origin), { method, redirect: 'error', signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  let data;
  try { data = await r.json(); } catch { data = null; }
  return { status: r.status, data };
}
function check(name, actual, expected) {
  const ok = actual === expected;
  report.checks.push({ name, actual, expected, ok });
  console.log(`${ok ? 'OK' : 'ECHEC'} ${name} : ${actual}`);
}
try {
  const signup = await call('POST', '/api/auth/signup', false, { email: `${run}@example.invalid`, name: 'Audit administration temporaire', password: `Aa1!${randomBytes(24).toString('hex')}`, conditionsAcceptees: true });
  if (signup.status !== 201 || !signup.data?.accessToken) throw new Error(`Inscription : HTTP ${signup.status}`);
  token = signup.data.accessToken;
  report.userId = signup.data.user?.id;
  const invitations = await call('GET', '/api/zupdrive/chauffeur/me/invitations', true);
  check('invitations adresse non confirmée', invitations.status, 403);
  check('motif de refus adresse non confirmée', invitations.data?.code, 'EMAIL_NOT_VERIFIED');
  for (const path of ['/api/admin/config', '/api/superowner/admins', '/api/superowner/roles', '/api/zupdrive/admin/chauffeurs']) {
    check(`${path} sans token`, (await call('GET', path)).status, 401);
    check(`${path} compte ordinaire`, (await call('GET', path, true)).status, 403);
  }
} catch (error) {
  report.error = error.message;
  console.error(`Sonde interrompue : ${error.message}`);
} finally {
  if (token) {
    try {
      const deletion = await call('POST', '/api/client/me/suppression', true, { motif: `Fin de la sonde autorisée ${run}` });
      check('compte temporaire supprimé', deletion.status === 200 && deletion.data?.data?.compteEntierSupprime === true, true);
      check('session révoquée', (await call('GET', '/api/client/me', true)).status, 401);
    } catch (error) { report.cleanupError = error.message; }
  }
  report.finishedAt = new Date().toISOString();
  report.failed = report.checks.filter(c => !c.ok).length;
  const output = await writeAuditReport(`${run}.json`, report);
  console.log(`Rapport : ${output} ; ${report.checks.length - report.failed} réussis, ${report.failed} échoués`);
  if (report.error || report.cleanupError || report.failed) process.exitCode = 1;
}
