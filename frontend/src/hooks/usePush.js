import { useCallback, useEffect, useMemo, useState } from 'react';
import client from '../api/client';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
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

    const { data } = await client.get('/notifications/vapid-public-key');
    if (!data?.key) {
      throw new Error('Push notifications are not configured on this server.');
    }

    // Register the root-scoped service worker (served from /sw.js).
    // This avoids the Vite dev /src/ scope limitation and is required for push
    // to behave consistently across local dev and production.
    let reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    }

    const currentReg = reg || await navigator.serviceWorker.ready;
    if (!currentReg) {
      throw new Error('Could not register a service worker for push notifications.');
    }

    let sub = await currentReg.pushManager.getSubscription();
    if (!sub) {
      sub = await currentReg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.key)
      });
    }

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
