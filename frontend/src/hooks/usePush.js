import { useCallback, useEffect, useMemo, useState } from 'react';
import client from '../api/client';

function urlBase64ToUint8Array(base64String) {
  if (!base64String || typeof base64String !== 'string') {
    throw new Error('Invalid VAPID public key received from server.');
  }
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

/** Compare two ArrayBuffer/Uint8Array for equality */
function arrayBufferEqual(a, b) {
  if (!a || !b) return false;
  const viewA = new Uint8Array(a);
  const viewB = new Uint8Array(b);
  if (viewA.length !== viewB.length) return false;
  for (let i = 0; i < viewA.length; i++) {
    if (viewA[i] !== viewB[i]) return false;
  }
  return true;
}

export function usePush(user) {
  const supported = useMemo(() => (
    typeof window !== 'undefined'
    && 'Notification' in window
    && 'serviceWorker' in navigator
    && 'PushManager' in window
  ), []);

  const [permission, setPermission] = useState(() => (
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  ));
  const [isEnabling, setIsEnabling] = useState(false);
  const [error, setError] = useState(null);

  const syncPermission = useCallback(() => {
    if (typeof Notification !== 'undefined') {
      setPermission(Notification.permission);
    }
  }, []);

  const subscribe = useCallback(async () => {
    if (!user || !supported || typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      return false;
    }

    // Fetch VAPID public key with a 10-second timeout
    let vapidKey;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const { data } = await client.get('/notifications/vapid-public-key', {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      vapidKey = data?.key;
    } catch (err) {
      if (err.name === 'AbortError' || err.name === 'CanceledError') {
        throw new Error('Timed out fetching push configuration. Please try again.');
      }
      throw err;
    }

    if (!vapidKey) {
      throw new Error('Push notifications are not configured on this server.');
    }

    const applicationServerKey = urlBase64ToUint8Array(vapidKey);

    // Register the root-scoped service worker (served from /sw.js).
    let reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    }

    // Wait for the registration to be active before subscribing
    const currentReg = await navigator.serviceWorker.ready;
    if (!currentReg) {
      throw new Error('Could not register a service worker for push notifications.');
    }

    let sub = await currentReg.pushManager.getSubscription();

    // If an existing subscription exists, verify its VAPID key matches the server's current key.
    // If keys don't match (server regenerated VAPID keys), unsubscribe and re-subscribe.
    if (sub) {
      const existingKey = sub.options?.applicationServerKey;
      if (!arrayBufferEqual(existingKey, applicationServerKey.buffer)) {
        console.warn('[push] VAPID key mismatch — unsubscribing stale subscription and re-subscribing.');
        await sub.unsubscribe();
        sub = null;
      }
    }

    if (!sub) {
      sub = await currentReg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      });
    }

    // Send subscription to backend (upsert — handles user_id transfer on device sharing)
    await client.post('/notifications/subscribe', { subscription: sub.toJSON() });
    syncPermission();
    return true;
  }, [supported, syncPermission, user]);

  const enablePushNotifications = useCallback(async () => {
    if (!supported || !user || typeof Notification === 'undefined') return false;

    setIsEnabling(true);
    setError(null);

    try {
      if (Notification.permission === 'denied') {
        const blockedError = new Error('Notifications are blocked in your browser settings.');
        setError(blockedError);
        return false;
      }

      const result = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();

      setPermission(result);
      if (result !== 'granted') return false;

      return await subscribe();
    } catch (err) {
      setError(err);
      console.warn('Push subscription failed:', err);
      throw err;
    } finally {
      setIsEnabling(false);
    }
  }, [supported, subscribe, user]);

  useEffect(() => {
    if (!supported) return;
    syncPermission();

    if (user && Notification.permission === 'granted') {
      subscribe().catch(err => {
        setError(err);
        console.warn('Push subscription failed:', err);
      });
    }
  }, [supported, subscribe, syncPermission, user]);

  return {
    supported,
    permission,
    isEnabling,
    error,
    enablePushNotifications,
    pushEnabled: permission === 'granted'
  };
}
