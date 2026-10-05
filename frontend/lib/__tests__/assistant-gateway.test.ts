/** @jest-environment node */
import { NextRequest } from 'next/server';
import { relayAssistant } from '../assistant-gateway';

describe('Relais serveur Assistant', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    process.env.ASSISTANT_HOSTS = '{"localhost:3000":"eat"}';
    process.env.ASSISTANT_GATEWAY_SECRET = 'test-gateway-secret-with-at-least-32-characters';
    global.fetch = jest.fn(async () => Response.json({ service: 'EAT' }));
  });
  afterEach(() => { global.fetch = originalFetch; delete process.env.ASSISTANT_HOSTS; delete process.env.ASSISTANT_GATEWAY_SECRET; });
  it('ignore les en-têtes de marque, surface et hôte transféré du navigateur', async () => {
    const request = new NextRequest('http://localhost:3000/api/assistant/config', { headers: { host: 'localhost:3000', 'x-forwarded-host': 'manager.zupone.com', 'x-assistant-surface': 'one-manager', 'x-assistant-signature': 'forged' } });
    const response = await relayAssistant(request, ['config']);
    expect(response.status).toBe(200);
    const options = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(options.headers['x-assistant-surface']).toBe('eat');
    expect(options.headers['x-assistant-signature']).not.toBe('forged');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('refuse hôte absent du déploiement, query et origine étrangère avant tout appel backend', async () => {
    const unknown = new NextRequest('http://evil.example/api/assistant/config', { headers: { host: 'evil.example' } });
    expect((await relayAssistant(unknown, ['config'])).status).toBe(503);
    const query = new NextRequest('http://localhost:3000/api/assistant/config?brand=ONE', { headers: { host: 'localhost:3000' } });
    expect((await relayAssistant(query, ['config'])).status).toBe(400);
    const csrf = new NextRequest('http://localhost:3000/api/assistant/conversations', { method: 'POST', headers: { host: 'localhost:3000', origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' });
    expect((await relayAssistant(csrf, ['conversations'])).status).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it('ne transmet que la session visiteur, sans cookies de renouvellement/SSO', async () => {
    const request = new NextRequest('http://localhost:3000/api/assistant/config', { headers: { host: 'localhost:3000', cookie: `refreshToken=sensitive; zup-assistant-guest=${'a'.repeat(64)}` } });
    await relayAssistant(request, ['config']);
    const options = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(options.headers.cookie).toBe(`zup-assistant-guest=${'a'.repeat(64)}`);
    expect(JSON.stringify(options.headers)).not.toContain('refreshToken');
  });
});
