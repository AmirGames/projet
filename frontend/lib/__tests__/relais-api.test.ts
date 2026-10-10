import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { NextRequest } from 'next/server';
import { relayer } from '../relais-api';

describe('relais des demandes de renouvellement', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('transmet la preuve de reprise à l’API', async () => {
    const fetchApi = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ accessToken: 'acces-neuf' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const demande = new NextRequest('http://localhost:3000/api/auth/refresh', {
      method: 'POST',
      headers: {
        host: 'localhost:3000',
        'content-type': 'application/json',
        'x-refresh-request': 'preuve-de-reprise-aleatoire-1234',
      },
      body: JSON.stringify({ requestId: 'preuve-de-reprise-aleatoire-1234' }),
    });

    await relayer(demande, 'auth', ['refresh']);

    const options = fetchApi.mock.calls[0][1];
    expect(new Headers(options?.headers).get('x-refresh-request')).toBe('preuve-de-reprise-aleatoire-1234');
  });
});
