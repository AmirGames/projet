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
