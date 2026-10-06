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
  const request = record(notification?.request) ?? record(root.request);
  const content = record(request?.content);
  const contentData = record(content?.data);
  const trigger = record(request?.trigger);
  const remote = record(trigger?.remoteMessage);
  const remoteData = record(remote?.data);
  const candidates = [jsonRecord(data?.dataString), jsonRecord(data?.body), contentData,
    jsonRecord(contentData?.dataString), jsonRecord(contentData?.body),
    jsonRecord(remoteData?.dataString), jsonRecord(remoteData?.body), remoteData, data];
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
  const pickups = group.map(o => ({
    name: o.pickupStore || 'Commerce',
    address: [o.pickupAddress, o.pickupCity].filter(Boolean).join(', '),
    point: mapPoint(o.pickupLat, o.pickupLng),
  })).filter((stop, index, stops) => stops.findIndex(s =>
    s.name === stop.name && s.address === stop.address &&
    s.point?.lat === stop.point?.lat && s.point?.lng === stop.point?.lng) === index);
  const dropoffs = group.map(o => ({
    address: [o.deliveryAddress, [o.deliveryPostal, o.deliveryCity].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    // Keep the already obfuscated API point; never geocode the readable address.
    point: mapPoint(o.deliveryLat, o.deliveryLng),
  }));
  const distances = group.map(o => kilometres(o.distanceKm));
  const totalKm = distances.every(km => km !== null)
    ? (kilometres(offer.approcheKm) ?? 0) + distances.reduce<number>((sum, km) => sum + (km ?? 0), 0)
    : null;
  return {
    id: offer.id,
    createdAtMs: now,
    expiresAtMs: Math.min(...group.map(o => Date.parse(o.expiresAt))),
    payout: group.reduce((sum, o) => sum + o.payout, 0),
    count: group.length,
    pickupStore: offer.pickupStore || 'Commerce',
    pickupCity: offer.pickupCity || '',
    deliveryCity: offer.deliveryCity || '',
    distanceKm: offer.distanceKm,
    totalKm,
    pickups,
    dropoffs,
    ajout: !!offer.ajout,
    bientotLibre: !!offer.bientotLibre,
    horsLimite: offer.horsLimite === true,
  };
}

function kilometres(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function mapPoint(lat: unknown, lng: unknown) {
  return typeof lat === 'number' && Number.isFinite(lat) && Math.abs(lat) <= 90 &&
    typeof lng === 'number' && Number.isFinite(lng) && Math.abs(lng) <= 180 ? { lat, lng } : null;
}
