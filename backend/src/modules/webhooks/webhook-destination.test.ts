import { lookup } from 'node:dns/promises';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { createServer, Server } from 'node:http';
import { adressePublique, destinationWebhook, posterWebhook } from './webhook-destination';

jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }));
jest.mock('../../config/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
const envAvant = process.env.NODE_ENV;
beforeEach(() => {
  process.env.NODE_ENV = 'production';
  (lookup as unknown as jest.Mock).mockReset().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
});
afterEach(() => { process.env.NODE_ENV = envAvant; jest.restoreAllMocks(); });

test.each(['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.2', '169.254.169.254', '100.64.0.1',
  '0.0.0.0', '224.0.0.1', '198.18.0.1', '192.0.2.1', '::1', '::', 'fe80::1', 'fc00::1',
  '::ffff:127.0.0.1', '2002:7f00:1::', '2001:db8::1', '2001::1'])('adresse non publique refusée : %s', (ip) => {
  expect(adressePublique(ip)).toBe(false);
});
test.each(['93.184.216.34', '8.8.8.8', '2606:4700:4700::1111'])('adresse publique : %s', (ip) => {
  expect(adressePublique(ip)).toBe(true);
});
test.each(['http://example.com/', 'file:///etc/passwd', 'https://user:pass@example.com/',
  'https://example.com/#fragment', 'https://127.1/', 'https://2130706433/',
  'https://169.254.169.254/', 'https://[::ffff:127.0.0.1]/'])('destination dangereuse refusée : %s', async (url) => {
  await expect(destinationWebhook(url)).rejects.toMatchObject({ code: 'WEBHOOK_DESTINATION_FORBIDDEN' });
});
test('hôte HTTPS dont une adresse DNS est privée : refus', async () => {
  (lookup as unknown as jest.Mock).mockResolvedValue([{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.1', family: 4 }]);
  await expect(destinationWebhook('https://example.com/')).rejects.toMatchObject({ statusCode: 400 });
});
test('hôte HTTPS validé puis DNS privé : aucun envoi', async () => {
  await destinationWebhook('https://example.com/');
  (lookup as unknown as jest.Mock).mockResolvedValue([{ address: '10.0.0.1', family: 4 }]);
  const requete = jest.spyOn(https, 'request');
  await expect(posterWebhook('https://example.com/', {}, '{}')).rejects.toMatchObject({ statusCode: 400 });
  expect(requete).not.toHaveBeenCalled();
});
test('adresse épinglée pendant l’envoi, HTTPS conservé, redirection non suivie', async () => {
  let options: any;
  const requete = new EventEmitter() as any;
  requete.destroy = jest.fn();
  jest.spyOn(https, 'request').mockImplementation(((url: URL, opts: any, callback: any) => {
    expect(url.hostname).toBe('example.com'); options = opts;
    requete.end = () => { callback({ statusCode: 302, destroy: jest.fn() }); requete.emit('close'); };
    return requete;
  }) as any);
  expect(await posterWebhook('https://example.com/path', { 'X-Webhook-Signature': 'signature' }, '{}'))
    .toEqual({ status: 302, ok: false });
  const callback = jest.fn(); options.lookup('example.com', {}, callback);
  expect(callback).toHaveBeenCalledWith(null, '93.184.216.34', 4);
  expect(lookup).toHaveBeenCalledTimes(1);
  expect(https.request).toHaveBeenCalledTimes(1);
  expect(options.agent).toBe(false);
});
test('les vérifications hors production peuvent poster au récepteur loopback', async () => {
  process.env.NODE_ENV = 'test';
  let serveur: Server | undefined;
  try {
    let corps = '';
    serveur = createServer((req, res) => {
      req.on('data', (chunk) => { corps += chunk; });
      req.on('end', () => { res.writeHead(204); res.end(); });
    });
    await new Promise<void>((resolve) => serveur!.listen(0, '127.0.0.1', resolve));
    const port = (serveur.address() as { port: number }).port;
    expect(await posterWebhook(`http://127.0.0.1:${port}/`, { 'Content-Type': 'application/json' }, '{"test":true}'))
      .toEqual({ status: 204, ok: true });
    expect(corps).toBe('{"test":true}');
    process.env.NODE_ENV = 'production';
    await expect(destinationWebhook(`http://127.0.0.1:${port}/`)).rejects.toMatchObject({ statusCode: 400 });
  } finally { if (serveur) await new Promise<void>((resolve) => serveur!.close(() => resolve())); }
});
