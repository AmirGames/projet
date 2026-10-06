/** Serveur réservé au runner isolé ; jamais importé par le serveur de production. */
import { createServer } from 'node:http';
import { createApp } from '../../src/app';
import { db } from '../../src/services/db';

const url = new URL(process.env.DATABASE_URL || '');
if (process.env.NODE_ENV !== 'test' || !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !/^\/saas_test_audit_stripe_[a-z0-9_]+$/.test(url.pathname)) throw new Error('Base temporaire locale obligatoire');
if (!/^(sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY || '')) throw new Error('Stripe test obligatoire');

const app = createApp();
const evenements = new Map<string, { body: Buffer; signature: string; deliveries: { type: string; objectId: string; status: number }[] }>();
const port = Number(process.env.PORT);
const origine = `http://127.0.0.1:${port}`;
const server = createServer(async (req, res) => {
  if (req.url === '/audit/events' && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify([...evenements].flatMap(([id, e]) => e.deliveries.map((d) => ({ id, ...d })))));
    return;
  }
  if (req.url?.startsWith('/audit/replay/') && req.method === 'POST') {
    const id = req.url.slice('/audit/replay/'.length);
    const event = evenements.get(id);
    if (!event) { res.writeHead(404); res.end(); return; }
    try {
      const response = await fetch(`${origine}/api/payments/webhook`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': event.signature },
        body: event.body, signal: AbortSignal.timeout(15000),
      });
      res.writeHead(response.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: response.status }));
    } catch { res.writeHead(500); res.end(); }
    return;
  }
  if (req.url === '/api/payments/webhook' && req.method === 'POST') {
    const chunks: Buffer[] = [];
    let event: { id: string; type: string; data: { object: { id: string } } } | undefined;
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks);
        event = JSON.parse(body.toString());
        if (event?.id && !evenements.has(event.id)) evenements.set(event.id, {
          body, signature: String(req.headers['stripe-signature'] || ''), deliveries: [],
        });
      } catch { /* Les signatures mal formées restent traitées par l'API. */ }
    });
    res.on('finish', () => {
      if (event?.id) evenements.get(event.id)?.deliveries.push({
        type: event.type, objectId: event.data.object.id, status: res.statusCode,
      });
    });
  }
  app(req, res);
});
server.listen(port, '127.0.0.1', () => console.log(`AUDIT_READY:${port}`));
process.on('SIGTERM', () => server.close(async () => { await db.$disconnect(); process.exit(0); }));
