import { afterEach, describe, expect, it, jest } from '@jest/globals';

class mockEntetesTest {
  private readonly valeurs = new Map<string, string>();
  constructor(initial?: HeadersInit) {
    if (initial && Symbol.iterator in Object(initial)) {
      for (const [nom, valeur] of initial as [string, string][]) this.set(nom, valeur);
    } else if (initial && typeof initial === 'object') {
      for (const [nom, valeur] of Object.entries(initial)) this.set(nom, valeur);
    }
  }
  get(nom: string): string | null { return this.valeurs.get(nom.toLowerCase()) ?? null; }
  set(nom: string, valeur: string): void { this.valeurs.set(nom.toLowerCase(), valeur); }
  append(nom: string, valeur: string): void { this.set(nom, this.get(nom) ? this.get(nom) + ', ' + valeur : valeur); }
}

jest.doMock('next/server', () => ({
  NextResponse: class {
    body: unknown;
    status: number;
    headers = new mockEntetesTest();
    constructor(body: unknown, init: { status: number }) { this.body = body; this.status = init.status; }
    static json(body: unknown, init: { status: number }) { return { body, status: init.status }; }
  },
}));
const { relayer } = require('../relais-api') as typeof import('../relais-api');

describe('relais des demandes de renouvellement', () => {
  const HeadersInitial = (globalThis as any).Headers;
  afterEach(() => {
    jest.restoreAllMocks();
    (globalThis as any).Headers = HeadersInitial;
  });

  it('transmet la preuve de reprise à l’API', async () => {
    (globalThis as any).Headers = mockEntetesTest;
    const fetchApi = jest.spyOn(global, 'fetch').mockResolvedValue(
      { body: null, status: 200, headers: { get: (name: string) => name === 'content-type' ? 'application/json' : null, getSetCookie: () => [] } } as unknown as Response,
    );
    const demande = {
      nextUrl: new URL('http://localhost:3000/api/auth/refresh'),
      method: 'POST',
      headers: { get: (name: string) => ({ host: 'localhost:3000', 'content-type': 'application/json', 'x-refresh-request': 'preuve-de-reprise-aleatoire-1234' })[name.toLowerCase()] ?? null },
      arrayBuffer: async () => new ArrayBuffer(0),
    } as any;

    await relayer(demande, 'auth', ['refresh']);

    const options = fetchApi.mock.calls[0][1];
    const entetes = new mockEntetesTest(options?.headers);
    expect(entetes.get('x-refresh-request')).toBe('preuve-de-reprise-aleatoire-1234');
  });
});
