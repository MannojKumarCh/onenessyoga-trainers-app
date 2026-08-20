import { useState, useEffect, useCallback } from 'react';

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;
}

// `beforeinstallprompt` fires at most once per page load, whenever Chrome
// finishes deciding the app is installable - which can happen before any
// particular component (e.g. the login page) has even mounted, or while a
// totally different screen is showing. Capturing it into per-component state
// loses it the moment that component unmounts (this is a single-page app -
// logging in unmounts the login page and mounts the dashboard fresh, with no
// new page load to re-fire the event). So the capture lives at module scope,
// shared by every component that calls the hook, however many times it's
// called and on whichever screen happens to be mounted when it fires.
let capturedEvent = null;
let installedGlobally = typeof window !== 'undefined' && isStandalone();
const listeners = new Set();

function notify() {
  listeners.forEach(fn => fn());
}

if (typeof window !== 'undefined' && !installedGlobally) {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    capturedEvent = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installedGlobally = true;
    capturedEvent = null;
    notify();
  });
}

export function useInstallPrompt() {
  const [, forceRender] = useState(0);

  useEffect(() => {
    const onChange = () => forceRender(n => n + 1);
    listeners.add(onChange);
    return () => listeners.delete(onChange);
  }, []);

  const promptInstall = useCallback(async () => {
    if (!capturedEvent) return;
    const event = capturedEvent;
    event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === 'accepted') installedGlobally = true;
    capturedEvent = null;
    notify();
  }, []);

  return {
    installed: installedGlobally,
    canInstall: !installedGlobally && !!capturedEvent,
    needsManualIosSteps: !installedGlobally && !capturedEvent && isIos(),
    promptInstall
  };
}
