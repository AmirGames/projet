import { afterEach, describe, expect, it, jest } from '@jest/globals';
jest.mock('next/server', () => ({
  NextResponse: class {
    body: unknown;
    status: number;
    headers = new Headers();
    constructor(body: unknown, init: { status: number }) {
      this.body = body;
      this.status = init.status;
    }
    static json(body: unknown, init: { status: number }) {
      return { body, status: init.status };
    }
  },
}));

import { relayer } from '../relais-api';

describe('relais des demandes de renouvellement', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('transmet la preuve de reprise à l’API', async () => {
    const fetchApi = jest.spyOn(global, 'fetch').mockResolvedValue(
      { body: null, status: 200, headers: { get: (name: string) => name === 'content-type' ? 'application/json' : null, getSetCookie: () => [] } } as unknown as Response,
    );
    const demande = {
      nextUrl: new URL('http://localhost:3000/api/auth/refresh'),
      method: 'POST',
      headers: {
        get: (name: string) => ({
          host: 'localhost:3000',
          'content-type': 'application/json',
          'x-refresh-request': 'preuve-de-reprise-aleatoire-1234',
        })[name.toLowerCase()] ?? null,
      },
      arrayBuffer: async () => new TextEncoder().encode(JSON.stringify({ requestId: 'preuve-de-reprise-aleatoire-1234' })).buffer,
    } as any;

    await relayer(demande, 'auth', ['refresh']);

    const options = fetchApi.mock.calls[0][1];
    expect(options?.headers.get('x-refresh-request')).toBe('preuve-de-reprise-aleatoire-1234');
  });
});
