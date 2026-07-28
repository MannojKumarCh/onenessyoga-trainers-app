/* eslint-disable import/no-unused-modules */
import { useState } from 'react';
import { usePush } from '../hooks/usePush';
import { useAuth } from '../context/AuthContext';
import { BellAlertIcon, XMarkIcon } from '@heroicons/react/24/outline';

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
        top: 'calc(env(safe-area-inset-top, 0px) + 60px)',
        maxWidth: 420,
        margin: '0 auto',
        padding: '14px 16px',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border-light)',
        background: 'var(--bg-elevated)',
        boxShadow: 'var(--shadow-lg)',
        color: 'var(--text)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        zIndex: 60,
        animation: 'slideUp 0.3s ease-out'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BellAlertIcon style={{ width: 18, height: 18, color: 'var(--primary)', flexShrink: 0 }} />
          <div style={{ fontSize: 14, fontWeight: 700 }}>Enable Push Notifications</div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          style={{
            border: 'none', background: 'none', cursor: 'pointer',
            padding: 2, color: 'var(--text-secondary)', display: 'flex'
          }}
        >
          <XMarkIcon style={{ width: 18, height: 18 }} />
        </button>
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
        {blocked
          ? "You've blocked notifications for this site. To enable them, open your browser's site settings and allow notifications, then refresh."
          : 'Get instant updates for sessions, leaves, and sequences. If using Brave browser, ensure notifications are allowed in Brave Shields.'}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {blocked ? (
          <button type="button" onClick={dismiss} className="btn btn-ghost" style={{
            borderRadius: 999, padding: '8px 16px', fontSize: 13
          }}>
            Dismiss
          </button>
        ) : (
          <button
            type="button"
            onClick={() => enablePushNotifications().catch(() => {})}
            disabled={isEnabling}
            className="btn btn-primary"
            style={{
              borderRadius: 999, padding: '8px 16px', fontSize: 13, minHeight: 36
            }}
          >
            {isEnabling ? 'Enabling…' : 'Enable Notifications'}
          </button>
        )}
        {error ? (
          <span style={{ fontSize: 12, color: 'var(--danger)' }}>
            {error.message || 'Could not enable notifications.'}
          </span>
        ) : null}
      </div>
    </div>
  );
}
