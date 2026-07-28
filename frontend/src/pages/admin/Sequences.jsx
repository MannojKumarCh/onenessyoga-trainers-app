import { useState, useEffect, useCallback } from 'react';
import client from '../../api/client';
import { format, startOfWeek } from 'date-fns';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { getApiErrorMessage } from '../../utils/apiError';
import { ExclamationTriangleIcon, QueueListIcon, PlusIcon } from '@heroicons/react/24/outline';
import usePolling from '../../hooks/usePolling';
import { useToast } from '../../context/ToastContext';

export default function AdminSequences() {
  const [sequences, setSequences] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState('');
  const [trainers, setTrainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ scheduled_date: '', topic: '', assigned_trainer_id: '', instructions: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notifying, setNotifying] = useState(false);
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [deleteId, setDeleteId] = useState(null);

  const { showToast } = useToast();

  function getWeekStart(dateStr) {
    return format(startOfWeek(new Date(dateStr), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  }

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    const q = selectedWeek ? `?week=${selectedWeek}` : '';
    client.get(`/sequences${q}`).then(r => setSequences(r.data)).catch(() => setLoadError(true)).finally(() => setLoading(false));
  }, [selectedWeek]);

  useEffect(() => {
    Promise.all([client.get('/sequences/weeks'), client.get('/users/trainers')]).then(([w, t]) => {
      setWeeks(w.data);
      setTrainers(t.data);
      if (w.data.length > 0) setSelectedWeek(w.data[0]);
      else setLoading(false);
    }).catch(() => { setLoadError(true); setLoading(false); });
  }, []);

  useEffect(() => { if (!selectedWeek) return; load(); }, [selectedWeek, load]);
  usePolling(load, 30000);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const assignedTrainerId = Number(form.assigned_trainer_id);
      if (!Number.isInteger(assignedTrainerId) || assignedTrainerId <= 0) {
        setError('Please select a valid trainer.');
        return;
      }

      const week_start_date = getWeekStart(form.scheduled_date);
      await client.post('/sequences', { ...form, assigned_trainer_id: assignedTrainerId, week_start_date });
      showToast('Sequence Saved Successfully');
      setShowForm(false);
      setForm({ scheduled_date: '', topic: '', assigned_trainer_id: '', instructions: '' });
      if (!weeks.includes(week_start_date)) setWeeks([week_start_date, ...weeks]);
      setSelectedWeek(week_start_date);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to save sequence'));
    } finally {
      setSubmitting(false);
    }
  }

  async function notifyWeek() {
    setNotifying(true);
    setNotice({ type: '', text: '' });
    try {
      await client.post('/sequences/notify-week', { week_start_date: selectedWeek });
      showToast('Trainers Notified');
      setNotice({ type: 'success', text: 'Trainers notified!' });
    } catch (err) {
      setNotice({ type: 'error', text: getApiErrorMessage(err, 'Failed to notify trainers') });
    } finally {
      setNotifying(false);
    }
  }

  async function deleteSeq(id) {
    setDeleteId(null);
    try {
      await client.delete(`/sequences/${id}`);
      showToast('Sequence Deleted');
      setNotice({ type: 'success', text: 'Sequence deleted.' });
      load();
    } catch (err) {
      setNotice({ type: 'error', text: getApiErrorMessage(err, 'Failed to delete sequence') });
    }
  }

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="page-title">Sequences</h1>
        <button className="btn btn-primary" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowForm(true)}><PlusIcon style={{ width: 16, height: 16 }} /> Add Sequence</button>
      </div>

      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 12 }}>
        {weeks.map(w => (
          <button key={w} onClick={() => setSelectedWeek(w)} style={{
            padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
            background: selectedWeek === w ? 'var(--primary)' : 'var(--white)',
            color: selectedWeek === w ? '#fff' : 'var(--text)',
            border: '1.5px solid ' + (selectedWeek === w ? 'var(--primary)' : 'var(--border)'),
            cursor: 'pointer'
          }}>
            {format(new Date(w), 'd MMM')}
          </button>
        ))}
      </div>

      {selectedWeek && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Week of {format(new Date(selectedWeek), 'd MMM yyyy')}
          </span>
          <button className="btn btn-outline" style={{ fontSize: 13, padding: '6px 14px' }} onClick={notifyWeek} disabled={notifying}>
            {notifying ? 'Notifying…' : 'Notify Trainers'}
          </button>
        </div>
      )}

      {notice.text && (
        <p
          style={{
            color: notice.type === 'error' ? 'var(--danger)' : 'var(--success)',
            fontWeight: 600,
            marginBottom: 12,
            textAlign: 'center'
          }}
        >
          {notice.text}
        </p>
      )}

      {loading ? <div className="loading">Loading…</div> : loadError ? (
        <div className="empty-state"><div className="empty-state-icon"><ExclamationTriangleIcon style={{ width: 20, height: 20 }} /></div><p>Couldn't load sequences. Please try again.</p></div>
      ) : sequences.length === 0 ? (
        <div className="empty-state"><div style={{ display: 'flex', justifyContent: 'center', margin: '0 auto 12px' }}><QueueListIcon style={{ width: 48, height: 48, color: 'var(--text-secondary)' }} /></div><p>No sequences this week</p></div>
      ) : sequences.map(seq => (
        <div key={seq.id} className="list-item">
          <div className="list-item-left">
            <span style={{ fontSize: 11, fontWeight: 700, color: seq.status === 'uploaded' ? 'var(--success)' : 'var(--primary)', textTransform: 'uppercase' }}>{seq.status}</span>
            <div className="list-item-title">{seq.topic}</div>
            <div className="list-item-sub">{format(new Date(seq.scheduled_date), 'EEE, d MMM')} · {seq.trainer_name}</div>
          </div>
          <button onClick={() => setDeleteId(seq.id)} style={{ color: 'var(--danger)', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
        </div>
      ))}

      {showForm && (
        <Modal title="Add Sequence" onClose={() => setShowForm(false)}>
            <form onSubmit={submit}>
              <div className="form-group">
                <label className="label" htmlFor="admin-seq-date">Date</label>
                <input id="admin-seq-date" className="input" type="date" value={form.scheduled_date} onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="label" htmlFor="admin-seq-topic">Topic</label>
                <input id="admin-seq-topic" className="input" value={form.topic} placeholder="e.g. Surya Namaskar + Yoga" onChange={e => setForm(f => ({ ...f, topic: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="label" htmlFor="admin-seq-trainer">Assign Trainer</label>
                <select id="admin-seq-trainer" className="input" value={form.assigned_trainer_id} onChange={e => setForm(f => ({ ...f, assigned_trainer_id: e.target.value }))} required>
                  <option value="">Select trainer…</option>
                  {trainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="label" htmlFor="admin-seq-instructions">Instructions (Optional)</label>
                <textarea id="admin-seq-instructions" className="input" rows={3} value={form.instructions} onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))} />
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
          title="Delete Sequence"
          message="Delete this sequence?"
          confirmLabel="Delete"
          danger
          onCancel={() => setDeleteId(null)}
          onConfirm={() => deleteSeq(deleteId)}
        />
      )}
    </div>
  );
}
