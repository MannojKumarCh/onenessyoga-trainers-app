import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import client from '../api/client';
import { getApiErrorMessage } from '../utils/apiError';

export default function NotificationBell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  const refreshCount = useCallback(() => {
    client.get('/notifications/unread-count')
      .then(r => setUnreadCount(r.data.count))
      .catch(() => {});
  }, []);

  useEffect(() => { refreshCount(); }, [location.pathname, refreshCount]);

  function toggleOpen() {
    if (!open) {
      setError('');
      client.get('/notifications/unread')
        .then(r => setItems(r.data))
        .catch(err => setError(getApiErrorMessage(err, 'Could not load notifications')));
    }
    setOpen(o => !o);
  }

  async function handleItemClick(item) {
    setItems(list => list.filter(n => n.id !== item.id));
    setUnreadCount(c => Math.max(0, c - 1));
    setOpen(false);
    client.patch(`/notifications/${item.id}/read`).catch(() => {});
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
        style={{
          position: 'relative', background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 20, color: '#fff', padding: 4, lineHeight: 1
        }}
      >
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, padding: '0 4px',
            borderRadius: 999, background: 'var(--danger)', color: '#fff', fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
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
            position: 'absolute', top: '100%', right: 0, marginTop: 8, width: 320, maxWidth: '90vw',
            maxHeight: 400, overflowY: 'auto', background: 'var(--white)', borderRadius: 'var(--radius)',
            border: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(0,0,0,0.16)', zIndex: 91,
            padding: 12
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Notifications</span>
              <button
                onClick={viewAll}
                style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
              >
                View All
              </button>
            </div>

            {error && <p className="error-text" style={{ fontSize: 13 }}>{error}</p>}

            {!error && items.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', padding: '16px 0' }}>
                No new notifications
              </p>
            )}

            {items.map(item => (
              <button
                key={item.id}
                onClick={() => handleItemClick(item)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', font: 'inherit',
                  padding: '10px 8px', borderRadius: 'var(--radius-sm)', border: 'none',
                  background: 'none', cursor: 'pointer', borderBottom: '1px solid var(--border)'
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{item.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, whiteSpace: 'pre-line' }}>{item.body}</div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
