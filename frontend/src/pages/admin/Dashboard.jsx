import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { format } from 'date-fns';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    Promise.all([
      client.get('/users'),
      client.get('/leaves?status=pending'),
      client.get('/sessions?from=' + new Date().toISOString().split('T')[0]),
    ]).then(([users, leaves, sessions]) => {
      setStats({
        trainers: users.data.filter(u => u.role === 'trainer' && u.is_active).length,
        pendingLeaves: leaves.data.length,
        todaySessions: sessions.data.filter(s => s.scheduled_date === new Date().toISOString().split('T')[0]).length,
      });
    });
  }, []);

  const cards = [
    { label: 'Active Trainers', value: stats?.trainers ?? '…', to: '/trainers', color: '#6366f1' },
    { label: 'Pending Leaves', value: stats?.pendingLeaves ?? '…', to: '/leaves', color: 'var(--warning)' },
    { label: "Today's Sessions", value: stats?.todaySessions ?? '…', to: '/sessions', color: 'var(--success)' },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">{format(new Date(), 'EEEE, d MMMM yyyy')}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        {cards.map(c => (
          <div key={c.label} className="card" style={{ cursor: 'pointer', borderTop: `3px solid ${c.color}` }} onClick={() => navigate(c.to)}>
            <div style={{ fontSize: 28, fontWeight: 700, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{c.label}</div>
          </div>
        ))}
      </div>

      <p className="section-title">Quick Links</p>
      {[
        { label: 'Manage Trainers', sub: 'Add, edit or deactivate trainers', to: '/trainers', icon: '👥' },
        { label: 'Schedule Sessions', sub: 'Create and assign sessions', to: '/sessions', icon: '📅' },
        { label: 'Review Leaves', sub: 'Approve or reject leave requests', to: '/leaves', icon: '📝' },
        { label: 'Manage Sequences', sub: 'Oversee weekly sequence plan', to: '/sequences', icon: '⊡' },
        { label: 'Manage Resources', sub: 'Add books, audios and links', to: '/resources', icon: '📚' },
      ].map(item => (
        <div key={item.to} className="list-item" style={{ cursor: 'pointer' }} onClick={() => navigate(item.to)}>
          <span style={{ fontSize: 24 }}>{item.icon}</span>
          <div className="list-item-left">
            <div className="list-item-title">{item.label}</div>
            <div className="list-item-sub">{item.sub}</div>
          </div>
          <svg width="8" height="14" viewBox="0 0 8 14" fill="none"><path d="M1 1l6 6-6 6" stroke="var(--text-secondary)" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </div>
      ))}
    </div>
  );
}
