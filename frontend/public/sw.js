/*
 * Service worker des notifications livreur.
 *
 * Il affiche les notifications push envoyées par le serveur, même quand
 * l'onglet est en arrière-plan ou fermé, et ramène sur la bonne page au clic.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let donnees = {};
  try {
    donnees = event.data ? event.data.json() : {};
  } catch {
    donnees = { title: 'Notification', body: event.data ? event.data.text() : '' };
  }

  const titre = donnees.title || 'Nouvelle notification';
  event.waitUntil(
    self.registration.showNotification(titre, {
      body: donnees.body || '',
      tag: donnees.tag,
      // Une nouvelle course doit se voir, même si une notification de même
      // tag est déjà affichée.
      renotify: Boolean(donnees.tag),
      requireInteraction: donnees.tag === 'course-proposee',
      data: { url: donnees.url || '/driver' },
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/driver';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((fenetres) => {
      for (const fenetre of fenetres) {
        if ('focus' in fenetre) {
          fenetre.navigate(url).catch(() => {});
          return fenetre.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
