import { precacheAndRoute } from 'workbox-precaching';

precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', event => {
  const payload = event.data ? event.data.json() : {};
  const title = payload.title || 'Oneness Yoga';
  const options = {
    body: payload.body || 'You have a new notification.',
    icon: payload.icon || (self.location.origin + '/logo192.png'),
    badge: payload.badge || (self.location.origin + '/logo192.png'),
    vibrate: [100, 50, 100],
    data: {
      url: payload.url || '/',
      ...payload.data
    },
    tag: payload.tag,
    renotify: !!payload.tag
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification?.data?.url || '/';
  const fullUrl = new URL(url, self.location.origin).href;

  event.waitUntil((async () => {
    const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windowClients) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client) {
          await client.navigate(fullUrl);
        }
        return;
      }
    }
    if (self.clients.openWindow) {
      await self.clients.openWindow(fullUrl);
    }
  })());
});
