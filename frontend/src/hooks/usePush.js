import { useEffect } from 'react';
import client from '../api/client';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

export function usePush(user) {
  useEffect(() => {
    if (!user || !('serviceWorker' in navigator) || !('PushManager' in window)) return;

    async function subscribe() {
      try {
        const { data } = await client.get('/notifications/vapid-public-key');
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(data.key)
          });
        }
        await client.post('/notifications/subscribe', { subscription: sub.toJSON() });
      } catch (err) {
        console.warn('Push subscription failed:', err);
      }
    }

    if (Notification.permission === 'granted') {
      subscribe();
    } else if (Notification.permission === 'default') {
      Notification.requestPermission().then(p => { if (p === 'granted') subscribe(); });
    }
  }, [user]);
}
