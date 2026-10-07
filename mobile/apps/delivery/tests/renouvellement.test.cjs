const { test } = require('node:test');
const assert = require('node:assert/strict');
const { creerRenouvellement } = require('../lib/renouvellement.ts');

/** Une « base » de session et un serveur qui fait tourner le jeton de renouvellement. */
function monde({ serveur } = {}) {
  const etat = { session: { accessToken: 'A0', refreshToken: 'R0' }, appels: 0, enregistrements: [] };
  const rotation = async (refreshToken) => {
    etat.appels += 1;
    await new Promise((r) => setTimeout(r, 5));
    if (serveur) return serveur(refreshToken, etat);
    // Le serveur : un jeton de renouvellement ne sert qu'une fois.
    if (refreshToken !== etat.session.refreshToken) {
      return { ok: false, status: 401, json: async () => ({ code: 'SESSION_INVALIDE' }) };
    }
    const n = etat.appels;
    return { ok: true, status: 200, json: async () => ({ accessToken: `A${n}`, refreshToken: `R${n}` }) };
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
