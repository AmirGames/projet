// Sondes sans compte ni mutation : disponibilité et refus des accès privés.
import { io } from '../../node_modules/socket.io-client/build/esm-debug/index.js';
import { writeAuditReport } from './audit-report.mjs';
import { randomUUID } from 'node:crypto';

const cible = new URL(process.argv[2] || 'https://api.zupeat.com');
if (cible.protocol !== 'https:' || cible.username || cible.password || cible.pathname !== '/' || cible.search || cible.hash) {
  throw new Error('Fournir uniquement une origine HTTPS.');
}
if (!process.argv.includes('--run')) throw new Error('Ajouter --run pour lancer les sondes en lecture seule.');
const rapport = { target: cible.origin, startedAt: new Date().toISOString(), checks: [] };
const clients = [];
function attendre(socket, event) {
  return new Promise((resolve, reject) => {
    const delai = setTimeout(() => { socket.off(event, fini); reject(new Error(`Délai dépassé : ${event}`)); }, 15000);
    function fini(data) { clearTimeout(delai); resolve(data); }
    socket.once(event, fini);
  });
}
function verifier(name, actual, expected) {
  const ok = actual === expected;
  rapport.checks.push({ name, actual, expected, ok });
  console.log(`${ok ? 'OK' : 'ECHEC'} ${name} : ${actual}`);
}
try {
  const ready = await fetch(new URL('/health/ready', cible), { redirect: 'error', signal: AbortSignal.timeout(15000) });
  verifier('Disponibilité HTTP', ready.status, 200);
  for (const transport of ['websocket', 'polling']) {
    const socket = io(cible.origin, { transports: [transport], reconnection: false, autoConnect: false });
    clients.push(socket);
    const connecte = attendre(socket, 'connect'); socket.connect(); await connecte;
    verifier(`Connexion publique ${transport}`, socket.connected, true);
    const refuse = attendre(socket, 'acces-refuse');
    socket.emit('join-order', `audit-inexistant-${randomUUID()}`);
    verifier(`Commande sans jeton ${transport}`, (await refuse)?.code, 'FORBIDDEN');
    socket.disconnect();
  }
  const invalide = io(cible.origin, { transports: ['websocket'], reconnection: false, autoConnect: false, auth: { token: 'audit.invalid.token' } });
  clients.push(invalide);
  const refus = attendre(invalide, 'connect_error'); invalide.connect();
  verifier('Jeton invalide refusé', (await refus)?.message, 'Invalid token');
} catch (erreur) {
  rapport.error = erreur.message;
  console.error(erreur.message);
} finally {
  clients.forEach((socket) => socket.disconnect());
  rapport.passed = rapport.checks.filter((c) => c.ok).length;
  rapport.failed = rapport.checks.filter((c) => !c.ok).length;
  const fichier = await writeAuditReport(`audit-socket-${Date.now()}.json`, rapport);
  console.log(`Rapport : ${fichier} ; ${rapport.passed} réussis, ${rapport.failed} échoués`);
  if (rapport.error || rapport.failed) process.exitCode = 1;
}
