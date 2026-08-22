import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { dayLabel, groupByDate } from '../../utils/date';
import { ExclamationTriangleIcon, CalendarDaysIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import SessionThumb from '../../components/SessionThumb';
import usePolling from '../../hooks/usePolling';
import { useToast } from '../../context/ToastContext';

export default function MySessions() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    client.get('/sessions/my').then(r => setSessions(r.data)).catch(() => setError(true)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  usePolling(load, 30000);

  const grouped = groupByDate(sessions);

  if (loading) return <div className="loading">Loading…</div>;
  if (error) return <div className="empty-state"><div style={{ display: 'flex', justifyContent: 'center' }}><ExclamationTriangleIcon style={{ width: 48, height: 48, color: 'var(--text-secondary)' }} /></div><p>Couldn't load sessions. Please try again.</p></div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">My Sessions</h1>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="empty-state">
          <div style={{ display: 'flex', justifyContent: 'center' }}><CalendarDaysIcon style={{ width: 48, height: 48, color: 'var(--text-secondary)' }} /></div>
          <p>No upcoming sessions</p>
        </div>
      ) : Object.entries(grouped).map(([date, items]) => (
        <div key={date}>
          <p className="section-title">{dayLabel(date, 'EEEE, d MMMM yyyy')}</p>
          {items.map(s => (
            <div key={s.id} className="list-item" style={{ cursor: 'pointer' }} onClick={() => navigate(`/sessions/${s.id}`)}>
              <SessionThumb topic={s.session_type} />
              <div className="list-item-left">
                <div className="list-item-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {s.title} {s.viewer_role === 'backup' && <span className="badge badge-info">Backup</span>}
                </div>
                <div className="list-item-sub">
                  {s.scheduled_time} · {s.session_type}
                  {s.viewer_role === 'assigned' && s.backup_trainer_name && ` · Covered by ${s.backup_trainer_name}`}
                </div>
              </div>
              <ChevronRightIcon style={{ width: 16, height: 16 }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
