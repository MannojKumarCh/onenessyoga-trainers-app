import { useState, useEffect, useCallback } from 'react';
import client from '../../api/client';
import { format } from 'date-fns';
import { groupByDate } from '../../utils/date';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import TopicSelect from '../../components/TopicSelect';
import SessionThumb from '../../components/SessionThumb';
import { getApiErrorMessage } from '../../utils/apiError';
import { ExclamationTriangleIcon, CalendarDaysIcon, PlusIcon } from '@heroicons/react/24/outline';
import usePolling from '../../hooks/usePolling';
import { useToast } from '../../context/ToastContext';

const EMPTY_SESSION = { title: 'Daily Session', scheduled_date: '', scheduled_time: '06:15', session_type: 'BKP', assigned_trainer_id: '', zoom_link: '' };

export default function AdminSessions() {
  const [sessions, setSessions] = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_SESSION);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0]);
  const [deleteId, setDeleteId] = useState(null);
  
  const { showToast } = useToast();

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    Promise.all([
      client.get(`/sessions?from=${dateFrom}`),
      client.get('/users/trainers')
    ]).then(([s, t]) => {
      setSessions(s.data);
      setTrainers(t.data);
    }).catch(() => setLoadError(true)).finally(() => setLoading(false));
  }, [dateFrom]);

  useEffect(() => { load(); }, [load]);
  
  usePolling(load, 30000);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const trainerId = form.assigned_trainer_id ? Number(form.assigned_trainer_id) : null;
      if (trainerId !== null && (!Number.isInteger(trainerId) || trainerId <= 0)) {
        setError('Please select a valid trainer.');
        return;
      }

      const payload = { ...form, assigned_trainer_id: trainerId, zoom_link: form.zoom_link || null };
      await client.post('/sessions', payload);
      setShowForm(false);
      setForm(EMPTY_SESSION);
      showToast('Session Saved Successfully');
      load();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to save session'));
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteSession(id) {
    setDeleteId(null);
    setError('');
    try {
      await client.delete(`/sessions/${id}`);
      showToast('Session Deleted');
      load();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to delete session'));
    }
  }

  const grouped = groupByDate(sessions);

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="page-title">Sessions</h1>
        <button className="btn btn-primary" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowForm(true)}><PlusIcon style={{ width: 16, height: 16 }} /> Add Session</button>
      </div>

      <div className="form-group">
        <label className="label" htmlFor="sessions-from-date">From Date</label>
        <input id="sessions-from-date" className="input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
      </div>

      {error && !showForm && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}

      {loading ? <div className="loading">Loading…</div> : loadError ? (
        <div className="empty-state"><div className="empty-state-icon"><ExclamationTriangleIcon style={{ width: 20, height: 20 }} /></div><p>Couldn't load sessions. Please try again.</p></div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="empty-state"><div style={{ display: 'flex', justifyContent: 'center', margin: '0 auto 12px' }}><CalendarDaysIcon style={{ width: 48, height: 48, color: 'var(--text-secondary)' }} /></div><p>No sessions found</p></div>
      ) : Object.entries(grouped).map(([date, items]) => (
        <div key={date}>
          <p className="section-title">{format(new Date(date), 'EEEE, d MMMM yyyy')}</p>
          {items.map(s => (
            <div key={s.id} className="list-item">
              <SessionThumb topic={s.session_type} />
              <div className="list-item-left">
                <div className="list-item-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {s.title} {s.is_completed && <span className="badge badge-approved">Done</span>}
                </div>
                <div className="list-item-sub">{s.scheduled_time} · {s.trainer_name || 'Unassigned'}</div>
              </div>
              <button onClick={() => setDeleteId(s.id)} style={{ color: 'var(--danger)', fontSize: 12, padding: '4px 8px', background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
            </div>
          ))}
        </div>
      ))}

      {showForm && (
        <Modal title="Add Session" onClose={() => setShowForm(false)}>
            <form onSubmit={submit}>
              <div className="form-group">
                <label className="label" htmlFor="session-title">Title</label>
                <input id="session-title" className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="label" htmlFor="session-date">Date</label>
                  <input id="session-date" className="input" type="date" value={form.scheduled_date} onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="label" htmlFor="session-time">Time</label>
                  <input id="session-time" className="input" type="time" value={form.scheduled_time} onChange={e => setForm(f => ({ ...f, scheduled_time: e.target.value }))} required />
                </div>
              </div>
              <div className="form-group">
                <label className="label" htmlFor="session-type">Session Type</label>
                <TopicSelect id="session-type" value={form.session_type} onChange={v => setForm(f => ({ ...f, session_type: v }))} />
              </div>
              <div className="form-group">
                <label className="label" htmlFor="session-trainer">Assign Trainer</label>
                <select id="session-trainer" className="input" value={form.assigned_trainer_id} onChange={e => setForm(f => ({ ...f, assigned_trainer_id: e.target.value }))}>
                  <option value="">Unassigned</option>
                  {trainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="label" htmlFor="session-zoom">Zoom Link</label>
                <input id="session-zoom" className="input" type="url" value={form.zoom_link} onChange={e => setForm(f => ({ ...f, zoom_link: e.target.value }))} placeholder="https://…" />
              </div>
              {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={submitting}>
                  {submitting ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
        </Modal>
      )}

      {deleteId != null && (
        <ConfirmDialog
          title="Delete Session"
          message="Delete this session?"
          confirmLabel="Delete"
          danger
          onCancel={() => setDeleteId(null)}
          onConfirm={() => deleteSession(deleteId)}
        />
      )}
    </div>
  );
}
