const { test } = require('node:test');
const assert = require('node:assert/strict');
const { incomingOfferId, buildCourseAlert } = require('../lib/courseAlertPayload.ts');
const now = Date.parse('2026-10-04T18:00:00Z');
const offer = (id, patch = {}) => ({ id, deliveryId: 'delivery', payout: 5, expiresAt: new Date(now + 30000).toISOString(), distanceKm: 2, ...patch });

test('FCM Android JSON and normal notification data both identify a proposal', () => {
  assert.equal(incomingOfferId({ data: { dataString: JSON.stringify({ tag: 'course-proposee', offerId: 'offer-1' }) } }), 'offer-1');
  assert.equal(incomingOfferId({ data: { body: JSON.stringify({ tag: 'course-proposee', offerId: 'offer-2' }) } }), 'offer-2');
  assert.equal(incomingOfferId({ notification: { request: { content: { data: { tag: 'course-proposee', offerId: 'offer-3' } } } } }), 'offer-3');
});
test('malformed, unrelated and action payloads never create a new proposal window', () => {
  for (const value of [null, [], {}, { data: { dataString: '{' } }, { data: { tag: 'support', offerId: 'x' } },
    { data: { tag: 'course-proposee', offerId: '../accept' } }, { actionIdentifier: 'accepter', data: { tag: 'course-proposee', offerId: 'x' } }]) {
    assert.equal(incomingOfferId(value), null);
  }
});
test('offers missing from the authenticated response, expired offers and invalid prices are rejected', () => {
  assert.equal(buildCourseAlert([offer('mine')], 'someone-else', now), null);
  assert.equal(buildCourseAlert([offer('old', { expiresAt: new Date(now).toISOString() })], 'old', now), null);
  assert.equal(buildCourseAlert([offer('bad', { expiresAt: 'invalid' })], 'bad', now), null);
  assert.equal(buildCourseAlert([offer('bad', { payout: NaN })], 'bad', now), null);
});
test('batch totals include only live offers and expire at the earliest live deadline', () => {
  const result = buildCourseAlert([
    offer('a', { batchId: 'batch' }), offer('b', { batchId: 'batch', payout: 3, expiresAt: new Date(now + 10000).toISOString() }),
    offer('old', { batchId: 'batch', payout: 99, expiresAt: new Date(now - 1).toISOString() }), offer('other', { payout: 99 }),
  ], 'a', now);
  assert.equal(result.payout, 8); assert.equal(result.count, 2); assert.equal(result.expiresAtMs, now + 10000);
  assert.equal('deliveryAddress' in result, false);
});

test('the map retains the API points, including zero, and rejects invalid coordinates', () => {
  const result = buildCourseAlert([offer('map', {
    pickupStore: 'Mon commerce', pickupAddress: '1 rue du Marché', pickupCity: 'Ville',
    pickupLat: 0, pickupLng: 0, deliveryLat: 48.1234, deliveryLng: 2.1234,
    deliveryAddress: '2 rue de la Gare', deliveryPostal: '75000', deliveryCity: 'Paris', approcheKm: 1.5,
  })], 'map', now);
  assert.deepEqual(result.pickups, [{ name: 'Mon commerce', address: '1 rue du Marché, Ville', point: { lat: 0, lng: 0 } }]);
  assert.deepEqual(result.dropoffs, [{ address: '2 rue de la Gare, 75000 Paris', point: { lat: 48.1234, lng: 2.1234 } }]);
  assert.equal(result.totalKm, 3.5);
  for (const patch of [{ pickupLat: NaN, pickupLng: 2 }, { pickupLat: 91, pickupLng: 2 },
    { pickupLat: 1, pickupLng: 181 }, { pickupLat: '1', pickupLng: 2 }, { pickupLat: null, pickupLng: 0 }]) {
    assert.equal(buildCourseAlert([offer('bad-map', patch)], 'bad-map', now).pickups[0].point, null);
  }
});

test('a batch shares a pickup, keeps all destinations and includes each paid journey once', () => {
  const pickup = { pickupStore: 'Commerce', pickupAddress: '10 rue du Marché', pickupCity: 'Ville', pickupLat: 45, pickupLng: 4 };
  const result = buildCourseAlert([
    offer('a', { ...pickup, batchId: 'batch', approcheKm: 1, deliveryAddress: 'Client A', deliveryLat: 45.01, deliveryLng: 4.01 }),
    offer('b', { ...pickup, batchId: 'batch', approcheKm: 1, deliveryAddress: 'Client B', deliveryLat: 45.02, deliveryLng: 4.02 }),
  ], 'a', now);
  assert.equal(result.pickups.length, 1);
  assert.equal(result.dropoffs.length, 2);
  assert.equal(result.totalKm, 5);
  assert.equal(result.createdAtMs, now);
  assert.equal(buildCourseAlert([offer('unknown', { distanceKm: null })], 'unknown', now).totalKm, null);
});
