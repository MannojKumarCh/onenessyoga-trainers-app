import { useState, useEffect, useCallback } from 'react';
import client from '../../api/client';
import { format } from 'date-fns';
import { groupByDate } from '../../utils/date';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import TopicSelect from '../../components/TopicSelect';
import SessionThumb from '../../components/SessionThumb';
import WeeklySchedule from '../../components/WeeklySchedule';
import MySessions from '../trainer/MySessions';
import { getApiErrorMessage } from '../../utils/apiError';
import { ExclamationTriangleIcon, CalendarDaysIcon, PlusIcon } from '@heroicons/react/24/outline';
import usePolling from '../../hooks/usePolling';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

const EMPTY_SESSION = { title: 'Daily Session', scheduled_date: '', scheduled_time: '06:15', session_type: 'BKP', assigned_trainer_id: '', zoom_link: '' };

export default function AdminSessions() {
  const [tab, setTab] = useState('sessions');
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
  const [backupFor, setBackupFor] = useState(null);
  const [backupTrainerId, setBackupTrainerId] = useState('');
  const [backupSubmitting, setBackupSubmitting] = useState(false);
  const [backupError, setBackupError] = useState('');
  const [assignFor, setAssignFor] = useState(null);
  const [assignTrainerId, setAssignTrainerId] = useState('');
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignError, setAssignError] = useState('');
  const [zoomFor, setZoomFor] = useState(null);
  const [zoomLinkValue, setZoomLinkValue] = useState('');
  const [zoomSubmitting, setZoomSubmitting] = useState(false);
  const [zoomError, setZoomError] = useState('');

  const { showToast } = useToast();
  const { user } = useAuth();
  const isAlsoTrainer = user.roles.includes('trainer') || user.roles.includes('kids_yoga_trainer');

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
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

  usePolling(() => load(true), 30000);

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

  function openBackup(session) {
    setBackupFor(session);
    setBackupTrainerId(session.backup_trainer_id || '');
    setBackupError('');
  }

  async function submitBackup(e) {
    e.preventDefault();
    setBackupError('');
    setBackupSubmitting(true);
    try {
      await client.patch(`/sessions/${backupFor.id}/backup`, {
        backup_trainer_id: backupTrainerId ? Number(backupTrainerId) : null
      });
      setBackupFor(null);
      showToast('Backup Trainer Updated');
      load();
    } catch (err) {
      setBackupError(getApiErrorMessage(err, 'Failed to update backup trainer'));
    } finally {
      setBackupSubmitting(false);
    }
  }

  function openAssign(session) {
    setAssignFor(session);
    setAssignTrainerId(session.assigned_trainer_id || '');
    setAssignError('');
  }

  async function submitAssign(e) {
    e.preventDefault();
    setAssignError('');
    setAssignSubmitting(true);
    try {
      if (!assignTrainerId) {
        setAssignError('Please select a trainer.');
        return;
      }
      await client.put(`/sessions/${assignFor.id}`, { assigned_trainer_id: Number(assignTrainerId) });
      setAssignFor(null);
      showToast('Trainer Assigned');
      load();
    } catch (err) {
      setAssignError(getApiErrorMessage(err, 'Failed to assign trainer'));
    } finally {
      setAssignSubmitting(false);
    }
  }

  function openZoom(session) {
    setZoomFor(session);
    setZoomLinkValue(session.zoom_link || '');
    setZoomError('');
  }

  async function submitZoom(e) {
    e.preventDefault();
    setZoomError('');
    setZoomSubmitting(true);
    try {
      await client.patch(`/sessions/${zoomFor.id}/zoom-link`, { zoom_link: zoomLinkValue || null });
      setZoomFor(null);
      showToast('Zoom Link Updated');
      load();
    } catch (err) {
      setZoomError(getApiErrorMessage(err, 'Failed to update zoom link'));
    } finally {
      setZoomSubmitting(false);
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
        {tab === 'sessions' && (
          <button className="btn btn-primary" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowForm(true)}><PlusIcon style={{ width: 16, height: 16 }} /> Add Session</button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          className={`btn ${tab === 'sessions' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ padding: '7px 14px', fontSize: 13 }}
          onClick={() => setTab('sessions')}
        >
          Sessions
        </button>
        <button
          className={`btn ${tab === 'schedule' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ padding: '7px 14px', fontSize: 13 }}
          onClick={() => setTab('schedule')}
        >
          Weekly Schedule
        </button>
        {isAlsoTrainer && (
          <button
            className={`btn ${tab === 'mine' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ padding: '7px 14px', fontSize: 13 }}
            onClick={() => setTab('mine')}
          >
            My Sessions
          </button>
        )}
      </div>

      {tab === 'schedule' ? (
        <WeeklySchedule trainers={trainers} />
      ) : tab === 'mine' ? (
        <MySessions />
      ) : (
        <>
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
                <div className="list-item-sub">
                  {s.scheduled_time} · {s.trainer_name || 'Unassigned'}
                  {s.backup_trainer_name && ` · Backup: ${s.backup_trainer_name}`}
                  {` · Zoom: ${s.zoom_link ? 'Set' : 'Not set'}`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => openAssign(s)} style={{ color: 'var(--primary)', fontSize: 12, padding: '4px 8px', background: 'none', border: 'none', cursor: 'pointer' }}>Assign</button>
                <button onClick={() => openBackup(s)} style={{ color: 'var(--primary)', fontSize: 12, padding: '4px 8px', background: 'none', border: 'none', cursor: 'pointer' }}>Backup</button>
                <button onClick={() => openZoom(s)} style={{ color: 'var(--primary)', fontSize: 12, padding: '4px 8px', background: 'none', border: 'none', cursor: 'pointer' }}>Zoom</button>
                <button onClick={() => setDeleteId(s.id)} style={{ color: 'var(--danger)', fontSize: 12, padding: '4px 8px', background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
              </div>
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

      {assignFor && (
        <Modal title="Assign Trainer" onClose={() => setAssignFor(null)}>
          <form onSubmit={submitAssign}>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 8 }}>
              {assignFor.title} · {assignFor.scheduled_date} at {assignFor.scheduled_time}
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 16 }}>
              This only changes the trainer for this one session. To change who's assigned by default for every future {assignFor.scheduled_time} session, use the Weekly Schedule tab or the trainer's Default Sessions on the Trainers screen.
            </p>
            <div className="form-group">
              <label className="label" htmlFor="assign-trainer">Trainer</label>
              <select id="assign-trainer" className="input" value={assignTrainerId} onChange={e => setAssignTrainerId(e.target.value)}>
                <option value="">Select a trainer</option>
                {trainers.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            {assignError && <p className="error-text" style={{ marginBottom: 12 }}>{assignError}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setAssignFor(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={assignSubmitting}>
                {assignSubmitting ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {backupFor && (
        <Modal title="Assign Backup Trainer" onClose={() => setBackupFor(null)}>
          <form onSubmit={submitBackup}>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
              {backupFor.title} · {backupFor.scheduled_date} at {backupFor.scheduled_time} · Assigned to {backupFor.trainer_name || 'Unassigned'}
            </p>
            <div className="form-group">
              <label className="label" htmlFor="backup-trainer">Backup Trainer</label>
              <select id="backup-trainer" className="input" value={backupTrainerId} onChange={e => setBackupTrainerId(e.target.value)}>
                <option value="">No Backup</option>
                {trainers.filter(t => t.id !== backupFor.assigned_trainer_id).map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            {backupError && <p className="error-text" style={{ marginBottom: 12 }}>{backupError}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setBackupFor(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={backupSubmitting}>
                {backupSubmitting ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {zoomFor && (
        <Modal title="Session Zoom Link" onClose={() => setZoomFor(null)}>
          <form onSubmit={submitZoom}>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 8 }}>
              {zoomFor.title} · {zoomFor.scheduled_date} at {zoomFor.scheduled_time}
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 16 }}>
              This only changes the Zoom Link for this one session. To change the default for every future {zoomFor.scheduled_time} session, use the Weekly Schedule tab.
            </p>
            <div className="form-group">
              <label className="label" htmlFor="zoom-link">Zoom Link</label>
              <input id="zoom-link" className="input" type="url" value={zoomLinkValue} onChange={e => setZoomLinkValue(e.target.value)} placeholder="https://…" />
            </div>
            {zoomError && <p className="error-text" style={{ marginBottom: 12 }}>{zoomError}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setZoomFor(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={zoomSubmitting}>
                {zoomSubmitting ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </Modal>
      )}
      </>
      )}
    </div>
  );
}
