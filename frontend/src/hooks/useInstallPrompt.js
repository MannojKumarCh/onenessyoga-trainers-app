import { useState, useEffect, useCallback } from 'react';

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;
}

// Wraps the browser's install-to-home-screen flow (Chrome/Edge/Android fire
// `beforeinstallprompt`; we capture it once and replay it on demand instead
// of letting the browser show its own mini-infobar). iOS Safari never fires
// that event - there is no programmatic install API there, only the
// Share -> "Add to Home Screen" menu, so we surface `needsManualIosSteps`
// instead so the UI can show instructions rather than a broken button.
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(() => isStandalone());

  useEffect(() => {
    if (installed) return;

    function onBeforeInstallPrompt(e) {
      e.preventDefault();
      setDeferredPrompt(e);
    }
    function onAppInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, [installed]);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  return {
    installed,
    canInstall: !installed && !!deferredPrompt,
    needsManualIosSteps: !installed && !deferredPrompt && isIos(),
    promptInstall
  };
}
