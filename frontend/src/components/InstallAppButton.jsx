import { useState } from 'react';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import Modal from './Modal';

// variant="icon" -> small round header button (matches NotificationBell/Logout)
// variant="text" -> ghost text link, e.g. under the login card
export default function InstallAppButton({ variant = 'icon' }) {
  const { canInstall, needsManualIosSteps, promptInstall } = useInstallPrompt();
  const [showIosSteps, setShowIosSteps] = useState(false);

  if (!canInstall && !needsManualIosSteps) return null;

  function handleClick() {
    if (canInstall) {
      promptInstall();
    } else {
      setShowIosSteps(true);
    }
  }

  return (
    <>
      {variant === 'icon' ? (
        <button onClick={handleClick} className="header-icon-btn" aria-label="Install App" title="Install App">
          <ArrowDownTrayIcon style={{ width: 20, height: 20 }} />
        </button>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          className="btn btn-ghost"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13, marginTop: 16, width: '100%' }}
        >
          <ArrowDownTrayIcon style={{ width: 16, height: 16 }} /> Install App
        </button>
      )}

      {showIosSteps && (
        <Modal title="Install Oneness Yoga" onClose={() => setShowIosSteps(false)}>
          <ol style={{ paddingLeft: 20, fontSize: 14, lineHeight: 1.7, color: 'var(--text)' }}>
            <li>Tap the <strong>Share</strong> icon in Safari's toolbar.</li>
            <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
            <li>Tap <strong>Add</strong> in the top-right corner.</li>
          </ol>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 12 }}>
            The app icon will then appear on your home screen, opening full-screen like any other app.
          </p>
        </Modal>
      )}
    </>
  );
}
