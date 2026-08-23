import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { BellIcon } from '@heroicons/react/24/outline';
import client from '../api/client';
import { getApiErrorMessage } from '../utils/apiError';
import usePolling from '../hooks/usePolling';

export default function NotificationBell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refreshCount = useCallback(() => {
    client.get('/notifications/unread-count')
      .then(r => setUnreadCount(r.data.count))
      .catch(() => {});
  }, []);

  // Refresh on navigation
  useEffect(() => { refreshCount(); }, [location.pathname, refreshCount]);

  // Auto-refresh every 30 seconds + on visibility change
  usePolling(refreshCount, 30000);

  function toggleOpen() {
    if (!open) {
      setError('');
      setLoading(true);
      setItems([]); // Clear stale items immediately
      client.get('/notifications/unread')
        .then(r => setItems(r.data))
        .catch(err => setError(getApiErrorMessage(err, 'Could not load notifications')))
        .finally(() => setLoading(false));
    }
    setOpen(o => !o);
  }

  async function handleItemClick(item) {
    setItems(list => list.filter(n => n.id !== item.id));
    setUnreadCount(c => Math.max(0, c - 1));
    setOpen(false);
    try {
      await client.patch(`/notifications/${item.id}/read`);
    } catch {
      // If marking as read fails, refresh the count to resync
      refreshCount();
    }
    if (item.url) navigate(item.url);
  }

  function viewAll() {
    setOpen(false);
    navigate('/notifications');
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={toggleOpen}
        aria-label="Notifications"
        className="header-icon-btn"
        style={{ position: 'relative' }}
      >
        <BellIcon style={{ width: 21, height: 21 }} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 0, right: 0, minWidth: 16, height: 16, padding: '0 4px',
            borderRadius: 999, background: 'var(--danger)', color: '#fff', fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'pulse 2s ease-in-out infinite', boxShadow: '0 1px 4px rgba(255,59,48,0.4)'
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 90 }}
          />
          <div style={{
            position: 'absolute', top: '100%', right: -8, marginTop: 8, width: 340, maxWidth: '90vw',
            maxHeight: 420, overflowY: 'auto', background: 'var(--bg-elevated)', borderRadius: 'var(--radius)',
            border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-lg)', zIndex: 91,
            padding: 14, animation: 'modalEnter 0.2s ease-out'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--border-light)' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Notifications</span>
              <button
                onClick={viewAll}
                style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
              >
                View All
              </button>
            </div>

            {error && <p className="error-text" style={{ fontSize: 13 }}>{error}</p>}

            {loading && !error && (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', padding: '20px 0' }}>
                Loading…
              </p>
            )}

            {!loading && !error && items.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', padding: '20px 0' }}>
                No New Notifications
              </p>
            )}

            {items.map(item => (
              <button
                key={item.id}
                onClick={() => handleItemClick(item)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', font: 'inherit',
                  padding: '12px 10px', borderRadius: 'var(--radius-sm)', border: 'none',
                  background: 'none', cursor: 'pointer', transition: 'background 0.15s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{item.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, whiteSpace: 'pre-line', lineHeight: 1.4 }}>{item.body}</div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
