import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ExclamationTriangleIcon, BellIcon } from '@heroicons/react/24/outline';
import client from '../api/client';
import usePolling from '../hooks/usePolling';
import { useToast } from '../context/ToastContext';
import { getApiErrorMessage } from '../utils/apiError';

export default function Notifications() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    client.get('/notifications/history').then(r => setNotifications(r.data)).catch(() => setLoadError(true)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  usePolling(load, 30000);

  async function handleClick(item) {
    if (!item.is_read) {
      setNotifications(list => list.map(n => n.id === item.id ? { ...n, is_read: true } : n));
      client.patch(`/notifications/${item.id}/read`).catch(() => {});
    }
    if (item.url) navigate(item.url);
  }

  async function markAllRead() {
    try {
      await client.patch('/notifications/read-all');
      showToast('All Notifications Marked as Read');
      load();
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Failed to mark all as read'), 'error');
    }
  }

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="page-title">Notifications</h1>
        <button className="btn btn-ghost" style={{ fontSize: 13, padding: '4px 8px' }} onClick={markAllRead}>Mark All Read</button>
      </div>

      {loading ? <div className="loading">Loading…</div> : loadError ? (
        <div className="empty-state">
          <div className="empty-state-icon" style={{ display: 'flex', justifyContent: 'center' }}>
            <ExclamationTriangleIcon style={{ width: 20, height: 20 }} />
          </div>
          <p>Couldn't load notifications. Please try again.</p>
        </div>
      ) : notifications.length === 0 ? (
        <div className="empty-state">
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <BellIcon style={{ width: 48, height: 48, color: 'var(--text-secondary)', margin: '0 auto 12px' }} />
          </div>
          <p>No notifications yet</p>
        </div>
      ) : notifications.map(item => (
        <button
          key={item.id}
          className="list-item"
          style={{
            width: '100%', textAlign: 'left', font: 'inherit', display: 'block',
            background: item.is_read ? 'var(--white)' : 'var(--primary-light)'
          }}
          onClick={() => handleClick(item)}
        >
          <div className="list-item-title" style={{ fontWeight: item.is_read ? 600 : 700 }}>{item.title}</div>
          <div className="list-item-sub" style={{ whiteSpace: 'pre-line' }}>{item.body}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
            {format(new Date(item.created_at), 'EEE, d MMM yyyy · h:mm a')}
          </div>
        </button>
      ))}
    </div>
  );
}
