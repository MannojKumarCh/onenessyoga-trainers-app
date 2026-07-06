import { useState, useEffect } from 'react';
import client from '../../api/client';
import { format } from 'date-fns';

const EMPTY_SESSION = { title: 'Daily Session', scheduled_date: '', scheduled_time: '06:15', session_type: 'BKP', assigned_trainer_id: '', zoom_link: '' };

export default function AdminSessions() {
  const [sessions, setSessions] = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_SESSION);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0]);

  function load() {
    setLoading(true);
    Promise.all([
      client.get(`/sessions?from=${dateFrom}`),
      client.get('/users/trainers')
    ]).then(([s, t]) => {
      setSessions(s.data);
      setTrainers(t.data);
    }).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [dateFrom]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const payload = { ...form, assigned_trainer_id: form.assigned_trainer_id || null, zoom_link: form.zoom_link || null };
      await client.post('/sessions', payload);
      setShowForm(false);
      setForm(EMPTY_SESSION);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteSession(id) {
    if (!confirm('Delete this session?')) return;
    await client.delete(`/sessions/${id}`);
    load();
  }

  const grouped = sessions.reduce((acc, s) => {
    if (!acc[s.scheduled_date]) acc[s.scheduled_date] = [];
    acc[s.scheduled_date].push(s);
    return acc;
  }, {});

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="page-title">Sessions</h1>
        <button className="btn btn-primary" style={{ padding: '8px 16px' }} onClick={() => setShowForm(true)}>+ Add</button>
      </div>

      <div className="form-group">
        <label className="label">From date</label>
        <input className="input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
      </div>

      {loading ? <div className="loading">Loading…</div> : Object.keys(grouped).length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon">📅</div><p>No sessions found</p></div>
      ) : Object.entries(grouped).map(([date, items]) => (
        <div key={date}>
          <p className="section-title">{format(new Date(date), 'EEEE, d MMMM yyyy')}</p>
          {items.map(s => (
            <div key={s.id} className="list-item">
              <div className="list-item-left">
                <div className="list-item-title">{s.title} {s.is_completed ? '✓' : ''}</div>
                <div className="list-item-sub">{s.scheduled_time} · {s.trainer_name || 'Unassigned'}</div>
              </div>
              <button onClick={() => deleteSession(s.id)} style={{ color: 'var(--danger)', fontSize: 12, padding: '4px 8px', background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
            </div>
          ))}
        </div>
      ))}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Add Session</h3>
            <form onSubmit={submit}>
              <div className="form-group">
                <label className="label">Title</label>
                <input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="label">Date</label>
                  <input className="input" type="date" value={form.scheduled_date} onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="label">Time</label>
                  <input className="input" type="time" value={form.scheduled_time} onChange={e => setForm(f => ({ ...f, scheduled_time: e.target.value }))} required />
                </div>
              </div>
              <div className="form-group">
                <label className="label">Session Type</label>
                <input className="input" value={form.session_type} onChange={e => setForm(f => ({ ...f, session_type: e.target.value }))} placeholder="BKP" />
              </div>
              <div className="form-group">
                <label className="label">Assign Trainer</label>
                <select className="input" value={form.assigned_trainer_id} onChange={e => setForm(f => ({ ...f, assigned_trainer_id: e.target.value }))}>
                  <option value="">Unassigned</option>
                  {trainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="label">Zoom Link</label>
                <input className="input" type="url" value={form.zoom_link} onChange={e => setForm(f => ({ ...f, zoom_link: e.target.value }))} placeholder="https://…" />
              </div>
              {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={submitting}>
                  {submitting ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
