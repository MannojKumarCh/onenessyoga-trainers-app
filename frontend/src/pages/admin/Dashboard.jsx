import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { format } from 'date-fns';
import usePolling from '../../hooks/usePolling';
import { useToast } from '../../context/ToastContext';
import { usePush } from '../../hooks/usePush';
import { useAuth } from '../../context/AuthContext';
import SessionThumb from '../../components/SessionThumb';
import {
  ExclamationTriangleIcon,
  UsersIcon,
  CalendarDaysIcon,
  DocumentTextIcon,
  SparklesIcon,
  ClockIcon,
  VideoCameraIcon,
  BellAlertIcon
} from '@heroicons/react/24/outline';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { supported, permission, isEnabling, enablePushNotifications } = usePush(user);

  const [stats, setStats] = useState(null);
  const [todaySessionsList, setTodaySessionsList] = useState([]);
  const [pendingLeavesList, setPendingLeavesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);


  const todayStr = new Date().toISOString().split('T')[0];

  const load = useCallback(() => {
    Promise.all([
      client.get('/users'),
      client.get('/leaves?status=pending'),
      client.get(`/sessions?from=${todayStr}&to=${todayStr}`),
    ]).then(([users, leaves, sessions]) => {
      const trainersCount = users.data.filter(u => (u.roles.includes('trainer') || u.roles.includes('kids_yoga_trainer')) && u.is_active).length;
      setPendingLeavesList(leaves.data);
      setTodaySessionsList(sessions.data);
      setStats({
        trainers: trainersCount,
        pendingLeaves: leaves.data.length,
        todaySessions: sessions.data.length,
      });
      setError(false);
    }).catch(() => setError(true)).finally(() => setLoading(false));
  }, [todayStr]);

  useEffect(() => {
    load();
  }, [load]);

  usePolling(load, 30000);



  if (loading) return <div className="loading">Loading…</div>;

  if (error) return (
    <div className="page">
      <div className="empty-state">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <ExclamationTriangleIcon style={{ width: 48, height: 48, color: 'var(--danger)' }} />
        </div>
        <p style={{ fontWeight: 600 }}>Couldn't load dashboard stats</p>
        <button className="btn btn-outline" style={{ marginTop: 12 }} onClick={load}>Try Again</button>
      </div>
    </div>
  );

  const statCards = [
    {
      label: 'Active Trainers',
      value: stats?.trainers ?? 0,
      to: '/trainers',
      Icon: UsersIcon,
      accentColor: '#6366F1',
      bgColor: '#EEF2FF',
      subtext: stats?.trainers === 1 ? '1 active trainer' : `${stats?.trainers || 0} active trainers`
    },
    {
      label: 'Pending Leaves',
      value: stats?.pendingLeaves ?? 0,
      to: '/leaves',
      Icon: DocumentTextIcon,
      accentColor: '#F59E0B',
      bgColor: '#FEF3C7',
      subtext: stats?.pendingLeaves > 0 ? `${stats.pendingLeaves} awaiting review` : 'All caught up'
    },
    {
      label: "Today's Sessions",
      value: stats?.todaySessions ?? 0,
      to: '/sessions',
      Icon: CalendarDaysIcon,
      accentColor: '#10B981',
      bgColor: '#D1FAE5',
      subtext: stats?.todaySessions > 0 ? `${stats.todaySessions} scheduled today` : 'No sessions today'
    },
  ];

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
        justify: 'space-between',
        flexWrap: 'wrap',
        gap: 12
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <SparklesIcon style={{ width: 18, height: 18, color: 'var(--primary)', flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Admin Overview
            </span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
            Welcome Back, Admin
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 2 }}>
            Here is your live yoga center activity center
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>

          <div style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 999,
            padding: '6px 14px',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-secondary)',
            boxShadow: 'var(--shadow-sm)',
            whiteSpace: 'nowrap'
          }}>
            {format(new Date(), 'EEEE, d MMMM yyyy')}
          </div>
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
          justify: 'space-between',
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
                Receive instant alerts on your phone whenever trainers request leave or complete sessions.
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

      {/* Metrics Stat Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 14,
        marginBottom: 28
      }}>
        {statCards.map(c => (
          <button
            key={c.label}
            onClick={() => navigate(c.to)}
            style={{
              textAlign: 'left',
              background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius)',
              padding: '16px 18px',
              border: '1px solid var(--border-light)',
              boxShadow: 'var(--shadow-sm)',
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              justify: 'space-between',
              boxSizing: 'border-box'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = 'var(--shadow-md)';
              e.currentTarget.style.borderColor = c.accentColor;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'none';
              e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
              e.currentTarget.style.borderColor = 'var(--border-light)';
            }}
          >
            {/* Accent Line */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 3,
              background: c.accentColor
            }} />

            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              justify: 'space-between',
              gap: 8,
              width: '100%',
              marginBottom: 12
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                {c.label}
              </span>
              <div
                className="stat-icon-box"
                style={{
                  width: 36,
                  height: 36,
                  minWidth: 36,
                  minHeight: 36,
                  borderRadius: 10,
                  background: c.bgColor,
                  color: c.accentColor,
                  flexShrink: 0
                }}
              >
                <c.Icon style={{ width: 20, height: 20 }} />
              </div>
            </div>

            <div>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', lineHeight: 1 }}>
                {c.value}
              </div>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-tertiary)', marginTop: 6 }}>
                {c.subtext}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Pending Leaves Section */}
      {pendingLeavesList.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text)' }}>
                Pending Leave Requests
              </h2>
              <span className="badge badge-pending">{pendingLeavesList.length}</span>
            </div>
            <button className="btn btn-ghost" style={{ fontSize: 13, padding: '4px 10px', color: 'var(--primary)', fontWeight: 600 }} onClick={() => navigate('/leaves')}>
              View All
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pendingLeavesList.slice(0, 3).map(l => (
              <div
                key={l.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justify: 'space-between',
                  padding: '16px 18px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius)',
                  boxShadow: 'var(--shadow-sm)',
                  flexWrap: 'wrap',
                  gap: 12
                }}
              >
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{l.trainer_name}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {l.from_date} → {l.to_date} · Reason: {l.reason}
                  </div>
                </div>
                <button
                  className="btn btn-primary"
                  style={{ fontSize: 13, padding: '6px 16px', minHeight: 36 }}
                  onClick={() => navigate('/leaves')}
                >
                  Review Request
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Today's Schedule Section */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text)' }}>
            Today's Schedule
          </h2>
          <button className="btn btn-ghost" style={{ fontSize: 13, padding: '4px 10px', color: 'var(--primary)', fontWeight: 600 }} onClick={() => navigate('/sessions')}>
            View All
          </button>
        </div>

        {todaySessionsList.length === 0 ? (
          <div className="card" style={{ color: 'var(--text-secondary)', fontSize: 14, textAlign: 'center', padding: '24px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
              <CalendarDaysIcon style={{ width: 36, height: 36, color: 'var(--text-tertiary)', flexShrink: 0 }} />
            </div>
            No sessions scheduled for today
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {todaySessionsList.map(s => (
              <div
                key={s.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justify: 'space-between',
                  padding: '16px 18px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius)',
                  boxShadow: 'var(--shadow-sm)',
                  flexWrap: 'wrap',
                  gap: 12
                }}
              >
                <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <SessionThumb topic={s.session_type} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{s.title}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <ClockIcon style={{ width: 15, height: 15, color: 'var(--text-tertiary)', flexShrink: 0 }} />
                        {s.scheduled_time}
                      </span>
                      <span>Trainer: <strong>{s.trainer_name || 'Unassigned'}</strong></span>
                      {s.backup_trainer_name && <span>Backup: <strong>{s.backup_trainer_name}</strong></span>}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="tag" style={{ background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 700 }}>{s.session_type}</span>
                  {s.zoom_link && (
                    <a
                      href={s.zoom_link}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-outline"
                      style={{ fontSize: 12, padding: '4px 10px', minHeight: 32, display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <VideoCameraIcon style={{ width: 14, height: 14, flexShrink: 0 }} /> Zoom
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
