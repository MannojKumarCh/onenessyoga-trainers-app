import { precacheAndRoute } from 'workbox-precaching';

precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', event => {
  let payload;
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    // If the payload is not valid JSON, use a safe fallback
    payload = {
      title: 'Oneness Yoga',
      body: event.data ? event.data.text() : 'You have a new notification.'
    };
  }

  const title = payload.title || 'Oneness Yoga';
  const options = {
    body: payload.body || 'You have a new notification.',
    // Use manifest icon; omit icon/badge if no custom one provided
    // (browser will fall back to app icon from manifest automatically)
    icon: payload.icon || undefined,
    badge: payload.badge || undefined,
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
