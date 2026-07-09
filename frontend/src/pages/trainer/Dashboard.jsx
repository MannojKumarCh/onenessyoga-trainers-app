import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import client from '../../api/client';
import { format } from 'date-fns';
import { dayLabel } from '../../utils/date';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [sequences, setSequences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    Promise.all([
      client.get('/sessions/my'),
      client.get('/leaves/my'),
      client.get('/sequences')
    ]).then(([s, l, seq]) => {
      setSessions(s.data.slice(0, 3));
      setPendingLeaves(l.data.filter(x => x.status === 'pending'));
      // Latest week's sequences
      const weeks = [...new Set(seq.data.map(x => x.week_start_date))].sort().reverse();
      setSequences(seq.data.filter(x => x.week_start_date === weeks[0]).slice(0, 3));
    }).catch(() => setError(true)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading…</div>;
  if (error) return <div className="empty-state"><div className="empty-state-icon">⚠️</div><p>Couldn't load your dashboard. Please try again.</p></div>;

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Hello, {user.name.split(' ')[0]} 👋</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>{format(new Date(), 'EEEE, d MMMM yyyy')}</p>
        </div>
        <button onClick={logout} className="btn btn-ghost" style={{ fontSize: 13 }}>Logout</button>
      </div>

      {/* Upcoming sessions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span className="section-title" style={{ margin: 0 }}>Upcoming Sessions</span>
        <button className="btn btn-ghost" style={{ fontSize: 13, padding: '4px 8px' }} onClick={() => navigate('/sessions')}>View all</button>
      </div>
      {sessions.length === 0 ? (
        <div className="card" style={{ color: 'var(--text-secondary)', fontSize: 14, textAlign: 'center', padding: '20px' }}>
          No upcoming sessions
        </div>
      ) : sessions.map(s => (
        <div key={s.id} className="list-item" style={{ cursor: 'pointer' }} onClick={() => navigate(`/sessions/${s.id}`)}>
          <div className="list-item-left">
            <div className="list-item-title">{s.title}</div>
            <div className="list-item-sub">{dayLabel(s.scheduled_date)} · {s.scheduled_time}</div>
          </div>
          <span className="tag">{s.session_type}</span>
        </div>
      ))}

      {/* Pending leaves */}
      {pendingLeaves.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 10 }}>
            <span className="section-title" style={{ margin: 0 }}>Pending Leaves</span>
            <button className="btn btn-ghost" style={{ fontSize: 13, padding: '4px 8px' }} onClick={() => navigate('/leaves')}>View all</button>
          </div>
          {pendingLeaves.map(l => (
            <div key={l.id} className="list-item">
              <div className="list-item-left">
                <div className="list-item-title">{l.reason}</div>
                <div className="list-item-sub">{l.from_date} → {l.to_date}</div>
              </div>
              <span className="badge badge-pending">Pending</span>
            </div>
          ))}
        </>
      )}

      {/* This week's sequences */}
      {sequences.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 10 }}>
            <span className="section-title" style={{ margin: 0 }}>This Week's Sequence</span>
            <button className="btn btn-ghost" style={{ fontSize: 13, padding: '4px 8px' }} onClick={() => navigate('/sequences')}>View all</button>
          </div>
          {sequences.map(seq => (
            <div key={seq.id} className="list-item" style={{ cursor: 'pointer' }} onClick={() => navigate(`/sequences/${seq.id}`)}>
              <div className="list-item-left">
                <div className="list-item-title">{seq.topic}</div>
                <div className="list-item-sub">{format(new Date(seq.scheduled_date), 'EEE, d MMM')} · {seq.trainer_name}</div>
              </div>
              <span className={`badge badge-${seq.status}`}>{seq.status}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
