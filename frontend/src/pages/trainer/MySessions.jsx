import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { dayLabel, groupByDate } from '../../utils/date';

export default function MySessions() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    client.get('/sessions/my').then(r => setSessions(r.data)).catch(() => setError(true)).finally(() => setLoading(false));
  }, []);

  const grouped = groupByDate(sessions);

  if (loading) return <div className="loading">Loading…</div>;
  if (error) return <div className="empty-state"><div className="empty-state-icon">⚠️</div><p>Couldn't load sessions. Please try again.</p></div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">My Sessions</h1>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📅</div>
          <p>No upcoming sessions</p>
        </div>
      ) : Object.entries(grouped).map(([date, items]) => (
        <div key={date}>
          <p className="section-title">{dayLabel(date, 'EEEE, d MMMM yyyy')}</p>
          {items.map(s => (
            <div key={s.id} className="list-item" style={{ cursor: 'pointer' }} onClick={() => navigate(`/sessions/${s.id}`)}>
              <div className="list-item-left">
                <div className="list-item-title">{s.title}</div>
                <div className="list-item-sub">{s.scheduled_time} · {s.session_type}</div>
              </div>
              <svg width="8" height="14" viewBox="0 0 8 14" fill="none"><path d="M1 1l6 6-6 6" stroke="var(--text-secondary)" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
