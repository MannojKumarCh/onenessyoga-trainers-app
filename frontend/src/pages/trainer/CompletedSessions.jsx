import { useState, useEffect } from 'react';
import client from '../../api/client';
import { format } from 'date-fns';

export default function CompletedSessions() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client.get('/sessions/completed').then(r => setSessions(r.data)).finally(() => setLoading(false));
  }, []);

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
        <h1 className="page-title">Completed Sessions</h1>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">✓</div>
          <p>No completed sessions yet</p>
        </div>
      ) : Object.entries(grouped).map(([date, items]) => (
        <div key={date}>
          <p className="section-title">{format(new Date(date), 'EEEE, d MMMM yyyy')}</p>
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 1fr', padding: '8px 14px', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Trainer</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Time</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes</span>
            </div>
            {items.map((s, i) => (
              <div key={s.id} style={{
                display: 'grid', gridTemplateColumns: '1fr 100px 1fr',
                padding: '12px 14px', borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none'
              }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{s.trainer_name}</span>
                <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{s.scheduled_time}</span>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{s.notes || '—'}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
