/* eslint-disable import/no-unused-modules */
import { usePush } from '../hooks/usePush';
import { useAuth } from '../context/AuthContext';

export default function PushNotificationsPrompt() {
  const { user } = useAuth();
  const { supported, permission, isEnabling, error, enablePushNotifications } = usePush(user);

  if (!user || !supported || permission === 'granted') return null;

  const blocked = permission === 'denied';

  return (
    <div style={{
      margin: '12px 16px 0',
      padding: '12px 14px',
      borderRadius: 12,
      border: '1px solid var(--border)',
      background: 'rgba(232,93,74,0.08)',
      color: 'var(--text-primary)',
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>Enable push notifications</div>
      <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
        {blocked
          ? 'Notifications are blocked for this site. Please allow notifications in Chrome settings, then refresh this page.'
          : 'Turn on push notifications so you receive session, leave, and sequence updates instantly.'}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => enablePushNotifications().catch(() => {})}
          disabled={isEnabling || blocked}
          style={{
            border: 'none',
            borderRadius: 999,
            padding: '8px 12px',
            background: blocked ? 'var(--border)' : 'var(--primary)',
            color: blocked ? 'var(--text-secondary)' : '#fff',
            fontSize: 12,
            fontWeight: 700,
            cursor: isEnabling || blocked ? 'not-allowed' : 'pointer'
          }}
        >
          {isEnabling ? 'Enabling…' : blocked ? 'Blocked in browser' : 'Enable notifications'}
        </button>
        {error ? (
          <span style={{ fontSize: 12, color: 'var(--danger, #c0392b)' }}>
            {error.message || 'Could not enable notifications.'}
          </span>
        ) : null}
      </div>
    </div>
  );
}


