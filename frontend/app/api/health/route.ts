// Sonde de vie du site (HEALTHCHECK Docker) : répond sans toucher à l'API ni à
// la base, pour qu'un orchestrateur ne redémarre pas le site parce que l'API
// est tombée. `revision` : le commit construit dans l'image (GIT_SHA).
export const dynamic = 'force-dynamic';

export function GET() {
  const sha = (process.env.GIT_SHA || '').trim();
  return Response.json(
    { status: 'ok', revision: /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 12) : 'inconnue' },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
