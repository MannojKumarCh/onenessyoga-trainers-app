import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { format, isToday, isTomorrow } from 'date-fns';

export default function MySessions() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client.get('/sessions/my').then(r => setSessions(r.data)).finally(() => setLoading(false));
  }, []);

  function dayLabel(dateStr) {
    const d = new Date(dateStr);
    if (isToday(d)) return 'Today';
    if (isTomorrow(d)) return 'Tomorrow';
    return format(d, 'EEEE, d MMMM yyyy');
  }

  const grouped = sessions.reduce((acc, s) => {
    const key = s.scheduled_date;
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  if (loading) return <div className="loading">Loading…</div>;

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
          <p className="section-title">{dayLabel(date)}</p>
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
