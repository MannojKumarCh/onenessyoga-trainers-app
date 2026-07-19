/* eslint-disable import/no-unused-modules */
import { useState } from 'react';
import { usePush } from '../hooks/usePush';
import { useAuth } from '../context/AuthContext';

const DISMISS_KEY = 'push-prompt-dismissed';

export default function PushNotificationsPrompt() {
  const { user } = useAuth();
  const { supported, permission, isEnabling, error, enablePushNotifications } = usePush(user);
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISS_KEY) === '1');

  if (!user || !supported || permission === 'granted' || dismissed) return null;

  const blocked = permission === 'denied';

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        left: 16,
        right: 16,
        top: 'calc(env(safe-area-inset-top, 0px) + 64px)',
        maxWidth: 420,
        margin: '0 auto',
        padding: '12px 14px',
        borderRadius: 12,
        border: '1px solid var(--border)',
        background: 'var(--white, #fff)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.16)',
        color: 'var(--text-primary)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 60
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Enable push notifications</div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          style={{
            border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 14, lineHeight: 1, color: 'var(--text-secondary)', padding: 2
          }}
        >
          ✕
        </button>
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
        {blocked
          ? "You've blocked notifications for this site in your browser, so it can't ask again automatically. To enable them, open your browser's site settings for this page and allow notifications, then refresh."
          : 'Turn on push notifications so you receive session, leave, and sequence updates instantly.'}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {blocked ? (
          <button type="button" onClick={dismiss} style={{
            border: '1px solid var(--border)', borderRadius: 999, padding: '8px 12px',
            background: 'none', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, cursor: 'pointer'
          }}>
            Dismiss
          </button>
        ) : (
          <button
            type="button"
            onClick={() => enablePushNotifications().catch(() => {})}
            disabled={isEnabling}
            style={{
              border: 'none',
              borderRadius: 999,
              padding: '8px 12px',
              background: 'var(--primary)',
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
              cursor: isEnabling ? 'not-allowed' : 'pointer'
            }}
          >
            {isEnabling ? 'Enabling…' : 'Enable notifications'}
          </button>
        )}
        {error ? (
          <span style={{ fontSize: 12, color: 'var(--danger, #c0392b)' }}>
            {error.message || 'Could not enable notifications.'}
          </span>
        ) : null}
      </div>
    </div>
  );
}


