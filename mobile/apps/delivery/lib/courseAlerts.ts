import CourseAlerts from '../modules/course-alerts/src/CourseAlertsModule';
import type { Offer } from './deliveries';
import type { Prefs } from './session';
import { fetchWithSession } from './sessionFetch';
import { buildCourseAlert, incomingOfferId } from './courseAlertPayload';

export { default as CourseAlerts } from '../modules/course-alerts/src/CourseAlertsModule';
const pending = new Set<string>();

export function configureCourseAlerts(active: boolean, prefs: Prefs) {
  return CourseAlerts?.configure(active, prefs.coursePopupEnabled, prefs.ringInSilentMode, prefs.soundEnabled)
    .catch(error => console.warn('Réglages des alertes indisponibles', error));
}

export async function presentIncomingCourse(payload: unknown) {
  if (!CourseAlerts) return;
  const id = incomingOfferId(payload);
  if (!id || pending.has(id)) return;
  pending.add(id);
  try {
    const response = await fetchWithSession('/api/drivers/offers');
    if (!response?.ok) return;
    const body = await response.json();
    if (!Array.isArray(body.data)) return;
    const alert = buildCourseAlert(body.data as Offer[], id);
    if (alert) await CourseAlerts.presentOffer(JSON.stringify(alert));
  } catch (error) {
    console.warn('Fenêtre de course indisponible', error);
  } finally {
    pending.delete(id);
  }
}
