import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import client from '../../api/client';
import { format } from 'date-fns';
import { dayLabel } from '../../utils/date';
import { ExclamationTriangleIcon, SparklesIcon, CalendarDaysIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import usePolling from '../../hooks/usePolling';

import { usePush } from '../../hooks/usePush';
import { BellAlertIcon } from '@heroicons/react/24/outline';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { supported, permission, isEnabling, enablePushNotifications } = usePush(user);
  const [sessions, setSessions] = useState([]);
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [sequences, setSequences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
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

  useEffect(() => { load(); }, [load]);
  usePolling(load, 30000);

  if (loading) return <div className="loading">Loading…</div>;
  if (error) return (
    <div className="page">
      <div className="empty-state">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <ExclamationTriangleIcon style={{ width: 48, height: 48, color: 'var(--danger)' }} />
        </div>
        <p style={{ fontWeight: 600 }}>Couldn't load dashboard</p>
        <button className="btn btn-outline" style={{ marginTop: 12 }} onClick={load}>Try Again</button>
      </div>
    </div>
  );

  return (
    <div className="page" style={{ animation: 'pageEnter 0.3s ease-out' }}>
      {/* Welcome Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(232, 97, 77, 0.08) 0%, rgba(99, 102, 241, 0.06) 100%)',
        border: '1px solid var(--border-light)',
        borderRadius: 'var(--radius)',
        padding: '20px 24px',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <SparklesIcon style={{ width: 20, height: 20, color: 'var(--primary)' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Trainer Portal
            </span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
            Hello, {user.name.split(' ')[0]} 👋
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 2 }}>
            Here are your upcoming sessions and sequences
          </p>
        </div>

        <div style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 999,
          padding: '6px 14px',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text-secondary)',
          boxShadow: 'var(--shadow-sm)'
        }}>
          {format(new Date(), 'EEEE, d MMMM yyyy')}
        </div>
      </div>

      {/* Prominent Enable Push Notifications Banner (If not yet granted) */}
      {supported && permission !== 'granted' && (
        <div style={{
          background: 'linear-gradient(135deg, #FEF0EE 0%, #FFF7ED 100%)',
          border: '1.5px solid var(--primary)',
          borderRadius: 'var(--radius)',
          padding: '16px 20px',
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          boxShadow: 'var(--shadow-md)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
            <div className="stat-icon-box" style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              background: 'var(--primary)',
              color: '#fff',
              flexShrink: 0
            }}>
              <BellAlertIcon style={{ width: 22, height: 22 }} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                Enable Mobile Push Notifications
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                Get instant alerts on your phone for new sessions, sequences, and leave updates.
              </div>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => enablePushNotifications().catch(() => {})}
            disabled={isEnabling}
            style={{ fontSize: 13, padding: '8px 18px', minHeight: 38 }}
          >
            {isEnabling ? 'Enabling…' : 'Enable Notifications'}
          </button>
        </div>
      )}

      {/* Upcoming sessions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text)' }}>
          Upcoming Sessions
        </h2>
        <button className="btn btn-ghost" style={{ fontSize: 13, padding: '4px 10px', color: 'var(--primary)', fontWeight: 600 }} onClick={() => navigate('/sessions')}>
          View All
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="card" style={{ color: 'var(--text-secondary)', fontSize: 14, textAlign: 'center', padding: '24px 20px', marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
            <CalendarDaysIcon style={{ width: 36, height: 36, color: 'var(--text-tertiary)' }} />
          </div>
          No upcoming sessions scheduled
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {sessions.map(s => (
            <button
              key={s.id}
              className="list-item"
              style={{
                cursor: 'pointer',
                width: '100%',
                textAlign: 'left',
                font: 'inherit',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius)',
                padding: '16px 18px',
                boxShadow: 'var(--shadow-sm)',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
              onClick={() => navigate(`/sessions/${s.id}`)}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = 'var(--shadow-md)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
              }}
            >
              <div className="list-item-left">
                <div className="list-item-title" style={{ fontSize: 15, fontWeight: 700 }}>{s.title}</div>
                <div className="list-item-sub" style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {dayLabel(s.scheduled_date)} · {s.scheduled_time}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="tag" style={{ background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 700 }}>{s.session_type}</span>
                <ChevronRightIcon style={{ width: 16, height: 16, color: 'var(--text-tertiary)' }} />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Pending leaves */}
      {pendingLeaves.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text)' }}>
              Pending Leaves
            </h2>
            <button className="btn btn-ghost" style={{ fontSize: 13, padding: '4px 10px', color: 'var(--primary)', fontWeight: 600 }} onClick={() => navigate('/leaves')}>
              View All
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pendingLeaves.map(l => (
              <div key={l.id} className="list-item" style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius)',
                padding: '14px 18px',
                boxShadow: 'var(--shadow-sm)'
              }}>
                <div className="list-item-left">
                  <div className="list-item-title" style={{ fontSize: 14, fontWeight: 600 }}>{l.reason}</div>
                  <div className="list-item-sub" style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{l.from_date} → {l.to_date}</div>
                </div>
                <span className="badge badge-pending">Pending Review</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* This week's sequences */}
      {sequences.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text)' }}>
              This Week's Sequences
            </h2>
            <button className="btn btn-ghost" style={{ fontSize: 13, padding: '4px 10px', color: 'var(--primary)', fontWeight: 600 }} onClick={() => navigate('/sequences')}>
              View All
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sequences.map(seq => (
              <button
                key={seq.id}
                className="list-item"
                style={{
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                  font: 'inherit',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius)',
                  padding: '16px 18px',
                  boxShadow: 'var(--shadow-sm)',
                  transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                }}
                onClick={() => navigate(`/sequences/${seq.id}`)}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                }}
              >
                <div className="list-item-left">
                  <div className="list-item-title" style={{ fontSize: 15, fontWeight: 700 }}>{seq.topic}</div>
                  <div className="list-item-sub" style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {format(new Date(seq.scheduled_date), 'EEE, d MMM')} · {seq.trainer_name}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className={`badge badge-${seq.status}`}>{seq.status.charAt(0).toUpperCase() + seq.status.slice(1)}</span>
                  <ChevronRightIcon style={{ width: 16, height: 16, color: 'var(--text-tertiary)' }} />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
