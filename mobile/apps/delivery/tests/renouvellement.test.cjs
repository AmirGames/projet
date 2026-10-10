const { test } = require('node:test');
const assert = require('node:assert/strict');
const { creerRenouvellement } = require('../lib/renouvellement.ts');

/** Une « base » de session et un serveur qui fait tourner le jeton de renouvellement. */
function monde({ serveur } = {}) {
  const etat = { session: { accessToken: 'A0', refreshToken: 'R0' }, appels: 0, enregistrements: [] };
  const operations = new Map();
  const rotation = async (refreshToken, requestId) => {
    etat.appels += 1;
    await new Promise((r) => setTimeout(r, 5));
    if (serveur) return serveur(refreshToken, etat, requestId);
    // Le serveur : un jeton de renouvellement ne sert qu'une fois.
    if (refreshToken !== etat.session.refreshToken) {
      return { ok: false, status: 401, json: async () => ({ code: 'SESSION_INVALIDE' }) };
    }
    if (!operations.has(requestId)) operations.set(requestId, { accessToken: `A${operations.size + 1}`, refreshToken: `R${operations.size + 1}` });
    const result = operations.get(requestId);
    return { ok: true, status: 200, json: async () => ({ ...result }) };
  };
  const renouvellement = creerRenouvellement({
    charger: async () => ({ ...etat.session }),
    enregistrer: async (s) => { etat.session = { ...s }; etat.enregistrements.push(s); },
    appeler: rotation,
    attendre: async () => undefined,
  });
  return { etat, renouvellement };
}

test('dix appels refusés en même temps : un seul renouvellement, tous reçoivent le même jeton', async () => {
  const { etat, renouvellement } = monde();
  const resultats = await Promise.all(Array.from({ length: 10 }, () => renouvellement.renouveler('A0')));
  assert.equal(etat.appels, 1);
  assert.ok(resultats.every((r) => r.token === 'A1'));
  assert.equal(etat.session.refreshToken, 'R1');
});

test('réponse perdue : rejoue la même clé et récupère le même successeur', async () => {
  const keys = [];
  const state = { accessToken: 'A0', refreshToken: 'R0' };
  let calls = 0;
  const renewal = creerRenouvellement({
    charger: async () => ({ ...state }),
    enregistrer: async (s) => Object.assign(state, s),
    creerRequestId: () => 'request-reprise-0001',
    appeler: async (_token, key) => {
      keys.push(key);
      calls++;
      if (calls === 1) throw new Error('réponse réseau perdue');
      return { ok: true, status: 200, json: async () => ({ accessToken: 'A1', refreshToken: 'R1' }) };
    },
  });
  assert.deepEqual(await renewal.renouveler('A0'), { transient: true });
  // En situation réelle l'API a committé ; le second appel reprend la même clé.
  assert.deepEqual(await renewal.renouveler('A0'), { token: 'A1' });
  assert.deepEqual(keys, ['request-reprise-0001', 'request-reprise-0001']);
});

test('le jeton neuf est enregistré avant d’être rendu', async () => {
  const { etat, renouvellement } = monde();
  const r = await renouvellement.renouveler('A0');
  assert.equal(etat.enregistrements.length, 1);
  assert.equal(etat.enregistrements[0].accessToken, r.token);
});

test('un appel arrivé après un renouvellement déjà fait reprend sa session sans rappeler le serveur', async () => {
  const { etat, renouvellement } = monde();
  await renouvellement.renouveler('A0');
  const tard = await renouvellement.renouveler('A0'); // refusé avec l'ancien jeton d'accès
  assert.equal(etat.appels, 1);
  assert.equal(tard.token, 'A1');
});

test('jeton de renouvellement refusé : session expirée', async () => {
  const { renouvellement } = monde({ serveur: async () => ({ ok: false, status: 401, json: async () => ({}) }) });
  assert.deepEqual(await renouvellement.renouveler('A0'), { expired: true });
});

test('réseau coupé : transitoire, jamais une déconnexion', async () => {
  const { renouvellement } = monde({ serveur: async () => { throw new Error('réseau'); } });
  assert.deepEqual(await renouvellement.renouveler('A0'), { transient: true });
});

test('renouvellement concurrent côté serveur (autre processus) : attend sa session enregistrée', async () => {
  const { etat, renouvellement } = monde({
    serveur: async (_r, e) => {
      // L'autre processus (l'arrière-plan) termine pendant l'attente.
      e.session = { accessToken: 'A-autre', refreshToken: 'R-autre' };
      return { ok: false, status: 409, json: async () => ({ code: 'REFRESH_CONCURRENT' }) };
    },
  });
  const r = await renouvellement.renouveler('A0');
  assert.equal(r.token, 'A-autre');
  assert.equal(etat.enregistrements.length, 0);
});

test('sans session enregistrée : expirée', async () => {
  const r = creerRenouvellement({ charger: async () => null, enregistrer: async () => undefined, appeler: async () => ({}) });
  assert.deepEqual(await r.renouveler('A0'), { expired: true });
});

test('après un renouvellement terminé, le suivant repart de zéro', async () => {
  const { etat, renouvellement } = monde();
  await renouvellement.renouveler('A0');
  await renouvellement.renouveler('A1');
  assert.equal(etat.appels, 2);
  assert.equal(etat.session.refreshToken, 'R2');
});
