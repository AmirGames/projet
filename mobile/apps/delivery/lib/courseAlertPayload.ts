import type { Offer } from './deliveries';

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function jsonRecord(value: unknown) {
  if (typeof value !== 'string') return record(value);
  try { return record(JSON.parse(value)); } catch { return null; }
}

/** Expo Android serializes FCM's body in data.dataString; actions are handled separately. */
export function incomingOfferId(payload: unknown): string | null {
  const root = record(payload);
  if (!root || 'actionIdentifier' in root) return null;
  const data = record(root.data);
  const notification = record(root.notification);
  const request = record(notification?.request);
  const content = record(request?.content);
  const candidates = [jsonRecord(data?.dataString), jsonRecord(data?.body), record(content?.data), data];
  for (const candidate of candidates) {
    if (candidate?.tag === 'course-proposee' && typeof candidate.offerId === 'string' && /^[\w-]{1,128}$/.test(candidate.offerId)) return candidate.offerId;
  }
  return null;
}

/** Only authenticated API results can become an alert; the push supplies no price or expiry. */
export function buildCourseAlert(offers: Offer[], id: string, now = Date.now()) {
  const valid = offers.filter(o => o && typeof o.id === 'string' && Number.isFinite(Date.parse(o.expiresAt)) &&
    Date.parse(o.expiresAt) > now && typeof o.payout === 'number' && Number.isFinite(o.payout) && o.payout >= 0);
  const offer = valid.find(o => o.id === id);
  if (!offer) return null;
  const group = offer.batchId ? valid.filter(o => o.batchId === offer.batchId) : [offer];
  return {
    id: offer.id,
    expiresAtMs: Math.min(...group.map(o => Date.parse(o.expiresAt))),
    payout: group.reduce((sum, o) => sum + o.payout, 0),
    count: group.length,
    pickupStore: offer.pickupStore || 'Commerce',
    pickupCity: offer.pickupCity || '',
    deliveryCity: offer.deliveryCity || '',
    distanceKm: offer.distanceKm,
  };
}
